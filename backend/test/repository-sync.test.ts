import { RepositorySyncResultSchema, type GitHubClient, type GitHubRepositoryRef } from "@leadboard/contracts";
import { describe, expect, it, vi } from "vitest";
import { GitHubApiClient } from "../src/github/client.js";
import { RepositorySync } from "../src/repositories/sync.js";

const input = { org: "example", groupProperty: "leadboard_group" };

function repo(name: string, overrides: Partial<GitHubRepositoryRef> = {}): GitHubRepositoryRef {
  return {
    githubId: "1001", nodeId: "R_1001", owner: "example", name,
    fullName: `example/${name}`, defaultBranch: "main",
    htmlUrl: `https://github.com/example/${name}`, archived: false,
    isFork: false, isPrivate: false, ...overrides,
  };
}

function mockClient(repositories: GitHubRepositoryRef[], properties: Record<string, Record<string, unknown>> = {}) {
  const listOrgRepositories = vi.fn(async () => repositories);
  const getRepositoryCustomProperties = vi.fn(async (_owner: string, name: string) => properties[name] ?? {});
  const client = { listOrgRepositories, getRepositoryCustomProperties } as unknown as GitHubClient;
  return { sync: new RepositorySync(client, []), listOrgRepositories, getRepositoryCustomProperties };
}

describe("RepositorySync", () => {
  it("adds a public watched repository alongside organization repositories", async () => {
    const requestRest = vi.fn(async () => ({
      id: 2002, node_id: "R_2002", owner: { login: "torvalds" }, name: "linux",
      full_name: "torvalds/linux", default_branch: "master",
      html_url: "https://github.com/torvalds/linux", archived: false, fork: false, private: false,
    }));
    const client = { listOrgRepositories: vi.fn(async () => []), requestRest } as unknown as GitHubClient;
    const result = await new RepositorySync(client, ["torvalds/linux"]).syncRepositories(input);
    expect(result.trackedRepositories).toMatchObject([{ fullName: "torvalds/linux", group: "featured-open-source" }]);
    expect(requestRest).toHaveBeenCalledWith("GET", "/repos/torvalds/linux");
  });
  it("includes a tracked repository with every shared contract field", async () => {
    const { sync, listOrgRepositories, getRepositoryCustomProperties } = mockClient(
      [repo("core")], { core: { leadboard_group: "platform" } },
    );
    const result = await sync.syncRepositories(input);
    expect(result.trackedRepositories).toEqual([{
      githubId: "1001", nodeId: "R_1001", owner: "example", name: "core",
      fullName: "example/core", defaultBranch: "main", group: "platform",
      htmlUrl: "https://github.com/example/core", archived: false,
    }]);
    expect(RepositorySyncResultSchema.safeParse(result).success).toBe(true);
    expect(listOrgRepositories).toHaveBeenCalledWith("example");
    expect(getRepositoryCustomProperties).toHaveBeenCalledWith("example", "core");
  });

  it("uses the configured group property", async () => {
    const { sync } = mockClient([repo("core")], { core: { custom_group: "docs" } });
    await expect(sync.syncRepositories({ ...input, groupProperty: "custom_group" }))
      .resolves.toMatchObject({ trackedRepositories: [{ group: "docs" }] });
  });

  it("excludes untracked, missing, blank, and non-string groups", async () => {
    const names = ["untracked", "missing", "blank", "array", "number", "object"];
    const repositories = names.map((name, index) => repo(name, { githubId: String(index + 1) }));
    const { sync, getRepositoryCustomProperties } = mockClient(repositories, {
      untracked: { leadboard_group: "untracked" },
      blank: { leadboard_group: "  " },
      array: { leadboard_group: ["platform"] },
      number: { leadboard_group: 42 },
      object: { leadboard_group: { name: "platform" } },
    });
    await expect(sync.syncRepositories(input)).resolves.toMatchObject({ trackedRepositories: [] });
    expect(getRepositoryCustomProperties).toHaveBeenCalledTimes(names.length);
  });

  it("excludes forks and private repositories without requesting their properties", async () => {
    const { sync, getRepositoryCustomProperties } = mockClient([
      repo("fork", { isFork: true }), repo("private", { isPrivate: true }),
    ]);
    await expect(sync.syncRepositories(input)).resolves.toMatchObject({ trackedRepositories: [] });
    expect(getRepositoryCustomProperties).not.toHaveBeenCalled();
  });

  it("retains an archived tracked repository and its archived flag", async () => {
    const { sync } = mockClient([repo("archive", { archived: true })], {
      archive: { leadboard_group: "history" },
    });
    await expect(sync.syncRepositories(input)).resolves.toMatchObject({
      trackedRepositories: [{ githubId: "1001", group: "history", archived: true }],
    });
  });

  it("preserves githubId across a rename while updating names and URL", async () => {
    const listOrgRepositories = vi.fn()
      .mockResolvedValueOnce([repo("old-name")])
      .mockResolvedValueOnce([repo("new-name")]);
    const getRepositoryCustomProperties = vi.fn().mockResolvedValue({ leadboard_group: "platform" });
    const sync = new RepositorySync({ listOrgRepositories, getRepositoryCustomProperties } as unknown as GitHubClient, []);
    const before = (await sync.syncRepositories(input)).trackedRepositories[0]!;
    const after = (await sync.syncRepositories(input)).trackedRepositories[0]!;
    expect(after.githubId).toBe(before.githubId);
    expect(after.nodeId).toBe(before.nodeId);
    expect(after.name).toBe("new-name");
    expect(after.fullName).toBe("example/new-name");
    expect(after.htmlUrl).toBe("https://github.com/example/new-name");
    expect(getRepositoryCustomProperties).toHaveBeenLastCalledWith("example", "new-name");
  });

  it("rejects when repository listing fails", async () => {
    const { sync, listOrgRepositories, getRepositoryCustomProperties } = mockClient([]);
    const failure = new Error("listing failed");
    listOrgRepositories.mockRejectedValueOnce(failure);
    await expect(sync.syncRepositories(input)).rejects.toBe(failure);
    expect(getRepositoryCustomProperties).not.toHaveBeenCalled();
  });

  it("rejects the whole snapshot when a required property request fails", async () => {
    const { sync, getRepositoryCustomProperties } = mockClient([
      repo("first"), repo("second", { githubId: "1002" }),
    ], { first: { leadboard_group: "platform" } });
    const failure = new Error("property failed");
    getRepositoryCustomProperties
      .mockResolvedValueOnce({ leadboard_group: "platform" })
      .mockRejectedValueOnce(failure);
    await expect(sync.syncRepositories(input)).rejects.toBe(failure);
    expect(getRepositoryCustomProperties).toHaveBeenCalledTimes(2);
  });

  it("returns a valid ISO 8601 UTC syncedAt after successful completion", async () => {
    const { sync } = mockClient([]);
    const result = await sync.syncRepositories(input);
    expect(result.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(result.syncedAt))).toBe(false);
    expect(RepositorySyncResultSchema.safeParse(result).success).toBe(true);
  });

  it("uses the GitHub Client's complete multi-page repository listing", async () => {
    const page2 = "https://api.github.com/orgs/example/repos?per_page=100&type=all&page=2";
    const response = (items: unknown[], link?: string) => new Response(JSON.stringify(items), {
      headers: link ? { link } : {},
    });
    const raw = (name: string, id: number) => ({
      id, node_id: `R_${id}`, owner: { login: "example" }, name,
      full_name: `example/${name}`, default_branch: "main",
      html_url: `https://github.com/example/${name}`, archived: false,
      fork: false, private: false,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([raw("first", 1001)], `<${page2}>; rel="next"`))
      .mockResolvedValueOnce(response([raw("second", 1002)]))
      .mockImplementation(async () => response([{ property_name: "leadboard_group", value: "platform" }]));
    const client = new GitHubApiClient({ githubToken: "fixture-token" }, { fetch: fetchMock });
    const result = await new RepositorySync(client, []).syncRepositories(input);
    expect(result.trackedRepositories.map((item) => item.githubId)).toEqual(["1001", "1002"]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(page2);
  });

  it("rejects when a later repository page fails", async () => {
    const page2 = "https://api.github.com/orgs/example/repos?page=2";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("[]", { headers: { link: `<${page2}>; rel="next"` } }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    const client = new GitHubApiClient({ githubToken: "fixture-token" }, { fetch: fetchMock });
    await expect(new RepositorySync(client, []).syncRepositories(input))
      .rejects.toMatchObject({ code: "HTTP_ERROR", status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
