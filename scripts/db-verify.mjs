import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const tables = {
  groups: { id: "bigint", name: "text", created_at: "timestamp with time zone", updated_at: "timestamp with time zone" },
  repositories: { id: "bigint", github_id: "bigint", node_id: "text", owner: "text", name: "text", full_name: "text", default_branch: "text", group_id: "bigint", html_url: "text", archived: "boolean", tracked: "boolean", last_synced_at: "timestamp with time zone", created_at: "timestamp with time zone", updated_at: "timestamp with time zone" },
  contributors: { id: "bigint", github_id: "bigint", login: "text", avatar_url: "text", actor_type: "text", is_bot: "boolean", created_at: "timestamp with time zone", updated_at: "timestamp with time zone" },
  commits: { id: "bigint", repository_id: "bigint", sha: "text", contributor_id: "bigint", authored_at: "timestamp with time zone", additions: "integer", deletions: "integer", is_merge: "boolean", html_url: "text" },
  pull_requests: { id: "bigint", repository_id: "bigint", github_id: "bigint", number: "integer", contributor_id: "bigint", state: "text", created_at: "timestamp with time zone", closed_at: "timestamp with time zone", merged_at: "timestamp with time zone", html_url: "text" },
  issues: { id: "bigint", repository_id: "bigint", github_id: "bigint", number: "integer", contributor_id: "bigint", state: "text", created_at: "timestamp with time zone", closed_at: "timestamp with time zone", html_url: "text" },
  sync_runs: { id: "bigint", trigger: "text", range_from: "timestamp with time zone", range_to: "timestamp with time zone", started_at: "timestamp with time zone", finished_at: "timestamp with time zone", status: "text", repositories_ok: "integer", repositories_failed: "integer", error_message: "text" },
};

const requiredNotNull = {
  groups: ["id", "name"],
  repositories: ["id", "github_id", "node_id", "owner", "name", "full_name", "default_branch", "html_url", "archived", "tracked"],
  contributors: ["id", "actor_type", "is_bot"],
  commits: ["id", "sha", "authored_at", "additions", "deletions", "is_merge"],
  pull_requests: ["id", "github_id", "number", "state", "created_at"],
  issues: ["id", "github_id", "number", "state", "created_at"],
  sync_runs: ["id", "trigger", "range_from", "range_to", "started_at", "status", "repositories_ok", "repositories_failed"],
};

const foreignKeys = [
  ["repositories", "group_id", "groups", "id"],
  ["commits", "repository_id", "repositories", "id"],
  ["commits", "contributor_id", "contributors", "id"],
  ["pull_requests", "repository_id", "repositories", "id"],
  ["pull_requests", "contributor_id", "contributors", "id"],
  ["issues", "repository_id", "repositories", "id"],
  ["issues", "contributor_id", "contributors", "id"],
];
const uniques = [
  ["groups", "name"], ["repositories", "github_id"], ["repositories", "node_id"],
  ["contributors", "github_id"], ["commits", "repository_id", "sha"],
  ["pull_requests", "repository_id", "github_id"], ["issues", "repository_id", "github_id"],
];
const indexes = {
  repositories_tracked_idx: ["repositories", "tracked"],
  repositories_group_id_idx: ["repositories", "group_id"],
  commits_authored_at_idx: ["commits", "authored_at"],
  commits_repository_time_idx: ["commits", "repository_id", "authored_at"],
  commits_contributor_time_idx: ["commits", "contributor_id", "authored_at"],
  prs_created_at_idx: ["pull_requests", "created_at"],
  prs_repository_time_idx: ["pull_requests", "repository_id", "created_at"],
  prs_contributor_time_idx: ["pull_requests", "contributor_id", "created_at"],
  issues_created_at_idx: ["issues", "created_at"],
  issues_repository_time_idx: ["issues", "repository_id", "created_at"],
  issues_contributor_time_idx: ["issues", "contributor_id", "created_at"],
  sync_runs_status_finished_idx: ["sync_runs", "status", "finished_at"],
};

const pool = new pg.Pool({ connectionString: databaseUrl });
const problems = [];
try {
  const columns = (await pool.query(`SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns WHERE table_schema = current_schema()`)).rows;
  const foundColumns = new Map(columns.map(row => [`${row.table_name}.${row.column_name}`, row]));
  for (const [table, expectedColumns] of Object.entries(tables)) {
    const tableExists = await pool.query(`SELECT to_regclass(format('%I.%I', current_schema(), $1::text)) AS name`, [table]);
    if (!tableExists.rows[0].name) problems.push(`missing table ${table}`);
    for (const [column, type] of Object.entries(expectedColumns)) {
      const actual = foundColumns.get(`${table}.${column}`);
      if (!actual) problems.push(`missing column ${table}.${column}`);
      else if (actual.data_type !== type) problems.push(`wrong type ${table}.${column}: ${actual.data_type}`);
      if (actual && requiredNotNull[table].includes(column) && actual.is_nullable !== "NO") problems.push(`missing NOT NULL ${table}.${column}`);
    }
  }

  const constraints = (await pool.query(`SELECT c.contype, c.conrelid::regclass::text AS table_name,
      c.confrelid::regclass::text AS referenced_table,
      ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS columns,
      ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS referenced_columns
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = current_schema()`)).rows;
  for (const [table, column, target, targetColumn] of foreignKeys) {
    if (!constraints.some(c => c.contype === "f" && c.table_name === table && c.referenced_table === target && c.columns.join() === column && c.referenced_columns.join() === targetColumn)) problems.push(`missing FK ${table}.${column} -> ${target}.${targetColumn}`);
  }
  for (const table of Object.keys(tables)) {
    if (!constraints.some(c => c.contype === "p" && c.table_name === table && c.columns.join() === "id")) problems.push(`missing primary key ${table}(id)`);
  }
  for (const [table, ...columns] of uniques) {
    if (!constraints.some(c => c.contype === "u" && c.table_name === table && c.columns.join() === columns.join())) problems.push(`missing UNIQUE ${table}(${columns.join(", ")})`);
  }

  const actualIndexes = (await pool.query(`SELECT t.relname AS table_name, i.relname AS index_name,
      pg_get_indexdef(x.indexrelid) AS definition,
      ARRAY(SELECT pg_get_indexdef(x.indexrelid, n, true) FROM generate_series(1, x.indnkeyatts) AS n ORDER BY n) AS columns
    FROM pg_index x JOIN pg_class t ON t.oid = x.indrelid JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace WHERE ns.nspname = current_schema()`)).rows;
  for (const [name, [table, ...columns]] of Object.entries(indexes)) {
    if (!actualIndexes.some(index => index.index_name === name && index.table_name === table && index.columns.join() === columns.join())) problems.push(`missing index ${name} on ${table}(${columns.join(", ")})`);
  }
  if (!actualIndexes.some(index => index.index_name === "sync_runs_status_finished_idx" && index.definition.includes("(status, finished_at DESC)"))) problems.push("sync_runs_status_finished_idx must sort finished_at DESC");
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
  } else console.info("Database schema verified: 7 tables, columns, foreign keys, unique constraints, and indexes.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
