import { loadConfig } from "../config/index.js";
import { getDbPool } from "../db/index.js";
import { createDefaultSyncCoordinator } from "./index.js";

const config = loadConfig();
const pool = getDbPool();

try {
  const result = await createDefaultSyncCoordinator(config).runSync({ trigger: "manual" });
  console.info(JSON.stringify(result));
  if (result.status !== "success") process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.name : "Synchronization failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
