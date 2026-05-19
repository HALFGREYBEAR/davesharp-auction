// POST /api/bid — { amount }
// The bidder is identified by their verified session cookie — no name/email
// in the body. All money logic is enforced here; the client is never trusted.

import { json, getSessionBidder, sendEmail, outbidEmailContent } from './_lib.js';

const ANTISNIPE_MS = 10 * 60 * 1000;     // a bid in the last 10 min extends the close
const OUTBID_THROTTLE_MS = 3 * 60 * 1000; // one outbid email per bidder per 3 min

export async function onRequestPost(ctx) {
  const { env, request } = ctx;

  // --- Identity: must be a verified bidder ---
  const bidder = await getSessionBidder(env, request);
  if (!bidder) return json({ error: 'not_verified' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'amount_invalid' }, 400);

  // --- Load the auction ---
  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (!a) return json({ error: 'no_auction' }, 404);

  const now = Date.now();
  if (a.status !== 'live') return json({ error: 'not_open' }, 409);
  if (now < Date.parse(a.opens_at)) return json({ error: 'not_open' }, 409);
  if (now >= Date.parse(a.closes_at)) return json({ error: 'closed' }, 409);

  // --- Bid amount rules ---
  const minBid = Math.max(a.starting_bid, a.current_bid + a.min_increment);
  if (amount < minBid) return json({ error: 'too_low', minBid, currentBid: a.current_bid }, 409);
  if (amount > a.max_bid) return json({ error: 'over_cap', maxBid: a.max_bid }, 409);

  const nowIso = new Date(now).toISOString();
  const previousBidderId = a.current_bidder_id;

  // --- Anti-snipe: extend the close if this bid lands in the final window ---
  let newCloses = a.closes_at;
  if (Date.parse(a.closes_at) - now < ANTISNIPE_MS) {
    newCloses = new Date(now + ANTISNIPE_MS).toISOString();
  }

  // --- Race-safe compare-and-set ---
  // WHERE current_bid < ? is the lock: if another bid raised the price between
  // our read and this write, 0 rows change and we reject as outbid.
  const upd = await env.DB.prepare(
    `UPDATE auction
        SET current_bid = ?, current_bidder_id = ?, bid_count = bid_count + 1,
            closes_at = ?, updated_at = ?
      WHERE id = 1 AND current_bid < ?`
  ).bind(amount, bidder.id, newCloses, nowIso, amount).run();

  if (!upd.meta || upd.meta.changes !== 1) {
    const fresh = await env.DB.prepare('SELECT current_bid FROM auction WHERE id = 1').first();
    return json({ error: 'outbid', currentBid: fresh ? fresh.current_bid : a.current_bid }, 409);
  }

  await env.DB.prepare('INSERT INTO bids (bidder_id, amount, created_at) VALUES (?, ?, ?)')
    .bind(bidder.id, amount, nowIso).run();

  // --- Email the previous high bidder (fire-and-forget, throttled) ---
  if (previousBidderId && previousBidderId !== bidder.id) {
    ctx.waitUntil(notifyOutbid(env, request, previousBidderId, amount));
  }

  return json({ ok: true, currentBid: amount, closesAt: newCloses });
}

async function notifyOutbid(env, request, prevBidderId, currentBid) {
  try {
    const prev = await env.DB.prepare('SELECT * FROM bidders WHERE id = ?')
      .bind(prevBidderId).first();
    if (!prev) return;
    const last = prev.last_outbid_email_at ? Date.parse(prev.last_outbid_email_at) : 0;
    if (Date.now() - last < OUTBID_THROTTLE_MS) return; // throttled — they were just told
    await env.DB.prepare('UPDATE bidders SET last_outbid_email_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), prevBidderId).run();
    const url = new URL(request.url).origin;
    await sendEmail(env, { to: prev.email, ...outbidEmailContent(currentBid, url) });
  } catch (e) {
    console.error('outbid notify error', e);
  }
}
