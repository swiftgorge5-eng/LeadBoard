import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runner } from "node-pg-migrate";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

try {
  await runner({
    databaseUrl,
    dir: resolve(fileURLToPath(new URL("../db/migrations/", import.meta.url))),
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
