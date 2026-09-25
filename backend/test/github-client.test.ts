import { describe, expect, it, vi } from "vitest";
import { GitHubApiClient, GitHubClientError } from "../src/github/client.js";

const TOKEN = "fixture-secret-token";

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), { status, headers });
}

function fixture(responses: Array<Response | Error>, options: { maxAttempts?: number; maxWaitMs?: number } = {}) {
  let now = 0;
  const waits: number[] = [];
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("Unexpected request");
    return next;
  });
  const client = new GitHubApiClient({ githubToken: TOKEN }, {
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async (milliseconds) => { waits.push(milliseconds); now += milliseconds; },
    now: () => now,
    maxAttempts: options.maxAttempts ?? 3,
    maxWaitMs: options.maxWaitMs ?? 300_000,
  });
  return { client, fetchMock, waits };
}

describe("GitHubApiClient", () => {
  it("adds token and API headers, serializes GET params and JSON bodies", async () => {
    const { client, fetchMock } = fixture([json({ ok: true }), json({ created: true }), json({ updated: true })]);
    await client.requestRest("GET", "/repos/example/demo", { page: 2, active: false });
    await client.requestRest("POST", "/repos/example/demo/dispatches", { event_type: "sync" });
    await client.requestRest("PATCH", "/repos/example/demo", { archived: true });

    const [getUrl, getOptions] = fetchMock.mock.calls[0]!;
    expect(getUrl).toBe("https://api.github.com/repos/example/demo?page=2&active=false");
    expect(getOptions?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    });
    expect(getOptions?.body).toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe('{"event_type":"sync"}');
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe('{"archived":true}');
  });

  it("follows every REST next link and preserves GitHub's page URLs", async () => {
    const page2 = "https://api.github.com/orgs/example/repos?per_page=100&page=2";
    const page3 = "https://api.github.com/orgs/example/repos?per_page=100&page=3";
    const { client, fetchMock } = fixture([
      json([{ id: 1 }], 200, { link: `<${page2}>; rel="next", <https://api.github.com/orgs/example/repos?per_page=100&page=3>; rel="last"` }),
      json([{ id: 2 }], 200, { link: `<${page3}>; rel="next"` }),
      json([{ id: 3 }]),
    ]);
    await expect(client.paginateRest("/orgs/example/repos")).resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.github.com/orgs/example/repos?per_page=100", page2, page3,
    ]);
  });

  it("rejects a cross-host pagination link before sending the token", async () => {
    const { client, fetchMock } = fixture([
      json([], 200, { link: '<https://other.example/steal>; rel="next"' }),
    ]);
    await expect(client.paginateRest("/orgs/example/repos")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps organization repositories and custom property values to the shared contracts", async () => {
    const { client, fetchMock } = fixture([
      json([{ id: 123, node_id: "R_123", owner: { login: "example" }, name: "demo",
        full_name: "example/demo", default_branch: "main", html_url: "https://github.com/example/demo",
        archived: false, fork: true, private: false }]),
      json([{ property_name: "leadboard_group", value: "core" }, { property_name: "tags", value: ["one", "two"] }]),
    ]);
    await expect(client.listOrgRepositories("example")).resolves.toEqual([{
      githubId: "123", nodeId: "R_123", owner: "example", name: "demo", fullName: "example/demo",
      defaultBranch: "main", htmlUrl: "https://github.com/example/demo", archived: false,
      isFork: true, isPrivate: false,
    }]);
    await expect(client.getRepositoryCustomProperties("example", "demo")).resolves.toEqual({
      leadboard_group: "core", tags: ["one", "two"],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/orgs/example/repos?per_page=100&type=all");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.github.com/repos/example/demo/properties/values");
  });

  it("sends GraphQL query and variables once and returns data", async () => {
    const { client, fetchMock } = fixture([json({ data: { viewer: { login: "octocat" } } })]);
    const query = "query Viewer($id: ID!) { viewer { login } }";
    await expect(client.queryGraphQL(query, { id: "R_1" })).resolves.toEqual({ viewer: { login: "octocat" } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.github.com/graphql");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ query, variables: { id: "R_1" } });
  });

  it("does not leak token or GitHub's raw error body to errors or logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { client } = fixture([json({ message: `Bad credentials: ${TOKEN}` }, 401)]);
      let thrown: unknown;
      try { await client.requestRest("GET", "/user"); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(GitHubClientError);
      expect(thrown).toMatchObject({ code: "HTTP_ERROR", status: 401, attempts: 1 });
      expect(String(thrown)).not.toContain(TOKEN);
      expect(String(thrown)).not.toContain("Bad credentials");
      expect(log).not.toHaveBeenCalled();

      const network = fixture([new Error(`socket failure ${TOKEN}`)], { maxAttempts: 1 });
      let networkError: unknown;
      try { await network.client.requestRest("GET", "/user"); } catch (error) { networkError = error; }
      expect(networkError).toMatchObject({ code: "RETRY_EXHAUSTED", attempts: 1 });
      expect(String(networkError)).not.toContain(TOKEN);
    } finally {
      log.mockRestore();
    }
  });

  it("retries 429 according to Retry-After", async () => {
    const { client, fetchMock, waits } = fixture([
      json({ message: "rate limited" }, 429, { "retry-after": "2" }), json({ ok: true }),
    ]);
    await expect(client.requestRest("GET", "/user")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([2000]);
  });

  it("waits for primary reset and secondary rate limits", async () => {
    const primary = fixture([
      json({ message: "API rate limit exceeded" }, 403,
        { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "2" }),
      json({ ok: true }),
    ]);
    await primary.client.requestRest("GET", "/user");
    expect(primary.waits).toEqual([3000]);

    const secondary = fixture([
      json({ message: "You have exceeded a secondary rate limit" }, 403), json({ ok: true }),
    ]);
    await secondary.client.requestRest("GET", "/user");
    expect(secondary.waits).toEqual([60_000]);
  });

  it("retries 5xx and transient network errors with finite backoff", async () => {
    const { client, fetchMock, waits } = fixture([
      json({ message: "upstream error" }, 503), new Error(`socket failure ${TOKEN}`), json({ ok: true }),
    ]);
    await expect(client.requestRest("GET", "/user")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it("does not retry ordinary 4xx or write operations", async () => {
    const forbidden = fixture([json({ message: "not permitted" }, 403)]);
    await expect(forbidden.client.requestRest("GET", "/user")).rejects.toMatchObject({ code: "HTTP_ERROR", status: 403 });
    expect(forbidden.fetchMock).toHaveBeenCalledTimes(1);

    const write = fixture([json({ message: "server error" }, 503)]);
    await expect(write.client.requestRest("POST", "/repos/example/demo/dispatches", { event_type: "x" }))
      .rejects.toMatchObject({ code: "HTTP_ERROR", status: 503 });
    expect(write.fetchMock).toHaveBeenCalledTimes(1);

    const mutation = fixture([json({ message: "server error" }, 503)]);
    await expect(mutation.client.queryGraphQL("mutation { doSomething { id } }"))
      .rejects.toMatchObject({ code: "HTTP_ERROR", status: 503 });
    expect(mutation.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pauses the next request when a successful response exhausts the primary budget", async () => {
    const { client, waits } = fixture([
      json({ first: true }, 200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "2" }),
      json({ second: true }),
    ]);
    await client.requestRest("GET", "/first");
    await client.requestRest("GET", "/second");
    expect(waits).toEqual([3000]);
  });

  it("reports retry exhaustion and a rate-limit wait beyond its budget", async () => {
    const exhausted = fixture([json({}, 500), json({}, 502), json({}, 503)]);
    await expect(exhausted.client.requestRest("GET", "/user"))
      .rejects.toMatchObject({ code: "RETRY_EXHAUSTED", status: 503, attempts: 3 });
    expect(exhausted.fetchMock).toHaveBeenCalledTimes(3);

    const budget = fixture([json({}, 429, { "retry-after": "600" })], { maxWaitMs: 1000 });
    await expect(budget.client.requestRest("GET", "/user"))
      .rejects.toMatchObject({ code: "RATE_LIMITED", status: null, attempts: 1 });
    expect(budget.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats GraphQL errors as errors and retries GraphQL rate limits", async () => {
    const ordinary = fixture([json({ data: null, errors: [{ message: `Bad query ${TOKEN}` }] })]);
    let thrown: unknown;
    try { await ordinary.client.queryGraphQL("query { viewer { login } }"); } catch (error) { thrown = error; }
    expect(thrown).toMatchObject({ code: "GRAPHQL_ERROR" });
    expect(String(thrown)).not.toContain(TOKEN);

    const limited = fixture([
      json({ errors: [{ type: "RATE_LIMITED", message: "rate limit" }] }, 200, { "retry-after": "1" }),
      json({ data: { ok: true } }),
    ]);
    await expect(limited.client.queryGraphQL("query { viewer { login } }")).resolves.toEqual({ ok: true });
    expect(limited.waits).toEqual([1000]);
  });
});
