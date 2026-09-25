import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/index.js";

const env = { GITHUB_TOKEN: "fixture-only", GITHUB_ORG: "fixture-org", DATABASE_URL: "postgresql://localhost/fixture" };
describe("typed configuration", () => {
  it("uses documented defaults", () => {
    expect(loadConfig(env)).toEqual({ githubToken: "fixture-only", githubOrg: "fixture-org", databaseUrl: env.DATABASE_URL, groupProperty: "leadboard_group", port: 3000, ingestionCronSchedule: "0 */6 * * *", initialSyncDays: 30, syncOverlapMinutes: 10, dataStaleAfterHours: 12 });
  });
  it("accepts explicit settings and zero overlap", () => {
    expect(loadConfig({ ...env, PORT: "3100", LEADBOARD_GROUP_PROPERTY: "custom", INITIAL_SYNC_DAYS: "7", SYNC_OVERLAP_MINUTES: "0", DATA_STALE_AFTER_HOURS: "24", INGESTION_CRON_SCHEDULE: "*/10 * * * *" })).toMatchObject({ port: 3100, groupProperty: "custom", initialSyncDays: 7, syncOverlapMinutes: 0, dataStaleAfterHours: 24 });
  });
  it.each(["GITHUB_TOKEN", "GITHUB_ORG", "DATABASE_URL"])("requires %s", (key) => {
    const input: NodeJS.ProcessEnv = { ...env }; delete input[key];
    expect(() => loadConfig(input)).toThrow("Invalid configuration");
    expect(() => loadConfig({ ...env, [key]: " " })).toThrow("Invalid configuration");
  });
  it.each([
    ["SYNC_OVERLAP_MINUTES", " "], ["PORT", ""], ["PORT", "0"], ["PORT", "65536"], ["PORT", "abc"], ["PORT", "3000.5"],
    ["INITIAL_SYNC_DAYS", "0"], ["SYNC_OVERLAP_MINUTES", "-1"],
    ["DATA_STALE_AFTER_HOURS", "Infinity"], ["LEADBOARD_GROUP_PROPERTY", ""],
    ["DATABASE_URL", "https://example.test"], ["INGESTION_CRON_SCHEDULE", "invalid"],
  ])("rejects invalid %s=%s", (key, value) => expect(() => loadConfig({ ...env, [key]: value })).toThrow("Invalid configuration"));
  it("does not echo credentials in validation errors", () => {
    const sensitive = "secret-value-that-must-not-be-logged";
    let message = "";
    try { loadConfig({ ...env, GITHUB_TOKEN: sensitive, DATABASE_URL: `invalid://${sensitive}`, PORT: sensitive }); }
    catch (error) { message = String(error); }
    expect(message).toContain("Invalid configuration");
    expect(message).not.toContain(sensitive);
    expect(message).not.toContain("invalid://");
  });
});
