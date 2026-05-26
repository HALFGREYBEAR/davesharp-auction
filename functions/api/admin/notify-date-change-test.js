// POST /api/admin/notify-date-change-test
//
// Sends ONE copy of the date-change email — to the Cloudflare Access-
// authenticated admin (or, on localhost, to an address passed in the body).
// Use this as a dry-run before pressing the bulk "Send to all bidders"
// button: you see exactly what a real bidder will receive.
//
// The email body is identical to the real bulk send. We deliberately do
// NOT tag it as a test in the subject — so what you see is what bidders
// will see. Distinguish it from the real thing by the timestamp / the
// fact that only you got it.
//
// Protected by Cloudflare Access. Returns { ok, to }.

import { json, accessOk, sendEmail, dateChangeEmailContent, adminEmailFromRequest } from '../_lib.js';

export async function onRequestPost({ env, request }) {
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  // Recipient: the Cloudflare Access-authenticated admin email — taken
  // from either the convenience header or, if that isn't populated, the
  // JWT payload. Falls back to a body-supplied address on localhost
  // where Access doesn't run.
  let to = adminEmailFromRequest(request);
  if (!to) {
    try {
      const body = await request.json();
      to = String((body && body.to) || '').trim();
    } catch { /* ignore */ }
  }
  if (!to) return json({ error: 'no_admin_email' }, 400);

  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (!a) return json({ error: 'no_auction' }, 404);

  const url = new URL(request.url).origin;
  const mail = dateChangeEmailContent(a.closes_at, a.current_bid, a.painting_title, url);
  const ok = await sendEmail(env, { to, ...mail });

  return json({ ok, to, sent: ok ? 1 : 0, failed: ok ? 0 : 1 });
}
