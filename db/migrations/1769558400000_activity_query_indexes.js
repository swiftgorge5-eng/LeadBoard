/** @type {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.sql(`
    CREATE INDEX pull_requests_closed_at_idx ON pull_requests (closed_at) WHERE closed_at IS NOT NULL;
    CREATE INDEX issues_closed_at_idx ON issues (closed_at) WHERE closed_at IS NOT NULL;
    CREATE INDEX contributors_human_login_lower_idx
      ON contributors (lower(login)) WHERE is_bot = FALSE AND login IS NOT NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS contributors_human_login_lower_idx;
    DROP INDEX IF EXISTS issues_closed_at_idx;
    DROP INDEX IF EXISTS pull_requests_closed_at_idx;
  `);
};
