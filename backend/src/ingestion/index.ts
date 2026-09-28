import {
  IngestionResultSchema,
  RepositoryScopeApplyResultSchema,
  type GitHubActivity,
  type GitHubActorRef,
  type IngestionResult,
  type RepositoryScopeApplyResult,
  type RepositorySyncResult,
} from "@leadboard/contracts";
import type { PoolClient } from "pg";
import { withTransaction } from "../db/index.js";

function isBot(actor: GitHubActorRef): boolean {
  return actor.type === "Bot" || actor.login?.toLowerCase().endsWith("[bot]") === true;
}

async function upsertContributor(client: PoolClient, actor: GitHubActorRef): Promise<string | null> {
  if (actor.type === "Unknown" && actor.githubId === null && actor.login === null) return null;

  const bot = isBot(actor);
  if (actor.githubId !== null) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO contributors (github_id, login, avatar_url, actor_type, is_bot, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (github_id) DO UPDATE SET
         login = EXCLUDED.login,
         avatar_url = EXCLUDED.avatar_url,
         actor_type = EXCLUDED.actor_type,
         is_bot = EXCLUDED.is_bot,
         updated_at = now()
       RETURNING id`,
      [actor.githubId, actor.login, actor.avatarUrl, actor.type, bot],
    );
    return result.rows[0]?.id ?? null;
  }

  if (actor.login === null) return null;
  const existing = await client.query<{ id: string }>(
    "SELECT id FROM contributors WHERE github_id IS NULL AND login = $1 ORDER BY id LIMIT 1",
    [actor.login],
  );
  if (existing.rows[0]?.id) {
    await client.query(
      `UPDATE contributors SET avatar_url = $2, actor_type = $3, is_bot = $4, updated_at = now()
       WHERE id = $1`,
      [existing.rows[0].id, actor.avatarUrl, actor.type, bot],
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO contributors (github_id, login, avatar_url, actor_type, is_bot)
     VALUES (NULL, $1, $2, $3, $4) RETURNING id`,
    [actor.login, actor.avatarUrl, actor.type, bot],
  );
  return inserted.rows[0]?.id ?? null;
}

export async function applyRepositoryScope(scope: RepositorySyncResult): Promise<RepositoryScopeApplyResult> {
  return withTransaction(async (client) => {
    let upserted = 0;
    const currentIds: string[] = [];

    for (const repo of scope.trackedRepositories) {
      const group = await client.query<{ id: string }>(
        `INSERT INTO groups (name, updated_at) VALUES ($1, now())
         ON CONFLICT (name) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [repo.group],
      );
      const groupId = group.rows[0]?.id;
      if (!groupId) throw new Error("Failed to upsert repository group");

      await client.query(
        `INSERT INTO repositories
          (github_id, node_id, owner, name, full_name, default_branch, group_id, html_url, archived, tracked, last_synced_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,now())
         ON CONFLICT (github_id) DO UPDATE SET
           node_id = EXCLUDED.node_id,
           owner = EXCLUDED.owner,
           name = EXCLUDED.name,
           full_name = EXCLUDED.full_name,
           default_branch = EXCLUDED.default_branch,
           group_id = EXCLUDED.group_id,
           html_url = EXCLUDED.html_url,
           archived = EXCLUDED.archived,
           tracked = TRUE,
           last_synced_at = EXCLUDED.last_synced_at,
           updated_at = now()`,
        [
          repo.githubId, repo.nodeId, repo.owner, repo.name, repo.fullName,
          repo.defaultBranch, groupId, repo.htmlUrl, repo.archived, scope.syncedAt,
        ],
      );
      currentIds.push(repo.githubId);
      upserted++;
    }

    const untracked = await client.query<{ id: string }>(
      `UPDATE repositories
       SET tracked = FALSE, updated_at = now()
       WHERE tracked = TRUE
         AND NOT (github_id = ANY($1::bigint[]))
       RETURNING id`,
      [currentIds],
    );

    return RepositoryScopeApplyResultSchema.parse({
      tracked: currentIds.length,
      untracked: untracked.rowCount ?? untracked.rows.length,
      upserted,
    });
  });
}

async function repositoryId(client: PoolClient, githubId: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(githubId);
  if (cached) return cached;
  const result = await client.query<{ id: string }>(
    "SELECT id FROM repositories WHERE github_id = $1",
    [githubId],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Repository scope missing GitHub repository ${githubId}`);
  cache.set(githubId, id);
  return id;
}

function classify(rows: { inserted: boolean }[], counters: IngestionResult): void {
  if (rows.length === 0) counters.skipped++;
  else if (rows[0]?.inserted) counters.inserted++;
  else counters.updated++;
}

export async function ingestActivities(activities: GitHubActivity[]): Promise<IngestionResult> {
  return withTransaction(async (client) => {
    const counters: IngestionResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
    const repositoryCache = new Map<string, string>();

    for (const activity of activities) {
      const repoId = await repositoryId(client, activity.repositoryGithubId, repositoryCache);
      const contributorId = await upsertContributor(client, activity.actor);

      if (activity.kind === "commit") {
        const result = await client.query<{ inserted: boolean }>(
          `INSERT INTO commits
            (repository_id, sha, contributor_id, authored_at, additions, deletions, is_merge, html_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (repository_id, sha) DO UPDATE SET
             contributor_id = EXCLUDED.contributor_id,
             authored_at = EXCLUDED.authored_at,
             additions = EXCLUDED.additions,
             deletions = EXCLUDED.deletions,
             is_merge = EXCLUDED.is_merge,
             html_url = EXCLUDED.html_url
           WHERE (commits.contributor_id, commits.authored_at, commits.additions, commits.deletions, commits.is_merge, commits.html_url)
             IS DISTINCT FROM
             (EXCLUDED.contributor_id, EXCLUDED.authored_at, EXCLUDED.additions, EXCLUDED.deletions, EXCLUDED.is_merge, EXCLUDED.html_url)
           RETURNING (xmax = 0) AS inserted`,
          [
            repoId, activity.externalId, contributorId, activity.occurredAt,
            activity.additions, activity.deletions, activity.isMerge, activity.rawUrl,
          ],
        );
        classify(result.rows, counters);
        continue;
      }

      if (activity.kind === "pull_request") {
        const result = await client.query<{ inserted: boolean }>(
          `INSERT INTO pull_requests
            (repository_id, github_id, number, contributor_id, state, created_at, closed_at, merged_at, html_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (repository_id, github_id) DO UPDATE SET
             number = EXCLUDED.number,
             contributor_id = EXCLUDED.contributor_id,
             state = EXCLUDED.state,
             created_at = EXCLUDED.created_at,
             closed_at = EXCLUDED.closed_at,
             merged_at = EXCLUDED.merged_at,
             html_url = EXCLUDED.html_url,
             ingested_at = now()
           WHERE (pull_requests.number, pull_requests.contributor_id, pull_requests.state, pull_requests.created_at,
                  pull_requests.closed_at, pull_requests.merged_at, pull_requests.html_url)
             IS DISTINCT FROM
             (EXCLUDED.number, EXCLUDED.contributor_id, EXCLUDED.state, EXCLUDED.created_at,
              EXCLUDED.closed_at, EXCLUDED.merged_at, EXCLUDED.html_url)
           RETURNING (xmax = 0) AS inserted`,
          [
            repoId, activity.externalId, activity.number, contributorId, activity.state,
            activity.occurredAt, activity.closedAt, activity.mergedAt, activity.rawUrl,
          ],
        );
        classify(result.rows, counters);
        continue;
      }

      const result = await client.query<{ inserted: boolean }>(
        `INSERT INTO issues
          (repository_id, github_id, number, contributor_id, state, created_at, closed_at, html_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (repository_id, github_id) DO UPDATE SET
           number = EXCLUDED.number,
           contributor_id = EXCLUDED.contributor_id,
           state = EXCLUDED.state,
           created_at = EXCLUDED.created_at,
           closed_at = EXCLUDED.closed_at,
           html_url = EXCLUDED.html_url,
           ingested_at = now()
         WHERE (issues.number, issues.contributor_id, issues.state, issues.created_at, issues.closed_at, issues.html_url)
           IS DISTINCT FROM
           (EXCLUDED.number, EXCLUDED.contributor_id, EXCLUDED.state, EXCLUDED.created_at, EXCLUDED.closed_at, EXCLUDED.html_url)
         RETURNING (xmax = 0) AS inserted`,
        [
          repoId, activity.externalId, activity.number, contributorId, activity.state,
          activity.occurredAt, activity.closedAt, activity.rawUrl,
        ],
      );
      classify(result.rows, counters);
    }

    return IngestionResultSchema.parse(counters);
  });
}
