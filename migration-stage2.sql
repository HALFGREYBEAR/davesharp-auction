-- Stage 2 migration — adds verification, session, and auction-status columns
-- to an existing Stage 1 database. Run ONCE:
--
--   npx wrangler d1 execute davesharp-auction --remote --file=migration-stage2.sql
--
-- (Running it twice will error on "duplicate column name" — harmless, it just
-- means the columns are already there.)

ALTER TABLE auction ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE auction ADD COLUMN finalized INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bidders ADD COLUMN verify_code TEXT;
ALTER TABLE bidders ADD COLUMN verify_code_expires TEXT;
ALTER TABLE bidders ADD COLUMN verify_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bidders ADD COLUMN session_token TEXT;
ALTER TABLE bidders ADD COLUMN verified_at TEXT;
ALTER TABLE bidders ADD COLUMN last_outbid_email_at TEXT;

CREATE INDEX IF NOT EXISTS idx_bidders_session ON bidders(session_token);

-- Your existing auction row becomes status = 'draft' (hidden from the public)
-- after this migration. Publish it from the /admin panel, or re-run seed.sql.
