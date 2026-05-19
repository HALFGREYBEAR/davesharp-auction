// GET /api/admin/data — full auction config, bid history, bidder list.
// Protected by Cloudflare Access (see README).

import { json, accessOk, phaseOf, finalizeIfClosed } from '../_lib.js';

export async function onRequestGet(ctx) {
  const { env, request } = ctx;
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  // Finalise here too: if the auction closed on the timer while only the admin
  // panel was open (no /api/state polls), this is what sends the winner email.
  await finalizeIfClosed(env, request, ctx);

  const auction = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();

  const bids = (await env.DB.prepare(
    `SELECT b.id, b.amount, b.created_at, b.voided, d.name, d.email
       FROM bids b JOIN bidders d ON d.id = b.bidder_id
      ORDER BY b.id DESC`
  ).all()).results || [];

  const bidders = (await env.DB.prepare(
    `SELECT id, name, email, phone, verified, banned, verified_at, created_at
       FROM bidders ORDER BY id DESC`
  ).all()).results || [];

  return json({ auction, phase: phaseOf(auction), bids, bidders });
}
