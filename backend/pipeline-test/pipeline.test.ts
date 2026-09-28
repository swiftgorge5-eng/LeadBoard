import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GitHubActivity, RepositorySyncResult } from "@leadboard/contracts";
import { AnalyticsService } from "../src/analytics/index.js";
import { getDbPool } from "../src/db/index.js";
import { applyRepositoryScope, ingestActivities } from "../src/ingestion/index.js";

const pool = getDbPool();
const NOW = new Date("2026-09-25T12:00:00.000Z");
const actor = {
  alice: { githubId: "2001", login: "alice", avatarUrl: "https://example.test/alice.png", type: "User" as const },
  bob: { githubId: "2002", login: "bob", avatarUrl: "https://example.test/bob.png", type: "User" as const },
  bot: { githubId: "2003", login: "dependency-bot[bot]", avatarUrl: "https://example.test/bot.png", type: "Bot" as const },
  unknown: { githubId: null, login: null, avatarUrl: null, type: "Unknown" as const },
  charlie: { githubId: "2004", login: "charlie", avatarUrl: null, type: "User" as const },
};
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
const repoOld = {
  githubId: "1003", nodeId: "R_repo_old", owner: "leadboard-fixture", name: "repo-old",
  fullName: "leadboard-fixture/repo-old", defaultBranch: "main", group: "legacy",
  htmlUrl: "https://github.com/leadboard-fixture/repo-old", archived: false,
};
const syncedAt = NOW.toISOString();

function commit(repo: string, id: string, who: typeof actor[keyof typeof actor], at: string): GitHubActivity {
  return {
    kind: "commit", repositoryGithubId: repo, externalId: id, actor: who,
    occurredAt: at, additions: 1, deletions: 0, isMerge: false, rawUrl: null,
  };
}

beforeAll(async () => {
  await pool.query("TRUNCATE commits, pull_requests, issues, contributors, repositories, groups, sync_runs RESTART IDENTITY CASCADE");
  const scope: RepositorySyncResult = { trackedRepositories: [repoA, repoB, repoOld], syncedAt };
  await applyRepositoryScope(scope);

  const activities: GitHubActivity[] = [
    commit("1001", "C1", actor.alice, "2026-09-24T10:00:00.000Z"),
    { ...commit("1001", "C2", actor.alice, "2026-09-23T10:00:00.000Z"), isMerge: true },
    commit("1001", "C3", actor.bob, "2026-09-10T10:00:00.000Z"),
    commit("1001", "C4", actor.bot, "2026-09-24T11:00:00.000Z"),
    commit("1001", "C5", actor.unknown, "2026-09-22T10:00:00.000Z"),
    commit("1002", "C6", actor.bob, "2026-09-21T10:00:00.000Z"),
    commit("1002", "C7", actor.bob, "2026-08-30T10:00:00.000Z"),
    {
      kind: "pull_request", repositoryGithubId: "1001", externalId: "3001", number: 1, actor: actor.alice,
      occurredAt: "2026-09-20T10:00:00.000Z", state: "merged", closedAt: "2026-09-21T00:00:00.000Z",
      mergedAt: "2026-09-21T00:00:00.000Z", rawUrl: null,
    },
    {
      kind: "pull_request", repositoryGithubId: "1002", externalId: "3002", number: 2, actor: actor.alice,
      occurredAt: "2026-09-05T10:00:00.000Z", state: "open", closedAt: null, mergedAt: null, rawUrl: null,
    },
    {
      kind: "issue", repositoryGithubId: "1001", externalId: "4001", number: 3, actor: actor.bob,
      occurredAt: "2026-09-24T09:00:00.000Z", state: "open", closedAt: null, rawUrl: null,
    },
    {
      kind: "issue", repositoryGithubId: "1002", externalId: "4002", number: 4, actor: actor.bot,
      occurredAt: "2026-09-02T09:00:00.000Z", state: "closed", closedAt: "2026-09-03T00:00:00.000Z", rawUrl: null,
    },
    commit("1003", "OLD1", actor.charlie, "2026-09-24T10:00:00.000Z"),
    commit("1003", "OLD2", actor.charlie, "2026-09-24T11:00:00.000Z"),
    commit("1003", "OLD3", actor.charlie, "2026-09-24T12:00:00.000Z"),
    {
      kind: "pull_request", repositoryGithubId: "1003", externalId: "3999", number: 99, actor: actor.charlie,
      occurredAt: "2026-09-24T10:00:00.000Z", state: "open", closedAt: null, mergedAt: null, rawUrl: null,
    },
  ];
  await ingestActivities(activities);
  await applyRepositoryScope({ trackedRepositories: [repoA, repoB], syncedAt });
});

afterAll(async () => { await pool.end(); });

describe("Analytics pipeline fixture", () => {
  const analytics = new AnalyticsService(pool, () => NOW);

  it("matches canonical 30d organization and repository totals", async () => {
    await expect(analytics.getOrganizationActivitySummary("30d")).resolves.toEqual({
      range: "30d", repositories: 2, contributors: 2, commits: 7, prs: 2, issues: 2, total: 11,
    });
    const repositories = await analytics.getRepositoryStats("30d");
    expect(repositories).toEqual([
      { githubId: "1001", fullName: "leadboard-fixture/repo-a", group: "systems", commits: 5, prs: 1, issues: 1, contributors: 2, total: 7 },
      { githubId: "1002", fullName: "leadboard-fixture/repo-b", group: "ai", commits: 2, prs: 1, issues: 1, contributors: 2, total: 4 },
    ]);
  });

  it("uses [from,to), excludes bots/unknown/untracked from contributor ranking, and has stable ties", async () => {
    await expect(analytics.getOrganizationActivitySummary("7d")).resolves.toMatchObject({
      commits: 5, prs: 1, issues: 1, total: 7, contributors: 2, repositories: 2,
    });
    const ranking = await analytics.getContributorLeaderboard({ range: "30d", metric: "total", limit: 50 });
    expect(ranking.map(({ rank, login, total }) => ({ rank, login, total }))).toEqual([
      { rank: 1, login: "alice", total: 4 },
      { rank: 2, login: "bob", total: 4 },
    ]);
  });

  it("supports group filtering and contributor detail", async () => {
    const systems = await analytics.getRepositoryStats("30d", "systems");
    expect(systems).toHaveLength(1);
    expect(systems[0]?.fullName).toBe("leadboard-fixture/repo-a");

    const alice = await analytics.getContributorDetail("alice", "30d");
    expect(alice).toMatchObject({ login: "alice", commits: 2, prs: 2, issues: 0, total: 4 });
    expect(alice?.repositories).toHaveLength(2);
    await expect(analytics.getContributorDetail("charlie", "30d")).resolves.toBeNull();
  });
});
