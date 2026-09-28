import cron from "node-cron";
import { createApp } from "./app.js";
import { createApiRouter } from "./api.js";
import { loadConfig } from "./config/index.js";
import { getDbPool } from "./db/index.js";
import { GitHubApiClient } from "./github/client.js";
import { SyncService } from "./sync/index.js";

try {
  const config = loadConfig();
  const pool = getDbPool();
  const github = config.githubToken ? new GitHubApiClient(config) : null;
  const syncService = github ? new SyncService(pool, github, config) : null;
  const task = syncService ? cron.schedule(config.ingestionCronSchedule, () => {
    void syncService.runSync({ trigger: "scheduled" }).then(
      (result) => console.info(`Scheduled sync finished: ${result.status}; ${result.repositoriesOk} repositories updated.`),
      () => console.error("Scheduled sync failed."),
    );
  }) : null;
  const app = createApp({
    apiRouter: createApiRouter(pool, config, () => task?.getNextRun() ?? null),
  });
  const server = app.listen(config.port, "127.0.0.1", () => {
    console.info(`LeadBoard listening on port ${config.port}${github ? " with GitHub sync enabled" : " (GitHub sync awaits GITHUB_TOKEN)"}`);
    if (syncService) void syncService.runSync({ trigger: "manual" }).then(
      (result) => console.info(`Initial sync finished: ${result.status}; ${result.repositoriesOk} repositories updated.`),
      () => console.error("Initial GitHub synchronization failed."),
    );
  });
  server.on("error", () => {
    console.error("Backend failed to listen; check PORT and port availability.");
    process.exitCode = 1;
  });
  const shutdown = () => {
    task?.stop();
    server.close(() => { void pool.end().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid configuration");
  process.exitCode = 1;
}
