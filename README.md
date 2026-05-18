# Dave Sharp Auction — Stage 1

A standalone live ascending auction. Astro + Cloudflare Pages + Cloudflare D1.

Stage 1 (this build): auction page, live polling, race-safe bid engine, anti-snipe.
Stage 2 (next): email verification, outbid notifications, admin panel.

**Stage 1 is NOT for public launch** — it has no email verification yet, so it
is the testable foundation only.

## One-time setup

Install dependencies:

    npm install

Create the D1 database:

    npx wrangler d1 create davesharp-auction

Copy the `database_id` it prints into `wrangler.toml` (replacing
`REPLACE_WITH_DATABASE_ID`).

Create the tables:

    npx wrangler d1 execute davesharp-auction --remote --file=schema.sql

Seed the auction config (edit `seed.sql` first — the painting details, bid
figures and dates are placeholders):

    npx wrangler d1 execute davesharp-auction --remote --file=seed.sql

Add the painting image to `public/` and make sure `image_path` in `seed.sql`
points at it (e.g. `/painting.jpg`).

## Local development

    npm run build
    npx wrangler pages dev dist

This runs the site and the API functions together against D1.
(`npm run dev` alone runs only the Astro front end, without the API.)

## Deploy

Push to a new GitHub repo, then create a Cloudflare Pages project pointed at it:

- Build command: `npm run build`
- Output directory: `dist`
- Add the D1 binding in Pages > Settings > Functions: variable name `DB`,
  database `davesharp-auction`.
