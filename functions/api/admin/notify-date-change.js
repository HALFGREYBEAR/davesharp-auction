// POST /api/admin/notify-date-change
//
// Emails every verified, non-banned bidder telling them the auction's
// closing time has changed. The body of the email reads the *current*
// closes_at from the DB — so the workflow is: update the date (via Save
// or Extend), then click Notify.
//
// Manual only — never triggered by saving the config. This is deliberate
// so an admin can adjust the close time multiple times without spamming
// the bidders, and only press Send when they're ready.
//
// Protected by Cloudflare Access. Returns { ok, sent, failed, total }.

import { json, accessOk, sendEmail, dateChangeEmailContent } from '../_lib.js';

export async function onRequestPost({ env, request }) {
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (!a) return json({ error: 'no_auction' }, 404);

  const bidders = (await env.DB.prepare(
    'SELECT email FROM bidders WHERE verified = 1 AND banned = 0 AND email IS NOT NULL'
  ).all()).results || [];

  if (!bidders.length) {
    return json({ ok: true, sent: 0, failed: 0, total: 0 });
  }

  const url = new URL(request.url).origin;
  const mail = dateChangeEmailContent(a.closes_at, a.current_bid, a.painting_title, url);

  // Sequential sends — sendEmail's HTTP latency (~200–500ms each) is a
  // natural rate limit, comfortably under Resend's 2/s free-tier cap.
  // For sub-50 bidders this also stays under Pages Functions' wall-clock
  // limit. A larger audience would want ctx.waitUntil + a queue.
  let sent = 0;
  let failed = 0;
  for (const b of bidders) {
    const ok = await sendEmail(env, { to: b.email, ...mail });
    if (ok) sent++; else failed++;
  }

  return json({ ok: true, sent, failed, total: bidders.length });
}
