-- Seeds the single auction row. EDIT every value below for the real auction.
-- Money is whole pounds. Dates are ISO 8601 with timezone offset.
-- Re-running this RESETS the auction (bids included), so run it once per piece.
-- You can also manage all of this from the /admin panel instead of editing here.

INSERT OR REPLACE INTO auction
  (id, painting_title, size, medium, story, image_path,
   currency, starting_bid, min_increment, max_bid,
   opens_at, closes_at, status,
   current_bid, current_bidder_id, bid_count, finalized, updated_at)
VALUES
  (1,
   'Michael Jackson — Original Live Painting',
   '100 x 80 cm',
   'Acrylic on canvas',
   'The original canvas from Dave Sharp''s viral live performance. One of a kind, signed, with a certificate of authenticity.',
   '/painting.jpg',
   'GBP',
   500,        -- starting bid (EDIT)
   25,         -- minimum increment (EDIT)
   25000,      -- maximum bid cap (EDIT)
   '2026-05-23T19:00:00+01:00',   -- opens_at (EDIT)
   '2026-05-25T20:00:00+01:00',   -- closes_at (EDIT)
   'live',     -- 'live' shows the auction publicly; 'draft' hides it
   0, NULL, 0, 0, NULL);
