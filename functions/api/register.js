// POST /api/register — { name, email, phone }
// Creates/updates the bidder, issues a fresh 6-digit code, emails it.

import { json, randomCode, sendEmail, verifyEmailContent } from './_lib.js';

export async function onRequestPost({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();

  if (!name || name.length > 120) return json({ error: 'name_required' }, 400);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'email_invalid' }, 400);
  if (phone.length > 40) return json({ error: 'phone_invalid' }, 400);

  const a = await env.DB.prepare('SELECT status, closes_at FROM auction WHERE id = 1').first();
  if (!a) return json({ error: 'no_auction' }, 404);
  if (a.status !== 'live') return json({ error: 'not_open' }, 409);
  if (Date.now() >= Date.parse(a.closes_at)) return json({ error: 'closed' }, 409);

  const code = randomCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Upsert on email. Re-registering refreshes details and issues a new code.
  await env.DB.prepare(
    `INSERT INTO bidders (name, email, phone, verify_code, verify_code_expires, verify_attempts, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       name = excluded.name,
       phone = excluded.phone,
       verify_code = excluded.verify_code,
       verify_code_expires = excluded.verify_code_expires,
       verify_attempts = 0`
  ).bind(name, email, phone, code, expires, nowIso).run();

  const sent = await sendEmail(env, { to: email, ...verifyEmailContent(code) });
  if (!sent) return json({ error: 'email_failed' }, 502);

  return json({ ok: true });
}
