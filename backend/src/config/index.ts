import { AppConfigSchema, type AppConfig } from "@leadboard/contracts";
import { validate } from "node-cron";

function numericSetting(value: string | undefined, fallback: number): number {
  return value === undefined ? fallback : value.trim() === "" ? Number.NaN : Number(value);
}

/** Pure loader: no IO and no logging of credential-bearing input. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = AppConfigSchema.safeParse({
    githubToken: env.GITHUB_TOKEN,
    githubOrg: env.GITHUB_ORG,
    groupProperty: env.LEADBOARD_GROUP_PROPERTY ?? "leadboard_group",
    databaseUrl: env.DATABASE_URL,
    port: numericSetting(env.PORT, 3000),
    ingestionCronSchedule: env.INGESTION_CRON_SCHEDULE ?? "0 */6 * * *",
    initialSyncDays: numericSetting(env.INITIAL_SYNC_DAYS, 30),
    syncOverlapMinutes: numericSetting(env.SYNC_OVERLAP_MINUTES, 10),
    dataStaleAfterHours: numericSetting(env.DATA_STALE_AFTER_HOURS, 12),
  });
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Invalid configuration fields: ${fields.join(", ")}`);
  }
  if (!validate(result.data.ingestionCronSchedule)) {
    throw new Error("Invalid configuration field: ingestionCronSchedule");
  }
  return result.data;
}
