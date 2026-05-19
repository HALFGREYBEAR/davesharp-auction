-- Dave Sharp Auction — database schema (Stage 2)
-- Money is stored as whole pounds (integers). No pence, no floats.
-- For a brand-new database, run this file. For an existing Stage 1 database,
-- run migration-stage2.sql instead.

-- Single active auction lives in row id = 1.
CREATE TABLE IF NOT EXISTS auction (
  id                INTEGER PRIMARY KEY,
  painting_title    TEXT NOT NULL,
  size              TEXT,
  medium            TEXT,
  story             TEXT,
  image_path        TEXT,
  currency          TEXT NOT NULL DEFAULT 'GBP',
  starting_bid      INTEGER NOT NULL,
  min_increment     INTEGER NOT NULL,
  max_bid           INTEGER NOT NULL,
  opens_at          TEXT NOT NULL,                  -- ISO 8601 datetime
  closes_at         TEXT NOT NULL,                  -- ISO 8601; extended by anti-snipe
  status            TEXT NOT NULL DEFAULT 'draft',  -- 'draft' = hidden, 'live' = public
  current_bid       INTEGER NOT NULL DEFAULT 0,
  current_bidder_id INTEGER,
  bid_count         INTEGER NOT NULL DEFAULT 0,
  finalized         INTEGER NOT NULL DEFAULT 0,     -- 1 once the winner email has gone out
  updated_at        TEXT
);

-- One row per bidder, keyed by email. Verification happens once per bidder.
CREATE TABLE IF NOT EXISTS bidders (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  phone                TEXT,
  verified             INTEGER NOT NULL DEFAULT 0,
  verify_code          TEXT,
  verify_code_expires  TEXT,
  verify_attempts      INTEGER NOT NULL DEFAULT 0,
  verified_at          TEXT,
  last_outbid_email_at TEXT,
  created_at           TEXT
);

-- Append-only log of every accepted bid.
CREATE TABLE IF NOT EXISTS bids (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bidder_id  INTEGER NOT NULL,
  amount     INTEGER NOT NULL,
  created_at TEXT,
  voided     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (bidder_id) REFERENCES bidders(id)
);

-- One row per verified device/browser. A bidder can hold several at once,
-- so registering on a second device does not log the first one out.
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  bidder_id  INTEGER NOT NULL,
  created_at TEXT,
  FOREIGN KEY (bidder_id) REFERENCES bidders(id)
);

CREATE INDEX IF NOT EXISTS idx_bids_amount ON bids(amount);
CREATE INDEX IF NOT EXISTS idx_bidders_email ON bidders(email);
CREATE INDEX IF NOT EXISTS idx_sessions_bidder ON sessions(bidder_id);
