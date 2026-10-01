/** @type {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE project_proposals (
      id BIGSERIAL PRIMARY KEY,
      project_url TEXT NOT NULL,
      lab_name TEXT NOT NULL,
      notes TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX project_proposals_status_time_idx
      ON project_proposals (status, created_at DESC);
  `);
};
