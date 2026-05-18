-- Dave Sharp Auction — database schema
-- All money values are stored as whole pounds (integers). No pence, no floats.

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
  opens_at          TEXT NOT NULL,          -- ISO 8601 datetime
  closes_at         TEXT NOT NULL,          -- ISO 8601; extended by anti-snipe
  current_bid       INTEGER NOT NULL DEFAULT 0,
  current_bidder_id INTEGER,
  bid_count         INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT
);

-- One row per bidder, keyed by email. `verified` is enforced in Stage 2.
CREATE TABLE IF NOT EXISTS bidders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  verified     INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  created_at   TEXT
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

CREATE INDEX IF NOT EXISTS idx_bids_amount ON bids(amount);
CREATE INDEX IF NOT EXISTS idx_bidders_email ON bidders(email);
