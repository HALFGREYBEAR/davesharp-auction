-- ============================================================
--  reset-auction.sql
--  Clears the current auction so a fresh one can be set up.
--
--  Run it against the PRODUCTION database:
--    wrangler d1 execute davesharp-auction --remote --file=./reset-auction.sql
--
--  DESTRUCTIVE — cannot be undone. Run it only once an auction
--  has closed and you've recorded the result (winner + final
--  price). Screenshot the admin panel first if you want a record.
-- ============================================================

-- ---- 1. Clear the previous auction's data ------------------

-- Every bid from the last auction. Always cleared — this is the
-- data that was wrongly carrying over between auctions.
DELETE FROM bids;

-- Login sessions (they reference bidders). Always cleared.
DELETE FROM sessions;

-- Registered bidders.
--   DEFAULT (line below active): wiped — a clean slate. Everyone
--   re-registers for the new auction. NOTE: this also clears any
--   bans you have applied.
--   TO KEEP BIDDERS instead (so returning bidders stay verified):
--   delete the "DELETE FROM bidders;" line, and remove 'bidders'
--   from the sqlite_sequence line below it.
DELETE FROM bidders;

-- Restart id numbering so the new auction starts clean at 1.
DELETE FROM sqlite_sequence WHERE name IN ('bids', 'bidders');

-- ---- 2. Reset the auction itself to a hidden draft ---------

-- Zeroes the live state and sets status to 'draft' so the auction
-- is hidden while you configure the next one. Painting details /
-- prices / times are left untouched — overwrite them in step 3
-- or from the admin panel.
UPDATE auction SET
  status                   = 'draft',
  current_bid              = 0,
  current_bidder_id        = NULL,
  bid_count                = 0,
  finalized                = 0,
  winner_emailed_bidder_id = NULL,
  updated_at               = NULL
WHERE id = 1;

-- ---- 3. (Optional) Configure the new auction ---------------

-- If you set the auction up from the admin panel, ignore this.
-- Otherwise fill in the new painting and uncomment this block.
-- Times are ISO 8601 in UTC. Leave status as 'draft' until ready,
-- then set it to 'live' (here or in the admin panel) to open it.
--
-- UPDATE auction SET
--   painting_title = 'New Painting Title',
--   size           = '100 x 80 cm',
--   medium         = 'Acrylic on canvas',
--   story          = 'One-of-a-kind original from ...',
--   image_path     = '/painting.jpg',
--   currency       = 'GBP',
--   starting_bid   = 100,
--   min_increment  = 25,
--   max_bid        = 25000,
--   opens_at       = '2026-06-01T18:00:00Z',
--   closes_at      = '2026-06-01T20:00:00Z',
--   status         = 'draft'
-- WHERE id = 1;
