# Dave Sharp Auction — Stage 2

A standalone live ascending auction. Astro + Cloudflare Pages + Cloudflare D1,
with email verification, notification emails, and an admin panel.

## What Stage 2 adds over Stage 1

- **Bidder verification.** Bidders register (name, email, phone) and confirm a
  6-digit code emailed to them. Works two ways: pre-register any time after the
  auction is published, or verify inline at first bid. Once verified, a session
  cookie makes every later bid one tap.
- **Emails (via Resend).** Verification code, "you've been outbid" (throttled to
  one per bidder per 3 minutes), and a winner notice when the auction closes.
- **Admin panel** at `/admin` — configure the auction, monitor live state and
  bid history, and run controls (close early, extend, void a bid / roll to the
  next bidder). Protected by Cloudflare Access.
- **Draft / live status.** A new auction is `draft` (hidden). Publish it from
  the admin panel when ready.

All money is whole pounds. The bid engine (race-safe compare-and-set,
anti-snipe, cap) is unchanged from Stage 1.

---

## Upgrading an existing Stage 1 deployment

If Stage 1 is already deployed, do these four things.

### 1. Migrate the database (run once)

    npx wrangler d1 execute davesharp-auction --remote --file=migration-stage2.sql

This adds the verification, session and status columns. After it runs, your
existing auction row becomes `status = 'draft'` (hidden) — you publish it again
from the admin panel in step 4.

### 2. Add the Resend API key

In the Cloudflare dashboard: **Pages → davesharp-auction → Settings →
Variables and secrets → Add → Secret**.

- Name: `RESEND_API_KEY`
- Value: your Resend API key

It is a secret, so it lives in the dashboard, not in `wrangler.toml`. Emails
send from and reply to `auction@davesharp.art` (your verified Resend domain).
If the key is missing, registration fails cleanly with an on-screen error
rather than sending nothing silently.

### 3. Protect the admin panel with Cloudflare Access

The admin endpoints reject any request without a Cloudflare Access header, so
**the admin panel will not work until this is done** (this is deliberate —
it fails closed).

In the Cloudflare dashboard: **Zero Trust → Access → Applications → Add an
application → Self-hosted**.

- Application name: e.g. `Auction Admin`
- Add **two** application paths (same app, "Add a domain"):
  - `auction.davesharp.art` path `/admin`
  - `auction.davesharp.art` path `/api/admin`
- Policy: **Allow**, rule type **Emails**, listing your and Dave's email
  addresses.
- Identity / login method: one-time PIN by email is simplest.

Both paths must be covered or the panel loads but its API calls return 403.

### 4. Deploy and publish

Push to the connected GitHub repo — Cloudflare rebuilds and deploys. Then open
`auction.davesharp.art/admin`, set the auction details, and switch **Visibility**
to **Live** to publish it.

---

## Fresh setup from scratch

    npm install
    npx wrangler d1 create davesharp-auction          # paste database_id into wrangler.toml
    npx wrangler d1 execute davesharp-auction --remote --file=schema.sql
    npx wrangler d1 execute davesharp-auction --remote --file=seed.sql

Then create a Cloudflare Pages project pointed at the GitHub repo:

- Build command: `npm run build`
- Output directory: `dist`
- D1 binding: variable name `DB`, database `davesharp-auction`
- Add the `RESEND_API_KEY` secret and Cloudflare Access as above.

Put the painting image in `public/` and point `image_path` at it
(e.g. `/painting.jpg`), or set it from the admin panel.

---

## Local development

    npm run build
    npx wrangler pages dev dist

Runs the site and the API functions together against a local D1.

Notes for local testing:
- Apply the schema to the local database first:
  `npx wrangler d1 execute davesharp-auction --local --file=schema.sql`
  then seed it (`seed.sql`, with an `opens_at` in the past and `closes_at` in
  the future so it is `live`).
- Email won't send locally without `RESEND_API_KEY` — registration returns
  `email_failed`, but the bidder and code are still written. Read the code from
  the local database to continue testing the verify flow.
- The admin panel works on `localhost` without Cloudflare Access (the access
  check allows localhost for development only).

`npm run dev` alone runs only the Astro front end, without the API.

---

## API summary

Public:
- `GET  /api/state` — auction config + live state; also finalises the winner
  once closed.
- `GET  /api/me` — whether the current visitor is a verified bidder.
- `POST /api/register` — `{name,email,phone}` → issues and emails a code.
- `POST /api/verify` — `{email,code}` → verifies and sets the session cookie.
- `POST /api/bid` — `{amount}` — bidder identified by the session cookie.

Admin (behind Cloudflare Access):
- `GET  /api/admin/data` — full config, bid history, bidder list.
- `POST /api/admin/config` — create / update the auction (never touches live
  bid totals).
- `POST /api/admin/close` — close now and email the winner.
- `POST /api/admin/extend` — `{minutes}` — move the close time.
- `POST /api/admin/void-bid` — `{bidId}` — void a bid, roll the leader back to
  the next-highest remaining bid.
