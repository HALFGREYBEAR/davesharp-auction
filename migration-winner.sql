-- Adds winner-email tracking so a winner change after a void/ban
-- correctly re-emails the new winner. Run ONCE against the live DB:
--   npx wrangler d1 execute davesharp-auction --remote --file=migration-winner.sql
ALTER TABLE auction ADD COLUMN winner_emailed_bidder_id INTEGER;
