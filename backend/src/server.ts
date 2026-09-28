import { createApiRouter } from "./api/router.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config/index.js";
import { getDbPool } from "./db/index.js";
import { createDefaultSyncCoordinator, startSyncScheduler } from "./sync/index.js";

try {
  const config = loadConfig();
  const coordinator = createDefaultSyncCoordinator(config);
  const apiRouter = createApiRouter({ getSyncStatus: () => coordinator.getSyncStatus() });
  const scheduler = startSyncScheduler(coordinator, config.ingestionCronSchedule);
  const server = createApp({ apiRouter }).listen(config.port, () => {
    console.info(`LeadBoard backend listening on port ${config.port}`);
  });

  server.on("error", () => {
    console.error("Backend failed to listen; check PORT and port availability.");
    process.exitCode = 1;
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    server.close(() => {
      void scheduler.stop()
        .then(() => getDbPool().end())
        .finally(() => {
          clearTimeout(timer);
          process.exit(0);
        });
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  // loadConfig emits field names only, never the original input or Zod error.
  console.error(error instanceof Error ? error.message : "Invalid configuration");
  process.exitCode = 1;
}
