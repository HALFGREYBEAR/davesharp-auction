// POST /api/admin/ban — { bidderId, banned }
// Bans or unbans a bidder. Banning also voids ALL of that bidder's bids and
// rolls the auction leader back to the highest remaining valid bid, so a
// nuisance bidder can be removed cleanly mid-auction. Unbanning only restores
// their ability to bid again — it does not un-void past bids.
// Protected by Cloudflare Access.

import { json, accessOk, recomputeLeader } from '../_lib.js';

export async function onRequestPost({ env, request }) {
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const bidderId = Math.round(Number(body.bidderId));
  const banned = body.banned === true;
  if (!Number.isFinite(bidderId)) return json({ error: 'bad_request' }, 400);

  const bidder = await env.DB.prepare('SELECT id FROM bidders WHERE id = ?')
    .bind(bidderId).first();
  if (!bidder) return json({ error: 'no_bidder' }, 404);

  await env.DB.prepare('UPDATE bidders SET banned = ? WHERE id = ?')
    .bind(banned ? 1 : 0, bidderId).run();

  if (banned) {
    // A banned bidder holds no bids — void them all, then recompute the leader.
    await env.DB.prepare('UPDATE bids SET voided = 1 WHERE bidder_id = ?')
      .bind(bidderId).run();
    await recomputeLeader(env);
  }

  return json({ ok: true, banned });
}
