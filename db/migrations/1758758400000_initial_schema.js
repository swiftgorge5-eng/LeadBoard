/** @type {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE groups (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE repositories (
      id BIGSERIAL PRIMARY KEY,
      github_id BIGINT NOT NULL UNIQUE,
      node_id TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      default_branch TEXT NOT NULL,
      group_id BIGINT REFERENCES groups(id),
      html_url TEXT NOT NULL,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      tracked BOOLEAN NOT NULL DEFAULT TRUE,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE contributors (
      id BIGSERIAL PRIMARY KEY,
      github_id BIGINT UNIQUE,
      login TEXT,
      avatar_url TEXT,
      actor_type TEXT NOT NULL DEFAULT 'Unknown',
      is_bot BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE commits (
      id BIGSERIAL PRIMARY KEY,
      repository_id BIGINT REFERENCES repositories(id),
      sha TEXT NOT NULL,
      contributor_id BIGINT REFERENCES contributors(id),
      authored_at TIMESTAMPTZ NOT NULL,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      is_merge BOOLEAN NOT NULL DEFAULT FALSE,
      html_url TEXT,
      UNIQUE (repository_id, sha)
    );

    CREATE TABLE pull_requests (
      id BIGSERIAL PRIMARY KEY,
      repository_id BIGINT REFERENCES repositories(id),
      github_id BIGINT NOT NULL,
      number INTEGER NOT NULL,
      contributor_id BIGINT REFERENCES contributors(id),
      state TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      closed_at TIMESTAMPTZ,
      merged_at TIMESTAMPTZ,
      html_url TEXT,
      UNIQUE (repository_id, github_id)
    );

    CREATE TABLE issues (
      id BIGSERIAL PRIMARY KEY,
      repository_id BIGINT REFERENCES repositories(id),
      github_id BIGINT NOT NULL,
      number INTEGER NOT NULL,
      contributor_id BIGINT REFERENCES contributors(id),
      state TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      closed_at TIMESTAMPTZ,
      html_url TEXT,
      UNIQUE (repository_id, github_id)
    );

    CREATE TABLE sync_runs (
      id BIGSERIAL PRIMARY KEY,
      trigger TEXT NOT NULL,
      range_from TIMESTAMPTZ NOT NULL,
      range_to TIMESTAMPTZ NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      repositories_ok INTEGER NOT NULL DEFAULT 0,
      repositories_failed INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );

    CREATE INDEX repositories_tracked_idx ON repositories (tracked);
    CREATE INDEX repositories_group_id_idx ON repositories (group_id);
    CREATE INDEX commits_authored_at_idx ON commits (authored_at);
    CREATE INDEX commits_repository_time_idx ON commits (repository_id, authored_at);
    CREATE INDEX commits_contributor_time_idx ON commits (contributor_id, authored_at);
    CREATE INDEX prs_created_at_idx ON pull_requests (created_at);
    CREATE INDEX prs_repository_time_idx ON pull_requests (repository_id, created_at);
    CREATE INDEX prs_contributor_time_idx ON pull_requests (contributor_id, created_at);
    CREATE INDEX issues_created_at_idx ON issues (created_at);
    CREATE INDEX issues_repository_time_idx ON issues (repository_id, created_at);
    CREATE INDEX issues_contributor_time_idx ON issues (contributor_id, created_at);
    CREATE INDEX sync_runs_status_finished_idx ON sync_runs (status, finished_at DESC);
  `);
};
