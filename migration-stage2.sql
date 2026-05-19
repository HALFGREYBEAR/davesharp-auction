-- Stage 2 migration — adds verification, status, and per-device sessions
-- to an existing Stage 1 database. Run ONCE:
--
--   npx wrangler d1 execute davesharp-auction --remote --file=migration-stage2.sql
--
-- (Running it twice will error on "duplicate column name" — harmless, it just
-- means the columns are already there.)
--
-- NOTE: if you already ran an EARLIER version of this file (one that added a
-- `session_token` column to bidders), run migration-sessions.sql instead —
-- that just adds the sessions table this version introduces.

ALTER TABLE auction ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE auction ADD COLUMN finalized INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bidders ADD COLUMN verify_code TEXT;
ALTER TABLE bidders ADD COLUMN verify_code_expires TEXT;
ALTER TABLE bidders ADD COLUMN verify_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bidders ADD COLUMN verified_at TEXT;
ALTER TABLE bidders ADD COLUMN last_outbid_email_at TEXT;

-- One row per verified device. A bidder can hold several at once, so
-- verifying on a second device does not log the first one out.
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  bidder_id  INTEGER NOT NULL,
  created_at TEXT,
  FOREIGN KEY (bidder_id) REFERENCES bidders(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_bidder ON sessions(bidder_id);

-- Your existing auction row becomes status = 'draft' (hidden) after this.
-- Publish it from the /admin panel, or re-run seed.sql.
