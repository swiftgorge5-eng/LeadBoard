import {
  ActivityTrendResponseSchema,
  ContributorDetailSchema,
  ContributorLeaderboardResponseSchema,
  GroupsResponseSchema,
  OrganizationSummarySchema,
  RepositoryStatsResponseSchema,
  SyncStatusSchema,
  type ActivityTrendResponse,
  type ContributorDetail,
  type ContributorLeaderboardResponse,
  type GroupsResponse,
  type LeaderboardMetric,
  type OrganizationSummary,
  type RepositoryStatsResponse,
  type SyncStatus,
  type TimeRange,
} from "@leadboard/contracts";
import type { Pool } from "pg";
import { groupLabel } from "../repositories/groups.js";

interface RangeBounds {
  from: string | null;
  to: string;
}

function bounds(range: TimeRange, now = new Date()): RangeBounds {
  const to = now.toISOString();
  if (range === "all") return { from: null, to };
  const days = Number.parseInt(range, 10);
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to };
}

/** Every row in `events` is one GitHub activity action. A PR/issue close counts
 * as a second action, matching the HUST board's opened + closed convention. */
const EVENTS_CTE = `
  WITH scope_repositories AS (
    SELECT r.id, r.github_id, r.full_name, COALESCE(g.name, 'ungrouped') AS group_name
    FROM repositories r
    LEFT JOIN groups g ON g.id = r.group_id
    WHERE r.tracked = TRUE AND ($3::text IS NULL OR g.name = $3)
  ),
  events AS (
    SELECT r.id AS repository_id, c.contributor_id, 'commit'::text AS kind, c.authored_at AS happened_at
    FROM commits c JOIN scope_repositories r ON r.id = c.repository_id
    WHERE ($1::timestamptz IS NULL OR c.authored_at >= $1) AND c.authored_at < $2
    UNION ALL
    SELECT r.id, p.contributor_id, 'pr'::text, p.created_at
    FROM pull_requests p JOIN scope_repositories r ON r.id = p.repository_id
    WHERE ($1::timestamptz IS NULL OR p.created_at >= $1) AND p.created_at < $2
    UNION ALL
    SELECT r.id, p.contributor_id, 'pr'::text, p.closed_at
    FROM pull_requests p JOIN scope_repositories r ON r.id = p.repository_id
    WHERE p.closed_at IS NOT NULL AND ($1::timestamptz IS NULL OR p.closed_at >= $1) AND p.closed_at < $2
    UNION ALL
    SELECT r.id, i.contributor_id, 'issue'::text, i.created_at
    FROM issues i JOIN scope_repositories r ON r.id = i.repository_id
    WHERE ($1::timestamptz IS NULL OR i.created_at >= $1) AND i.created_at < $2
    UNION ALL
    SELECT r.id, i.contributor_id, 'issue'::text, i.closed_at
    FROM issues i JOIN scope_repositories r ON r.id = i.repository_id
    WHERE i.closed_at IS NOT NULL AND ($1::timestamptz IS NULL OR i.closed_at >= $1) AND i.closed_at < $2
  )`;

export async function getGroups(pool: Pool): Promise<GroupsResponse> {
  const result = await pool.query<{ name: string }>(
    `SELECT DISTINCT g.name FROM groups g
     JOIN repositories r ON r.group_id = g.id
     WHERE r.tracked = TRUE ORDER BY g.name`,
  );
  return GroupsResponseSchema.parse({ items: result.rows.map(({ name }) => ({ name, label: groupLabel(name) })) });
}

export async function getOrganizationSummary(pool: Pool, range: TimeRange, dataStaleAfterHours = 12, now = new Date()): Promise<OrganizationSummary> {
  const values = [...Object.values(bounds(range, now)), null];
  const result = await pool.query<Record<string, string | number>>(
    `${EVENTS_CTE}
     SELECT
       (SELECT count(*) FROM scope_repositories)::bigint AS repositories,
       count(DISTINCT c.id) FILTER (WHERE c.is_bot = FALSE AND c.login IS NOT NULL)::bigint AS contributors,
       count(*) FILTER (WHERE e.kind = 'commit')::bigint AS commits,
       count(*) FILTER (WHERE e.kind = 'pr')::bigint AS prs,
       count(*) FILTER (WHERE e.kind = 'issue')::bigint AS issues,
       count(*)::bigint AS total
     FROM events e LEFT JOIN contributors c ON c.id = e.contributor_id`,
    values,
  );
  const freshness = await getSyncStatus(pool, dataStaleAfterHours, null, now);
  const row = result.rows[0]!;
  return OrganizationSummarySchema.parse({
    range, repositories: numberValue(row.repositories), contributors: numberValue(row.contributors),
    commits: numberValue(row.commits), prs: numberValue(row.prs), issues: numberValue(row.issues),
    total: numberValue(row.total), lastUpdatedAt: freshness.lastSuccessfulRunAt,
    dataStatus: freshness.dataStatus,
  });
}

export async function getRepositoryStats(
  pool: Pool,
  range: TimeRange,
  group?: string,
  now = new Date(),
): Promise<RepositoryStatsResponse> {
  const result = await pool.query<Record<string, string | number>>(
    `${EVENTS_CTE}
     SELECT sr.github_id::text AS github_id, sr.full_name, sr.group_name,
       count(DISTINCT c.id) FILTER (WHERE c.is_bot = FALSE AND c.login IS NOT NULL)::bigint AS contributors,
       count(*) FILTER (WHERE e.kind = 'commit')::bigint AS commits,
       count(*) FILTER (WHERE e.kind = 'pr')::bigint AS prs,
       count(*) FILTER (WHERE e.kind = 'issue')::bigint AS issues,
       count(e.kind)::bigint AS total
     FROM scope_repositories sr
     LEFT JOIN events e ON e.repository_id = sr.id
     LEFT JOIN contributors c ON c.id = e.contributor_id
     GROUP BY sr.id, sr.github_id, sr.full_name, sr.group_name
     ORDER BY total DESC, sr.full_name ASC`,
    [...Object.values(bounds(range, now)), group ?? null],
  );
  return RepositoryStatsResponseSchema.parse({ items: result.rows.map((row) => ({
    githubId: row.github_id,
    fullName: row.full_name,
    group: groupLabel(String(row.group_name)),
    contributors: numberValue(row.contributors),
    commits: numberValue(row.commits),
    prs: numberValue(row.prs),
    issues: numberValue(row.issues),
    total: numberValue(row.total),
  })) });
}

export async function getContributorLeaderboard(
  pool: Pool,
  input: { range: TimeRange; metric: LeaderboardMetric; group?: string; limit: number },
  now = new Date(),
): Promise<ContributorLeaderboardResponse> {
  const metricColumn: Record<LeaderboardMetric, string> = {
    total: "total", commits: "commits", prs: "prs", issues: "issues",
  };
  const order = metricColumn[input.metric];
  const result = await pool.query<Record<string, string | number | null>>(
    `${EVENTS_CTE},
     ranked AS (
       SELECT c.login, c.avatar_url,
         count(*) FILTER (WHERE e.kind = 'commit')::bigint AS commits,
         count(*) FILTER (WHERE e.kind = 'pr')::bigint AS prs,
         count(*) FILTER (WHERE e.kind = 'issue')::bigint AS issues,
         count(*)::bigint AS total,
         count(DISTINCT (e.happened_at AT TIME ZONE 'UTC')::date)::bigint AS active_days
       FROM events e JOIN contributors c ON c.id = e.contributor_id
       WHERE c.is_bot = FALSE AND c.login IS NOT NULL
       GROUP BY c.id, c.login, c.avatar_url
     )
     SELECT row_number() OVER (ORDER BY ${order} DESC, login ASC)::int AS rank,
       login, avatar_url, commits, prs, issues, total, active_days
     FROM ranked ORDER BY ${order} DESC, login ASC LIMIT $4`,
    [...Object.values(bounds(input.range, now)), input.group ?? null, input.limit],
  );
  return ContributorLeaderboardResponseSchema.parse({
    range: input.range,
    metric: input.metric,
    items: result.rows.map((row) => ({
      rank: numberValue(row.rank), login: row.login!, avatarUrl: row.avatar_url,
      activeDays: numberValue(row.active_days),
      commits: numberValue(row.commits), prs: numberValue(row.prs),
      issues: numberValue(row.issues), total: numberValue(row.total),
    })),
  });
}

export async function getContributorDetail(
  pool: Pool,
  username: string,
  range: TimeRange,
  now = new Date(),
): Promise<ContributorDetail | null> {
  const lookup = await pool.query<{ id: string; login: string; avatar_url: string | null }>(
    `SELECT id, login, avatar_url FROM contributors
     WHERE lower(login) = lower($1) AND is_bot = FALSE ORDER BY id LIMIT 1`,
    [username],
  );
  const contributor = lookup.rows[0];
  if (!contributor) return null;
  const values = [...Object.values(bounds(range, now)), null, contributor.id];
  const total = await pool.query<Record<string, string | number>>(
    `${EVENTS_CTE}
     SELECT count(*) FILTER (WHERE e.kind = 'commit')::bigint AS commits,
       count(*) FILTER (WHERE e.kind = 'pr')::bigint AS prs,
       count(*) FILTER (WHERE e.kind = 'issue')::bigint AS issues,
       count(*)::bigint AS total,
       count(DISTINCT (e.happened_at AT TIME ZONE 'UTC')::date)::bigint AS active_days
     FROM events e WHERE e.contributor_id = $4`,
    values,
  );
  const repositories = await pool.query<Record<string, string | number>>(
    `${EVENTS_CTE}
     SELECT sr.github_id::text AS github_id, sr.full_name, sr.group_name,
       count(*) FILTER (WHERE e.kind = 'commit')::bigint AS commits,
       count(*) FILTER (WHERE e.kind = 'pr')::bigint AS prs,
       count(*) FILTER (WHERE e.kind = 'issue')::bigint AS issues,
       count(*)::bigint AS total
     FROM events e JOIN scope_repositories sr ON sr.id = e.repository_id
     WHERE e.contributor_id = $4
     GROUP BY sr.id, sr.github_id, sr.full_name, sr.group_name
     ORDER BY total DESC, sr.full_name ASC`,
    values,
  );
  const row = total.rows[0]!;
  return ContributorDetailSchema.parse({
    login: contributor.login, avatarUrl: contributor.avatar_url, range,
    activeDays: numberValue(row.active_days),
    commits: numberValue(row.commits), prs: numberValue(row.prs),
    issues: numberValue(row.issues), total: numberValue(row.total),
    repositories: repositories.rows.map((item) => ({
      githubId: item.github_id, fullName: item.full_name, group: groupLabel(String(item.group_name)),
      commits: numberValue(item.commits), prs: numberValue(item.prs),
      issues: numberValue(item.issues), total: numberValue(item.total),
    })),
  });
}

export async function getActivityTrend(
  pool: Pool,
  range: TimeRange,
  group?: string,
  requestedGranularity?: "day" | "month",
  now = new Date(),
): Promise<ActivityTrendResponse> {
  const granularity = requestedGranularity ?? (range === "all" ? "month" : "day");
  const result = await pool.query<Record<string, string | number>>(
    `${EVENTS_CTE}
     SELECT to_char(date_trunc('${granularity}', e.happened_at AT TIME ZONE 'UTC'),
       '${granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM"}') AS date,
       count(*) FILTER (WHERE e.kind = 'commit')::bigint AS commits,
       count(*) FILTER (WHERE e.kind = 'pr')::bigint AS prs,
       count(*) FILTER (WHERE e.kind = 'issue')::bigint AS issues,
       count(*)::bigint AS total
     FROM events e
     GROUP BY date_trunc('${granularity}', e.happened_at AT TIME ZONE 'UTC')
     ORDER BY date_trunc('${granularity}', e.happened_at AT TIME ZONE 'UTC') ASC`,
    [...Object.values(bounds(range, now)), group ?? null],
  );
  return ActivityTrendResponseSchema.parse({
    range, granularity,
    items: result.rows.map((row) => ({
      date: String(row.date), commits: numberValue(row.commits), prs: numberValue(row.prs),
      issues: numberValue(row.issues), total: numberValue(row.total),
    })),
  });
}

export async function getSyncStatus(
  pool: Pool,
  dataStaleAfterHours: number,
  nextScheduledRunAt: Date | null,
  now = new Date(),
): Promise<SyncStatus> {
  const result = await pool.query<{ status: string; finished_at: Date | null }>(
    `SELECT status, finished_at FROM sync_runs
     WHERE status <> 'running' ORDER BY finished_at DESC NULLS LAST, id DESC LIMIT 1`,
  );
  const successful = await pool.query<{ finished_at: Date | null }>(
    `SELECT max(finished_at) AS finished_at FROM sync_runs WHERE status = 'success'`,
  );
  const lastSuccessfulRunAt = successful.rows[0]?.finished_at?.toISOString() ?? null;
  const last = result.rows[0];
  const dataStatus = lastSuccessfulRunAt === null
    ? "missing"
    : now.getTime() - Date.parse(lastSuccessfulRunAt) > dataStaleAfterHours * 3_600_000 ? "stale" : "fresh";
  return SyncStatusSchema.parse({
    lastSuccessfulRunAt,
    lastRunStatus: last?.status === "success" || last?.status === "partial" || last?.status === "failed" ? last.status : null,
    nextScheduledRunAt: nextScheduledRunAt?.toISOString() ?? null,
    dataStatus,
  });
}

function numberValue(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Database aggregate exceeded the supported count range");
  return parsed;
}
