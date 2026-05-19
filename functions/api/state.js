// GET /api/state — auction config + current live state.
// The public page calls this on load and polls it every few seconds.
// It also triggers winner finalisation once the auction has closed.

import { json, firstName, phaseOf, finalizeIfClosed, getSessionBidder } from './_lib.js';

export async function onRequestGet(ctx) {
  const { env, request } = ctx;
  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (!a) return json({ error: 'no_auction' }, 404);

  const phase = phaseOf(a);

  // First poll after the close fires the winner email (race-safe inside).
  // Once closed, ensure the winner is emailed on every poll. The function is
  // idempotent per winner, so this also catches a winner change from a void/ban.
  if (phase === 'closed') {
    await finalizeIfClosed(env, request, ctx);
  }

  // Draft auctions are hidden — expose nothing but the phase.
  if (phase === 'draft') {
    return json({ phase: 'draft', serverTime: new Date().toISOString() });
  }

  // Only ever expose the leader's first name — never full identity or email.
  // youLead tells the polling bidder (and only them) whether they currently
  // hold the high bid — kept live so a voided/outbid leader sees it drop.
  let leader = null;
  let youLead = false;
  if (a.current_bidder_id) {
    const b = await env.DB.prepare('SELECT name FROM bidders WHERE id = ?')
      .bind(a.current_bidder_id).first();
    if (b) leader = firstName(b.name);
    const viewer = await getSessionBidder(env, request);
    if (viewer && viewer.id === a.current_bidder_id) youLead = true;
  }

  return json({
    phase,
    painting: {
      title: a.painting_title,
      size: a.size,
      medium: a.medium,
      story: a.story,
      image: a.image_path,
    },
    currency: a.currency,
    startingBid: a.starting_bid,
    minIncrement: a.min_increment,
    maxBid: a.max_bid,
    currentBid: a.current_bid,
    bidCount: a.bid_count,
    leader,
    youLead,
    opensAt: a.opens_at,
    closesAt: a.closes_at,
    // serverTime lets the client run an accurate countdown even if the
    // visitor's device clock is wrong.
    serverTime: new Date().toISOString(),
  });
}
