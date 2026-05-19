// POST /api/admin/reset — clears the auction so a new one can be set up.
//
// Permanently deletes every bid, bidder and session, and resets the auction
// row to a hidden draft. Painting config (title, prices, times) is left in
// place so the config form pre-fills — overwrite it for the new auction.
//
// Two guards:
//   - the typed confirmation ('RESET') must reach the server, so a stray POST
//     can't wipe the database;
//   - it refuses while bidding is live — close the auction first.
//
// Protected by Cloudflare Access.

import { json, accessOk, phaseOf } from '../_lib.js';

export async function onRequestPost({ env, request }) {
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  if (body.confirm !== 'RESET') return json({ error: 'confirm_required' }, 400);

  // Never wipe a running auction.
  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (phaseOf(a) === 'live') return json({ error: 'auction_live' }, 409);

  const nowIso = new Date().toISOString();

  // One atomic batch: clear participants, restart id numbering, reset state.
  // Order matters — bids/sessions reference bidders, so they go first.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM bids'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM bidders'),
    env.DB.prepare("DELETE FROM sqlite_sequence WHERE name IN ('bids', 'bidders')"),
    env.DB.prepare(
      `UPDATE auction SET
         status                   = 'draft',
         current_bid              = 0,
         current_bidder_id        = NULL,
         bid_count                = 0,
         finalized                = 0,
         winner_emailed_bidder_id = NULL,
         updated_at               = ?
       WHERE id = 1`
    ).bind(nowIso),
  ]);

  return json({ ok: true });
}
