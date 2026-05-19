// POST /api/admin/close — closes the auction immediately and emails the winner.
// Protected by Cloudflare Access.

import { json, accessOk, finalizeIfClosed } from '../_lib.js';

export async function onRequestPost(ctx) {
  const { env, request } = ctx;
  if (!accessOk(request)) return json({ error: 'forbidden' }, 403);

  const nowIso = new Date().toISOString();
  await env.DB.prepare('UPDATE auction SET closes_at = ?, updated_at = ? WHERE id = 1')
    .bind(nowIso, nowIso).run();

  await finalizeIfClosed(env, request, ctx);
  return json({ ok: true });
}
