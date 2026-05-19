// POST /api/admin/config — create or update the auction configuration.
// Does NOT touch live bid state (current_bid, bid_count, finalized).
// Protected by Cloudflare Access.

import { json, accessOk } from '../_lib.js';

export async function onRequestPost({ env, request }) {
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const f = {
    painting_title: String(body.painting_title || '').trim(),
    size: String(body.size || '').trim(),
    medium: String(body.medium || '').trim(),
    story: String(body.story || '').trim(),
    image_path: String(body.image_path || '').trim(),
    starting_bid: Math.round(Number(body.starting_bid)),
    min_increment: Math.round(Number(body.min_increment)),
    max_bid: Math.round(Number(body.max_bid)),
    opens_at: String(body.opens_at || '').trim(),
    closes_at: String(body.closes_at || '').trim(),
    status: body.status === 'live' ? 'live' : 'draft',
  };

  if (!f.painting_title) return json({ error: 'title_required' }, 400);
  if (![f.starting_bid, f.min_increment, f.max_bid].every((n) => Number.isFinite(n) && n > 0)) {
    return json({ error: 'numbers_invalid' }, 400);
  }
  if (isNaN(Date.parse(f.opens_at)) || isNaN(Date.parse(f.closes_at))) {
    return json({ error: 'dates_invalid' }, 400);
  }
  if (Date.parse(f.closes_at) <= Date.parse(f.opens_at)) {
    return json({ error: 'close_before_open' }, 400);
  }

  const nowIso = new Date().toISOString();
  const exists = await env.DB.prepare('SELECT id FROM auction WHERE id = 1').first();

  if (exists) {
    await env.DB.prepare(
      `UPDATE auction SET painting_title=?, size=?, medium=?, story=?, image_path=?,
          starting_bid=?, min_increment=?, max_bid=?, opens_at=?, closes_at=?,
          status=?, updated_at=? WHERE id = 1`
    ).bind(f.painting_title, f.size, f.medium, f.story, f.image_path,
           f.starting_bid, f.min_increment, f.max_bid, f.opens_at, f.closes_at,
           f.status, nowIso).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO auction
        (id, painting_title, size, medium, story, image_path, currency,
         starting_bid, min_increment, max_bid, opens_at, closes_at, status,
         current_bid, current_bidder_id, bid_count, finalized, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?, ?, 0, NULL, 0, 0, ?)`
    ).bind(f.painting_title, f.size, f.medium, f.story, f.image_path,
           f.starting_bid, f.min_increment, f.max_bid, f.opens_at, f.closes_at,
           f.status, nowIso).run();
  }

  return json({ ok: true });
}
