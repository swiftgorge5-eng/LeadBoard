import {
  CommitActivitySchema,
  type CollectRange,
  type GitHubClient,
  type TrackedRepository,
} from "@leadboard/contracts";
import { describe, expect, it, vi } from "vitest";
import { CommitCollector } from "../src/collectors/commits.js";
import { GitHubApiClient } from "../src/github/client.js";

const repo: TrackedRepository = {
  githubId: "1001", nodeId: "R_1001", owner: "example", name: "core",
  fullName: "example/core", defaultBranch: "release/next", group: "platform",
  htmlUrl: "https://github.com/example/core", archived: false,
};
const range: CollectRange = { from: "2026-09-18T12:00:00Z", to: "2026-09-25T12:00:00Z" };
const user = { databaseId: 2001, login: "alice", avatarUrl: "https://example.test/alice.png" };

function commit(overrides: Record<string, unknown> = {}) {
  return {
    oid: "a".repeat(40), authoredDate: range.from, committedDate: "2026-10-01T00:00:00Z",
    additions: 12, deletions: 3, parents: { totalCount: 1 },
    url: `https://github.com/example/core/commit/${"a".repeat(40)}`,
    author: { user }, ...overrides,
  };
}

function page(nodes: unknown[], hasNextPage = false, endCursor: string | null = null) {
  return {
    repository: {
      ref: { target: { history: { nodes, pageInfo: { hasNextPage, endCursor } } } },
    },
  };
}

function mockCollector(responses: unknown[]) {
  const queryGraphQL = vi.fn();
  for (const response of responses) queryGraphQL.mockResolvedValueOnce(response);
  const collector = new CommitCollector({ queryGraphQL } as unknown as GitHubClient);
  return { collector, queryGraphQL };
}

describe("CommitCollector", () => {
  it("returns no activities for an empty repository", async () => {
    const { collector, queryGraphQL } = mockCollector([{ repository: { ref: null } }]);
    await expect(collector.collectCommits(repo, range)).resolves.toEqual([]);
    expect(queryGraphQL).toHaveBeenCalledTimes(1);
  });

  it("queries only the configured default branch and maps a complete single-page commit", async () => {
    const { collector, queryGraphQL } = mockCollector([page([commit()])]);
    const result = await collector.collectCommits(repo, range);

    expect(queryGraphQL.mock.calls[0]?.[0]).toContain("history(first: 100, after: $cursor)");
    expect(queryGraphQL.mock.calls[0]?.[1]).toEqual({
      owner: "example", name: "core", branch: "refs/heads/release/next", cursor: null,
    });
    expect(result).toEqual([{
      kind: "commit", repositoryGithubId: "1001", externalId: "a".repeat(40),
      actor: { githubId: "2001", login: "alice", avatarUrl: user.avatarUrl, type: "User" },
      occurredAt: range.from, additions: 12, deletions: 3, isMerge: false,
      rawUrl: `https://github.com/example/core/commit/${"a".repeat(40)}`,
    }]);
    expect(CommitActivitySchema.safeParse(result[0]).success).toBe(true);
  });

  it("reads every cursor page and filters by authoredDate using inclusive from and exclusive to", async () => {
    const { collector, queryGraphQL } = mockCollector([
      page([
        commit({ oid: "1", authoredDate: "2026-09-18T11:59:59Z" }),
        commit({ oid: "2", authoredDate: range.from }),
      ], true, "page-2"),
      page([
        commit({ oid: "3", authoredDate: "2026-09-20T00:00:00Z" }),
        commit({ oid: "4", authoredDate: range.to }),
      ]),
    ]);
    const result = await collector.collectCommits(repo, range);

    expect(result.map((item) => item.externalId)).toEqual(["2", "3"]);
    expect(queryGraphQL).toHaveBeenCalledTimes(2);
    expect(queryGraphQL.mock.calls[1]?.[1]).toMatchObject({ cursor: "page-2" });
    expect(queryGraphQL.mock.calls[0]?.[0]).not.toMatch(/history\([^)]*\b(?:since|until):/);
  });

  it("retains unmatched authors and merge commits with their change counts", async () => {
    const { collector } = mockCollector([page([
      commit({ oid: "b", author: null, parents: { totalCount: 2 }, additions: 0, deletions: 9 }),
      commit({ oid: "c", author: { user: null }, url: null }),
    ])]);
    const result = await collector.collectCommits(repo, range);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      externalId: "b", isMerge: true, additions: 0, deletions: 9,
      actor: { githubId: null, login: null, avatarUrl: null, type: "Unknown" },
    });
    expect(result[1]).toMatchObject({
      externalId: "c", rawUrl: null,
      actor: { githubId: null, login: null, avatarUrl: null, type: "Unknown" },
    });
    expect(result.every((item) => CommitActivitySchema.safeParse(item).success)).toBe(true);
  });

  it("rejects the whole collection if a later GraphQL page fails", async () => {
    const failure = new Error("second page failed");
    const queryGraphQL = vi.fn().mockResolvedValueOnce(page([commit()], true, "page-2"))
      .mockRejectedValueOnce(failure);
    const collector = new CommitCollector({ queryGraphQL } as unknown as GitHubClient);
    await expect(collector.collectCommits(repo, range)).rejects.toBe(failure);
  });

  it("rejects if the default branch disappears after the first page", async () => {
    const { collector } = mockCollector([
      page([commit()], true, "page-2"), { repository: { ref: null } },
    ]);
    await expect(collector.collectCommits(repo, range)).rejects.toThrow(/disappeared/);
  });

  it("rejects a repeated cursor instead of looping forever", async () => {
    const { collector, queryGraphQL } = mockCollector([
      page([], true, "repeat"), page([], true, "repeat"),
    ]);
    await expect(collector.collectCommits(repo, range)).rejects.toThrow(/pagination/);
    expect(queryGraphQL).toHaveBeenCalledTimes(2);
  });

  it("uses the existing GitHub API client for a GraphQL request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: page([commit()]) })));
    const client = new GitHubApiClient({ githubToken: "fixture-token" }, { fetch: fetchMock });
    const result = await new CommitCollector(client).collectCommits(repo, range);

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/graphql");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body).variables.branch).toBe("refs/heads/release/next");
  });
});
