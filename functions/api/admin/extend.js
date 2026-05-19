// POST /api/admin/extend — { minutes }
// Pushes the close time out by N minutes (from the later of now / current close,
// so a lapsed auction can be revived). Clears finalized so a closed auction
// can re-open. Protected by Cloudflare Access.

import { json, accessOk } from '../_lib.js';

export async function onRequestPost({ env, request }) {
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const minutes = Math.round(Number(body.minutes));
  if (!Number.isFinite(minutes) || minutes === 0) return json({ error: 'minutes_invalid' }, 400);

  const a = await env.DB.prepare('SELECT closes_at FROM auction WHERE id = 1').first();
  if (!a) return json({ error: 'no_auction' }, 404);

  const base = Math.max(Date.now(), Date.parse(a.closes_at));
  const newCloses = new Date(base + minutes * 60 * 1000).toISOString();

  await env.DB.prepare(
    'UPDATE auction SET closes_at = ?, finalized = 0, updated_at = ? WHERE id = 1'
  ).bind(newCloses, new Date().toISOString()).run();

  return json({ ok: true, closesAt: newCloses });
}
