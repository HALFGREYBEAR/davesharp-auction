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

// BCC'd on the winner email only — the operator gets a copy confirming the
// email was sent and to which address. Edit here + redeploy to change.
const WIN_EMAIL_BCC = 'ben@halfgreybear.com';

export async function sendEmail(env, { to, subject, html, text, bcc }) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email skipped:', subject,
      '| to=' + to + (bcc ? ' bcc=' + bcc : ''));
    return false;
  }
  try {
    const payload = { from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text };
    if (bcc) payload.bcc = [bcc];
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

// Email type stacks — no serif anywhere. MONO is used only for the code digits.
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',SFMono-Regular,ui-monospace,Menlo,Consolas,monospace";

// Dark, branded email frame matching the auction site.
function shell(inner) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background-color:#0c0b09;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0c0b09" style="background-color:#0c0b09;">
<tr><td align="center" style="padding:34px 14px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background-color:#15130f;border:1px solid #2a2620;">
<tr><td style="padding:32px 36px 26px 36px;border-bottom:1px solid #2a2620;">
<div style="font-family:${SANS};font-weight:800;font-size:25px;letter-spacing:0.16em;color:#ede5d4;line-height:1;">DAVE&nbsp;SHARP</div>
<div style="font-family:${MONO};font-weight:400;font-size:10px;letter-spacing:0.34em;color:#f4a82a;margin-top:11px;">LIVE&nbsp;AUCTION</div>
</td></tr>
<tr><td style="padding:34px 36px 36px 36px;">
${inner}
</td></tr>
<tr><td style="padding:22px 36px 28px 36px;border-top:1px solid #2a2620;font-family:${SANS};font-size:12px;line-height:1.65;color:#6f685b;">
Reply to this email with any questions — a real person sees it.<br>
Dave Sharp — original artwork &amp; live painting
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Inner-content builders.
function eyebrow(text, color) {
  return `<div style="font-family:${MONO};font-size:10px;font-weight:400;letter-spacing:0.26em;text-transform:uppercase;color:${color};margin:0 0 12px 0;">${text}</div>`;
}
function headline(text) {
  return `<div style="font-family:${SANS};font-weight:800;font-size:27px;line-height:1.14;letter-spacing:-0.015em;color:#ede5d4;margin:0 0 14px 0;">${text}</div>`;
}
function para(text) {
  return `<p style="font-family:${SANS};font-size:15px;line-height:1.66;color:#c4bba8;margin:0 0 18px 0;">${text}</p>`;
}
function note(text) {
  return `<p style="font-family:${SANS};font-size:12.5px;line-height:1.6;color:#6f685b;margin:20px 0 0 0;">${text}</p>`;
}
function bigAmount(text) {
  return `<div style="font-family:${SANS};font-weight:800;font-size:46px;line-height:1;letter-spacing:-0.02em;color:#f4a82a;margin:6px 0 4px 0;">${text}</div>`;
}
function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 2px 0;">
<tr><td bgcolor="#f4a82a" style="background-color:#f4a82a;border-radius:100px;">
<a href="${url}" style="display:inline-block;font-family:${SANS};font-weight:700;font-size:13px;letter-spacing:0.03em;color:#0c0b09;text-decoration:none;padding:15px 32px;">${label}</a>
</td></tr></table>`;
}

export function verifyEmailContent(code) {
  return {
    subject: `Your auction code: ${code}`,
    text: `Your Dave Sharp auction verification code is ${code}. It expires in 15 minutes. If you didn't request it, ignore this email.`,
    html: shell(
      headline('Verify your email') +
      para('Enter this code on the auction page to confirm your email and start bidding.') +
      eyebrow('Your code', '#8a8273') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">
<tr><td align="center" bgcolor="#0c0b09" style="background-color:#0c0b09;border:1px solid #3a342a;padding:28px 14px;">
<div style="font-family:${MONO};font-weight:700;font-size:42px;letter-spacing:0.16em;color:#f4a82a;line-height:1;">${code}</div>
</td></tr></table>` +
      note("This code expires in 15 minutes. If you didn't request it, you can safely ignore this email.")
    ),
  };
}

export function outbidEmailContent(currentBid, url) {
  return {
    subject: `You've been outbid — Dave Sharp auction`,
    text: `You've been outbid. The current bid is now ${gbp(currentBid)}. Place a higher bid: ${url}`,
    html: shell(
      headline("You've been outbid") +
      para('Someone has placed a higher bid. The current bid now stands at:') +
      bigAmount(gbp(currentBid)) +
      button('Place a higher bid', url) +
      note('A bid in the final 10 minutes extends the close — so there is still time to win it.')
    ),
  };
}

export function winEmailContent(amount, title, url) {
  return {
    subject: `You won — Dave Sharp auction`,
    text: `Congratulations — your winning bid of ${gbp(amount)} took "${title}". You'll receive an invoice by email shortly. Payment is due within 24 hours of that invoice, or the painting passes to the next-highest bidder.`,
    html: shell(
      eyebrow('Auction won', '#f4a82a') +
      headline("Congratulations — it's yours") +
      para(`The winning bid on <strong style="color:#ede5d4;font-weight:700;">${title}</strong> is:`) +
      bigAmount(gbp(amount)) +
      para("You'll receive an invoice by email shortly. <strong style=\"color:#ede5d4;font-weight:700;\">Payment is due within 24 hours of that invoice</strong> — otherwise the painting passes to the next-highest bidder.") +
      note('Any questions? Just reply to this email.')
    ),
  };
}

// ---- Leader recompute ------------------------------------------------------

// Recomputes the auction's current bid / leader / count from the highest
// remaining non-voided bid. Used after voiding a bid or banning a bidder.
export async function recomputeLeader(env) {
  const top = await env.DB.prepare(
    'SELECT bidder_id, amount FROM bids WHERE voided = 0 ORDER BY amount DESC, id DESC LIMIT 1'
  ).first();
  const count = (await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM bids WHERE voided = 0'
  ).first()).c;
  const nowIso = new Date().toISOString();
  if (top) {
    await env.DB.prepare(
      'UPDATE auction SET current_bid = ?, current_bidder_id = ?, bid_count = ?, updated_at = ? WHERE id = 1'
    ).bind(top.amount, top.bidder_id, count, nowIso).run();
  } else {
    await env.DB.prepare(
      'UPDATE auction SET current_bid = 0, current_bidder_id = NULL, bid_count = 0, updated_at = ? WHERE id = 1'
    ).bind(nowIso).run();
  }
}

// ---- Finalisation ----------------------------------------------------------

// If the auction has closed and not yet been finalised, flip the flag
// (race-safe) and email the winner. Safe to call from any request.
// If the auction has closed, make sure the *current* winner has been emailed.
// Keyed on the winner's bidder id (not a one-shot flag): a winner change from
// a late void or ban re-triggers an email to the new winner, while the same
// winner is never emailed twice. Idempotent and race-safe; safe to call from
// any request (returns immediately if the auction is not closed).
export async function finalizeIfClosed(env, request, ctx) {
  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (!a || phaseOf(a) !== 'closed') return;
  if (!a.current_bidder_id) return; // no bids — no winner to email

  // Compare-and-set: only the request that records THIS winner sends an email.
  // Different winner than last recorded -> changes 1 row -> send.
  // Same winner already recorded -> changes 0 rows -> skip (no double email).
  const upd = await env.DB.prepare(
    `UPDATE auction SET winner_emailed_bidder_id = ?
       WHERE id = 1
         AND (winner_emailed_bidder_id IS NULL OR winner_emailed_bidder_id != ?)`
  ).bind(a.current_bidder_id, a.current_bidder_id).run();
  if (!upd.meta || upd.meta.changes !== 1) return; // this winner already emailed

  const winner = await env.DB.prepare('SELECT * FROM bidders WHERE id = ?')
    .bind(a.current_bidder_id).first();
  if (!winner) return;

  const url = new URL(request.url).origin;
  const mail = winEmailContent(a.current_bid, a.painting_title, url);
  const p = sendEmail(env, { to: winner.email, bcc: WIN_EMAIL_BCC, ...mail });
  if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  else await p;
}
