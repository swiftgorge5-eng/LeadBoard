import { createApp } from "./app.js";
import { loadConfig } from "./config/index.js";

try {
  const config = loadConfig();
  const server = createApp().listen(config.port, () => {
    console.info(`LeadBoard backend listening on port ${config.port}`);
  });
  server.on("error", () => {
    console.error("Backend failed to listen; check PORT and port availability.");
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  // loadConfig emits field names only, never the original input or Zod error.
  console.error(error instanceof Error ? error.message : "Invalid configuration");
  process.exitCode = 1;
}
