/** @type {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE members (
      id BIGSERIAL PRIMARY KEY,
      email_fingerprint TEXT NOT NULL UNIQUE CHECK (length(email_fingerprint) = 64),
      email_domain TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'verified'
        CHECK (verification_status IN ('verified', 'revoked')),
      verified_at TIMESTAMPTZ NOT NULL,
      last_reverified_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE email_verification_challenges (
      id BIGSERIAL PRIMARY KEY,
      email_fingerprint TEXT NOT NULL CHECK (length(email_fingerprint) = 64),
      email_domain TEXT NOT NULL,
      requester_ip_fingerprint TEXT NOT NULL CHECK (length(requester_ip_fingerprint) = 64),
      code_hash TEXT NOT NULL,
      code_salt TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      used_at TIMESTAMPTZ,
      delivery_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_status IN ('pending', 'sent', 'failed')),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE github_accounts (
      github_id BIGINT PRIMARY KEY,
      login TEXT NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE member_github_accounts (
      member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      github_id BIGINT NOT NULL REFERENCES github_accounts(github_id) ON DELETE CASCADE,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (member_id, github_id)
    );

    CREATE INDEX email_verification_email_time_idx
      ON email_verification_challenges (email_fingerprint, created_at DESC);
    CREATE INDEX email_verification_ip_time_idx
      ON email_verification_challenges (requester_ip_fingerprint, created_at DESC);
    CREATE UNIQUE INDEX member_github_primary_idx
      ON member_github_accounts (member_id) WHERE is_primary;
  `);
};
