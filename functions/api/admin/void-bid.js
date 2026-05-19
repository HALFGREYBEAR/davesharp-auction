// POST /api/admin/void-bid — { bidId }
// Voids a bid and recomputes the auction leader from the highest remaining
// (non-voided) bid. This is the "roll to next bidder" control for when a
// winning bidder ghosts. Protected by Cloudflare Access.

import { json, accessOk, recomputeLeader } from '../_lib.js';

export async function onRequestPost({ env, request }) {
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const bidId = Math.round(Number(body.bidId));
  if (!Number.isFinite(bidId)) return json({ error: 'bad_request' }, 400);

  const bid = await env.DB.prepare('SELECT * FROM bids WHERE id = ?').bind(bidId).first();
  if (!bid) return json({ error: 'no_bid' }, 404);

  await env.DB.prepare('UPDATE bids SET voided = 1 WHERE id = ?').bind(bidId).run();
  await recomputeLeader(env);

  return json({ ok: true });
}
