import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnalyticsService } from "../../backend/src/analytics/index.js";
import { getDbPool } from "../../backend/src/db/index.js";
import { loadConfig } from "../../backend/src/config/index.js";
import { createDefaultSyncCoordinator } from "../../backend/src/sync/index.js";

const token = process.env.LEADBOARD_E2E_GITHUB_TOKEN;
const org = process.env.LEADBOARD_E2E_GITHUB_ORG;
if (!token || !org) throw new Error("Live E2E requires LEADBOARD_E2E_GITHUB_TOKEN and LEADBOARD_E2E_GITHUB_ORG");

process.env.GITHUB_TOKEN = token;
process.env.GITHUB_ORG = org;
const pool = getDbPool();

beforeAll(async () => {
  await pool.query("TRUNCATE commits, pull_requests, issues, contributors, repositories, groups, sync_runs RESTART IDENTITY CASCADE");
});
afterAll(async () => { await pool.end(); });

describe("Live GitHub end-to-end", () => {
  it("runs the real one-shot entry point and exposes queryable synchronized state", async () => {
    const result = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "sync:once"],
      {
        cwd: process.cwd(),
        env: { ...process.env, GITHUB_TOKEN: token, GITHUB_ORG: org },
        encoding: "utf8",
        timeout: 180_000,
      },
    );
    if (result.status !== 0) throw new Error("Live sync:once failed; inspect the GitHub Actions job without exposing secrets");

    const config = loadConfig();
    const coordinator = createDefaultSyncCoordinator(config);
    const sync = await coordinator.getSyncStatus();
    expect(sync.lastRunStatus).toBe("success");
    expect(sync.dataStatus).toBe("fresh");

    const summary = await new AnalyticsService(pool).getOrganizationActivitySummary("all");
    expect(summary.repositories).toBeGreaterThanOrEqual(0);
    expect(summary.total).toBeGreaterThanOrEqual(0);
  });
});
