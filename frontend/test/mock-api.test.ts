import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrontendApiClient } from "../src/api";
import { createMockApiClient } from "../src/api/mock";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("mock API adapter", () => {
  it("implements all six client methods with shared-schema-valid responses", async () => {
    const mock = createMockApiClient();

    await expect(mock.getOrganizationSummary("30d")).resolves.toMatchObject({
      range: "30d", repositories: 1, total: 12,
    });
    await expect(mock.getRepositories("30d")).resolves.toMatchObject({
      items: [{ fullName: "demo/leadboard", group: "demo" }],
    });
    await expect(mock.getGroups()).resolves.toEqual({
      items: [{ name: "demo" }, { name: "empty-demo" }],
    });
    await expect(mock.getContributorLeaderboard({ range: "7d", metric: "total" }))
      .resolves.toMatchObject({ range: "7d", metric: "total", items: [{ rank: 1 }] });
    await expect(mock.getContributorDetail("demo-contributor", "all"))
      .resolves.toMatchObject({ login: "demo-contributor", range: "all", repositories: [{ total: 12 }] });
    await expect(mock.getSyncStatus()).resolves.toMatchObject({
      lastRunStatus: "success", dataStatus: "fresh",
    });
  });

  it("uses the group filter and explicit leaderboard limit", async () => {
    const mock = createMockApiClient();

    await expect(mock.getRepositories("30d", "empty-demo")).resolves.toEqual({ items: [] });
    await expect(mock.getContributorLeaderboard({
      range: "30d", metric: "commits", group: "empty-demo",
    })).resolves.toEqual({ range: "30d", metric: "commits", items: [] });
    await expect(mock.getContributorLeaderboard({
      range: "30d", metric: "total", limit: 1,
    })).resolves.toMatchObject({ items: [{ login: "demo-contributor" }] });
  });

  it("returns a typed not-found error for an unknown contributor", async () => {
    await expect(createMockApiClient().getContributorDetail("missing", "30d"))
      .rejects.toMatchObject({ code: "CONTRIBUTOR_NOT_FOUND", status: 404 });
  });

  it("uses the real client by default and never falls back after a request failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    const client = createFrontendApiClient();

    await expect(client.getGroups()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("uses mock data only when explicitly selected", async () => {
    await expect(createFrontendApiClient("mock").getGroups())
      .resolves.toEqual({ items: [{ name: "demo" }, { name: "empty-demo" }] });
  });

  it("rejects mock mode in a production build", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");

    expect(() => createFrontendApiClient("mock")).toThrow(
      "Mock API is available only in development or tests",
    );
  });
});
