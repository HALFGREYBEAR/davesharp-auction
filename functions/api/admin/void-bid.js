// POST /api/admin/void-bid — { bidId }
// Voids a bid and recomputes the auction leader from the highest remaining
// (non-voided) bid. This is the "roll to next bidder" control for when a
// winning bidder ghosts. Protected by Cloudflare Access.

import { json, accessOk } from '../_lib.js';

export async function onRequestPost({ env, request }) {
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const bidId = Math.round(Number(body.bidId));
  if (!Number.isFinite(bidId)) return json({ error: 'bad_request' }, 400);

  const bid = await env.DB.prepare('SELECT * FROM bids WHERE id = ?').bind(bidId).first();
  if (!bid) return json({ error: 'no_bid' }, 404);

  await env.DB.prepare('UPDATE bids SET voided = 1 WHERE id = ?').bind(bidId).run();

  // Recompute the leader from the highest remaining non-voided bid.
  const top = await env.DB.prepare(
    'SELECT bidder_id, amount FROM bids WHERE voided = 0 ORDER BY amount DESC, id DESC LIMIT 1'
  ).first();
  const count = (await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM bids WHERE voided = 0'
  ).first()).c;

  const nowIso = new Date().toISOString();
  if (top) {
    await env.DB.prepare(
      'UPDATE auction SET current_bid = ?, current_bidder_id = ?, bid_count = ?, updated_at = ? WHERE id = 1'
    ).bind(top.amount, top.bidder_id, count, nowIso).run();
  } else {
    await env.DB.prepare(
      'UPDATE auction SET current_bid = 0, current_bidder_id = NULL, bid_count = 0, updated_at = ? WHERE id = 1'
    ).bind(nowIso).run();
  }

  return json({ ok: true });
}
