// POST /api/verify — { email, code }
// Checks the 6-digit code; on success marks the bidder verified and sets
// an HttpOnly session cookie. Codes are limited to 5 attempts.

import { json, randomToken, sessionCookieHeader } from './_lib.js';

export async function onRequestPost({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.code || '').trim();
  if (!email || !code) return json({ error: 'bad_request' }, 400);

  const b = await env.DB.prepare('SELECT * FROM bidders WHERE email = ?').bind(email).first();
  if (!b || !b.verify_code) return json({ error: 'no_code' }, 409);

  if (Date.now() >= Date.parse(b.verify_code_expires)) {
    return json({ error: 'code_expired' }, 409);
  }
  if ((b.verify_attempts || 0) >= 5) {
    await env.DB.prepare('UPDATE bidders SET verify_code = NULL WHERE id = ?').bind(b.id).run();
    return json({ error: 'too_many_attempts' }, 429);
  }
  if (String(b.verify_code) !== code) {
    await env.DB.prepare('UPDATE bidders SET verify_attempts = verify_attempts + 1 WHERE id = ?')
      .bind(b.id).run();
    return json({ error: 'code_wrong' }, 409);
  }

  // Mark verified and clear the code. The session is a separate row, so a
  // bidder can be verified on several devices at once.
  const token = randomToken();
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE bidders SET verified = 1, verified_at = ?,
        verify_code = NULL, verify_code_expires = NULL, verify_attempts = 0
      WHERE id = ?`
  ).bind(nowIso, b.id).run();
  await env.DB.prepare(
    'INSERT INTO sessions (token, bidder_id, created_at) VALUES (?, ?, ?)'
  ).bind(token, b.id, nowIso).run();

  return json(
    { ok: true, name: b.name, firstName: (b.name || '').trim().split(/\s+/)[0] },
    200,
    { 'Set-Cookie': sessionCookieHeader(token) }
  );
}
