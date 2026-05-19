-- Adds the bidder ban flag. Run ONCE:
--
--   npx wrangler d1 execute davesharp-auction --remote --file=migration-ban.sql
--
-- (Running it twice errors on "duplicate column name" — harmless.)

ALTER TABLE bidders ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
