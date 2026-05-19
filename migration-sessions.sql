-- Run this ONLY if you already ran an earlier version of migration-stage2.sql
-- (the one that added a `session_token` column to bidders).
--
--   npx wrangler d1 execute davesharp-auction --remote --file=migration-sessions.sql
--
-- It adds the sessions table that replaces that single column, enabling a
-- bidder to be verified on several devices at once. Idempotent and safe —
-- the old `session_token` column is simply left unused.

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  bidder_id  INTEGER NOT NULL,
  created_at TEXT,
  FOREIGN KEY (bidder_id) REFERENCES bidders(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_bidder ON sessions(bidder_id);
