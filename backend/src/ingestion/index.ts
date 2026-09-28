import {
  GitHubActivitySchema,
  RepositoryScopeApplyResultSchema,
  type GitHubActivity,
  type IngestionResult,
  type RepositoryScopeApplyResult,
  type RepositorySyncResult,
} from "@leadboard/contracts";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../db/index.js";

export async function applyRepositoryScope(pool: Pool, scope: RepositorySyncResult): Promise<RepositoryScopeApplyResult> {
  return withTransaction(async (client) => {
    const groups = new Map<string, string>();
    for (const repository of scope.trackedRepositories) {
      if (!groups.has(repository.group)) {
        const result = await client.query<{ id: string }>(
          `INSERT INTO groups (name) VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET updated_at = now()
           RETURNING id`,
          [repository.group],
        );
        groups.set(repository.group, result.rows[0]!.id);
      }
      await client.query(
        `INSERT INTO repositories (
           github_id, node_id, owner, name, full_name, default_branch,
           group_id, html_url, archived, tracked, last_synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
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
          repository.githubId, repository.nodeId, repository.owner, repository.name,
          repository.fullName, repository.defaultBranch, groups.get(repository.group),
          repository.htmlUrl, repository.archived, scope.syncedAt,
        ],
      );
    }

    const ids = scope.trackedRepositories.map((repository) => repository.githubId);
    const untracked = await client.query(
      `UPDATE repositories
       SET tracked = FALSE, updated_at = now()
       WHERE tracked = TRUE AND NOT (github_id::text = ANY($1::text[]))`,
      [ids],
    );
    return RepositoryScopeApplyResultSchema.parse({
      tracked: ids.length,
      untracked: untracked.rowCount ?? 0,
      upserted: ids.length,
    });
  });
}

export async function ingestRepositoryActivities(
  client: PoolClient,
  repositoryGithubId: string,
  input: readonly GitHubActivity[],
): Promise<IngestionResult> {
  const repository = await client.query<{ id: string }>(
    "SELECT id FROM repositories WHERE github_id = $1 AND tracked = TRUE",
    [repositoryGithubId],
  );
  if (!repository.rows[0]) throw new Error(`Tracked repository ${repositoryGithubId} is missing from the database`);
  const repositoryId = repository.rows[0].id;
  const result: IngestionResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const item of input) {
    const activity = GitHubActivitySchema.parse(item);
    if (activity.repositoryGithubId !== repositoryGithubId) {
      throw new Error("Activity repository ID does not match the ingestion batch");
    }
    const contributorId = await upsertContributor(client, activity);
    const queryResult = activity.kind === "commit"
      ? await client.query<{ inserted: boolean }>(
        `INSERT INTO commits (
           repository_id, sha, contributor_id, authored_at, additions,
           deletions, is_merge, html_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (repository_id, sha) DO UPDATE SET
           contributor_id = EXCLUDED.contributor_id,
           authored_at = EXCLUDED.authored_at,
           additions = EXCLUDED.additions,
           deletions = EXCLUDED.deletions,
           is_merge = EXCLUDED.is_merge,
           html_url = EXCLUDED.html_url
         RETURNING (xmax = 0) AS inserted`,
        [repositoryId, activity.externalId, contributorId, activity.occurredAt,
          activity.additions, activity.deletions, activity.isMerge, activity.rawUrl],
      )
      : activity.kind === "pull_request"
        ? await client.query<{ inserted: boolean }>(
          `INSERT INTO pull_requests (
             repository_id, github_id, number, contributor_id, state,
             created_at, closed_at, merged_at, html_url
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (repository_id, github_id) DO UPDATE SET
             number = EXCLUDED.number,
             contributor_id = EXCLUDED.contributor_id,
             state = EXCLUDED.state,
             created_at = EXCLUDED.created_at,
             closed_at = EXCLUDED.closed_at,
             merged_at = EXCLUDED.merged_at,
             html_url = EXCLUDED.html_url,
             ingested_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [repositoryId, activity.externalId, activity.number, contributorId, activity.state,
            activity.occurredAt, activity.closedAt, activity.mergedAt, activity.rawUrl],
        )
        : await client.query<{ inserted: boolean }>(
          `INSERT INTO issues (
             repository_id, github_id, number, contributor_id, state,
             created_at, closed_at, html_url
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (repository_id, github_id) DO UPDATE SET
             number = EXCLUDED.number,
             contributor_id = EXCLUDED.contributor_id,
             state = EXCLUDED.state,
             created_at = EXCLUDED.created_at,
             closed_at = EXCLUDED.closed_at,
             html_url = EXCLUDED.html_url,
             ingested_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [repositoryId, activity.externalId, activity.number, contributorId, activity.state,
            activity.occurredAt, activity.closedAt, activity.rawUrl],
        );
    if (queryResult.rows[0]?.inserted) result.inserted += 1;
    else result.updated += 1;
  }
  return result;
}

async function upsertContributor(client: PoolClient, activity: GitHubActivity): Promise<string | null> {
  const { actor } = activity;
  if (!actor.githubId && !actor.login) return null;
  const login = actor.login?.toLowerCase();
  const isBot = actor.type === "Bot" || login?.endsWith("[bot]") === true || login === "miss-islington";
  const fields = [actor.login, actor.avatarUrl, actor.type, isBot];
  if (actor.githubId) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO contributors (github_id, login, avatar_url, actor_type, is_bot)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (github_id) DO UPDATE SET
         login = COALESCE(EXCLUDED.login, contributors.login),
         avatar_url = COALESCE(EXCLUDED.avatar_url, contributors.avatar_url),
         actor_type = EXCLUDED.actor_type,
         is_bot = contributors.is_bot OR EXCLUDED.is_bot,
         updated_at = now()
       RETURNING id`,
      [actor.githubId, ...fields],
    );
    return result.rows[0]!.id;
  }

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM contributors
     WHERE github_id IS NULL AND lower(login) = lower($1)
     ORDER BY id LIMIT 1`,
    [actor.login],
  );
  if (existing.rows[0]) {
    const result = await client.query<{ id: string }>(
      `UPDATE contributors SET
         login = $2,
         avatar_url = COALESCE($3, avatar_url),
         actor_type = $4,
         is_bot = is_bot OR $5,
         updated_at = now()
       WHERE id = $1 RETURNING id`,
      [existing.rows[0].id, ...fields],
    );
    return result.rows[0]!.id;
  }
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO contributors (login, avatar_url, actor_type, is_bot)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    fields,
  );
  return inserted.rows[0]!.id;
}
