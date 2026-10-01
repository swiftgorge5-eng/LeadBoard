/** @type {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE github_oauth_states (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      state_hash TEXT NOT NULL UNIQUE CHECK (length(state_hash) = 64),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX github_oauth_states_member_time_idx
      ON github_oauth_states (member_id, created_at DESC);

    CREATE UNIQUE INDEX member_github_account_owner_idx
      ON member_github_accounts (github_id);
  `);
};
