// Shared helpers for the auction API.
// Files starting with "_" are not routed by Cloudflare Pages — import-only.

// ---- HTTP helpers ----------------------------------------------------------

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

// ---- Cookies / session -----------------------------------------------------

export const SESSION_COOKIE = 'auction_session';

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookieHeader(token) {
  const maxAge = 14 * 24 * 60 * 60; // 14 days — long enough to cover an auction run
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function randomToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function randomCode() {
  // 6-digit numeric code, zero-padded.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

// Returns the verified bidder for the request's session cookie, or null.
// Sessions are per-device — a bidder may have several active at once.
export async function getSessionBidder(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const b = await env.DB.prepare(
    `SELECT b.* FROM bidders b
       JOIN sessions s ON s.bidder_id = b.id
      WHERE s.token = ? AND b.verified = 1`
  ).bind(token).first();
  return b || null;
}

// Cloudflare Access injects this header on every request that passed Access.
// localhost is allowed too so the admin panel is testable in `wrangler pages dev`.
export function accessOk(request) {
  if (request.headers.get('Cf-Access-Jwt-Assertion')) return true;
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

// ---- Auction phase ---------------------------------------------------------

export function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'Someone';
}

// 'draft' (hidden) | 'scheduled' (registration open, bidding not yet) |
// 'live' (bidding open) | 'closed'
export function phaseOf(a) {
  if (!a) return 'none';
  if (a.status !== 'live') return 'draft';
  const now = Date.now();
  if (now >= Date.parse(a.closes_at)) return 'closed';
  if (now >= Date.parse(a.opens_at)) return 'live';
  return 'scheduled';
}

// ---- Email (Resend) --------------------------------------------------------

const FROM = 'Dave Sharp Auction <auction@davesharp.art>';
const REPLY_TO = 'auction@davesharp.art';

export async function sendEmail(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email skipped:', subject);
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text }),
    });
    if (!r.ok) {
      console.error('Resend send failed', r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('Resend send error', e);
    return false;
  }
}

function gbp(n) {
  return '\u00A3' + Number(n || 0).toLocaleString('en-GB');
}

function shell(inner) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:30px 0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="468" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e3ddd0;">
<tr><td style="background:#0c0b09;padding:20px 26px;">
<div style="font-family:Georgia,serif;font-weight:bold;font-size:18px;color:#ede5d4;letter-spacing:.02em;">DAVE SHARP</div>
<div style="font-size:10px;letter-spacing:.26em;color:#f4a82a;text-transform:uppercase;margin-top:3px;">Live Auction</div>
</td></tr>
<tr><td style="padding:26px;color:#2a2722;font-size:15px;line-height:1.6;">${inner}</td></tr>
<tr><td style="padding:15px 26px;border-top:1px solid #e3ddd0;font-size:12px;color:#8a8273;">
Reply to this email with any questions — a real person will see it.
</td></tr>
</table></td></tr></table></body></html>`;
}

export function verifyEmailContent(code) {
  return {
    subject: `Your auction code: ${code}`,
    text: `Your Dave Sharp auction verification code is ${code}. It expires in 15 minutes.`,
    html: shell(`
      <p style="margin:0 0 14px;">Here is your code to verify your email and bid in the auction:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:.14em;color:#0c0b09;background:#f4f1ea;border-radius:6px;padding:16px;text-align:center;">${code}</div>
      <p style="margin:14px 0 0;color:#8a8273;font-size:13px;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>`),
  };
}

export function outbidEmailContent(currentBid, url) {
  return {
    subject: `You've been outbid — Dave Sharp auction`,
    text: `Someone has placed a higher bid. The current bid is now ${gbp(currentBid)}. Place a new bid: ${url}`,
    html: shell(`
      <p style="margin:0 0 12px;">You've been outbid. The current bid is now:</p>
      <div style="font-size:30px;font-weight:bold;color:#0c0b09;">${gbp(currentBid)}</div>
      <p style="margin:14px 0 20px;">There's still time to place a higher bid.</p>
      <a href="${url}" style="display:inline-block;background:#f4a82a;color:#0c0b09;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:100px;font-size:14px;">Place a new bid</a>`),
  };
}

export function winEmailContent(amount, title, url) {
  return {
    subject: `You won — Dave Sharp auction`,
    text: `Congratulations — your bid of ${gbp(amount)} won "${title}". You'll receive an invoice by email to complete the purchase. Reply with any questions.`,
    html: shell(`
      <p style="margin:0 0 12px;">Congratulations — you won the auction for <strong>${title}</strong> with a winning bid of:</p>
      <div style="font-size:30px;font-weight:bold;color:#0c0b09;">${gbp(amount)}</div>
      <p style="margin:14px 0 0;">You'll receive an invoice by email shortly to complete the purchase. Reply to this email with any questions.</p>`),
  };
}

// ---- Finalisation ----------------------------------------------------------

// If the auction has closed and not yet been finalised, flip the flag
// (race-safe) and email the winner. Safe to call from any request.
export async function finalizeIfClosed(env, request, ctx) {
  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (!a || phaseOf(a) !== 'closed' || a.finalized) return;

  const upd = await env.DB.prepare(
    'UPDATE auction SET finalized = 1 WHERE id = 1 AND finalized = 0'
  ).run();
  if (!upd.meta || upd.meta.changes !== 1) return; // another request got there first

  if (!a.current_bidder_id) return; // no bids — nothing to send
  const winner = await env.DB.prepare('SELECT * FROM bidders WHERE id = ?')
    .bind(a.current_bidder_id).first();
  if (!winner) return;

  const url = new URL(request.url).origin;
  const mail = winEmailContent(a.current_bid, a.painting_title, url);
  const p = sendEmail(env, { to: winner.email, ...mail });
  if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  else await p;
}
