import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { GitHubActivity, RepositorySyncResult } from "@leadboard/contracts";
import { getDbPool } from "../src/db/index.js";
import { applyRepositoryScope, ingestActivities } from "../src/ingestion/index.js";

const pool = getDbPool();
const syncedAt = "2026-09-25T12:00:00.000Z";

const repoA = {
  githubId: "1001", nodeId: "R_repo_a", owner: "leadboard-fixture", name: "repo-a",
  fullName: "leadboard-fixture/repo-a", defaultBranch: "main", group: "systems",
  htmlUrl: "https://github.com/leadboard-fixture/repo-a", archived: false,
};
const repoB = {
  githubId: "1002", nodeId: "R_repo_b", owner: "leadboard-fixture", name: "repo-b",
  fullName: "leadboard-fixture/repo-b", defaultBranch: "main", group: "ai",
  htmlUrl: "https://github.com/leadboard-fixture/repo-b", archived: false,
};
const alice = { githubId: "2001", login: "alice", avatarUrl: "https://example.test/alice.png", type: "User" as const };
const bot = { githubId: "2003", login: "dependency-bot[bot]", avatarUrl: "https://example.test/bot.png", type: "Bot" as const };
const unknown = { githubId: null, login: null, avatarUrl: null, type: "Unknown" as const };

beforeAll(async () => {
  await pool.query("TRUNCATE commits, pull_requests, issues, contributors, repositories, groups, sync_runs RESTART IDENTITY CASCADE");
});
afterAll(async () => { await pool.end(); });

describe("Activity ingestion integration", () => {
  it("applies complete repository scope, detects bots and replays idempotently", async () => {
    const scope: RepositorySyncResult = { trackedRepositories: [repoA, repoB], syncedAt };
    const applied = await applyRepositoryScope(scope);
    expect(applied).toEqual({ tracked: 2, untracked: 0, upserted: 2 });

    const activities: GitHubActivity[] = [
      {
        kind: "commit", repositoryGithubId: "1001", externalId: "sha-1", actor: alice,
        occurredAt: "2026-09-24T10:00:00.000Z", additions: 10, deletions: 2, isMerge: false,
        rawUrl: "https://github.com/leadboard-fixture/repo-a/commit/sha-1",
      },
      {
        kind: "commit", repositoryGithubId: "1001", externalId: "sha-unknown", actor: unknown,
        occurredAt: "2026-09-22T10:00:00.000Z", additions: 1, deletions: 0, isMerge: false, rawUrl: null,
      },
      {
        kind: "pull_request", repositoryGithubId: "1001", externalId: "3001", number: 10, actor: alice,
        occurredAt: "2026-09-20T10:00:00.000Z", state: "merged",
        closedAt: "2026-09-21T10:00:00.000Z", mergedAt: "2026-09-21T10:00:00.000Z",
        rawUrl: "https://github.com/leadboard-fixture/repo-a/pull/10",
      },
      {
        kind: "issue", repositoryGithubId: "1002", externalId: "4001", number: 20, actor: bot,
        occurredAt: "2026-09-24T09:00:00.000Z", state: "open", closedAt: null,
        rawUrl: "https://github.com/leadboard-fixture/repo-b/issues/20",
      },
    ];

    expect(await ingestActivities(activities)).toEqual({ inserted: 4, updated: 0, skipped: 0, errors: 0 });
    expect(await ingestActivities(activities)).toEqual({ inserted: 0, updated: 0, skipped: 4, errors: 0 });

    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM commits) AS commits,
      (SELECT count(*)::int FROM pull_requests) AS prs,
      (SELECT count(*)::int FROM issues) AS issues`);
    expect(counts.rows[0]).toMatchObject({ commits: 2, prs: 1, issues: 1 });

    const actors = await pool.query("SELECT login, is_bot FROM contributors ORDER BY login");
    expect(actors.rows).toEqual([
      { login: "alice", is_bot: false },
      { login: "dependency-bot[bot]", is_bot: true },
    ]);
    const unknownCommit = await pool.query("SELECT contributor_id FROM commits WHERE sha='sha-unknown'");
    expect(unknownCommit.rows[0]?.contributor_id).toBeNull();
  });

  it("keeps repository identity across rename and untracks repositories missing from a full scope", async () => {
    const renamed = { ...repoA, name: "repo-a-renamed", fullName: "leadboard-fixture/repo-a-renamed" };
    const result = await applyRepositoryScope({ trackedRepositories: [renamed], syncedAt });
    expect(result.untracked).toBe(1);

    const rows = await pool.query("SELECT github_id::text, full_name, tracked FROM repositories ORDER BY github_id");
    expect(rows.rows).toEqual([
      { github_id: "1001", full_name: "leadboard-fixture/repo-a-renamed", tracked: true },
      { github_id: "1002", full_name: "leadboard-fixture/repo-b", tracked: false },
    ]);
  });

  it("rolls back the whole activity batch when a later write fails", async () => {
    const before = await pool.query<{ count: string }>("SELECT count(*) AS count FROM commits");
    const batch: GitHubActivity[] = [
      {
        kind: "commit", repositoryGithubId: "1001", externalId: "rollback-sha", actor: alice,
        occurredAt: "2026-09-24T12:00:00.000Z", additions: 1, deletions: 1, isMerge: false, rawUrl: null,
      },
      {
        kind: "commit", repositoryGithubId: "999999", externalId: "bad-repo", actor: alice,
        occurredAt: "2026-09-24T12:00:00.000Z", additions: 1, deletions: 1, isMerge: false, rawUrl: null,
      },
    ];
    await expect(ingestActivities(batch)).rejects.toThrow(/Repository scope missing/);
    const after = await pool.query<{ count: string }>("SELECT count(*) AS count FROM commits");
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
