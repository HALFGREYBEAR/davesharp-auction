// POST /api/bid — places a bid.
// All money logic is enforced here on the server; the client is never trusted.

const ANTISNIPE_MS = 10 * 60 * 1000; // a bid in the last 10 min extends the close by 10 min

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function onRequestPost({ env, request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const committed = body.committed === true;
  const amount = Math.round(Number(body.amount));

  // --- Basic input validation ---
  if (!name || name.length > 120) return json({ error: 'name_required' }, 400);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'email_invalid' }, 400);
  if (!committed) return json({ error: 'not_committed' }, 400);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'amount_invalid' }, 400);

  // --- Load the auction ---
  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (!a) return json({ error: 'no_auction' }, 404);

  const now = Date.now();
  if (now < Date.parse(a.opens_at)) return json({ error: 'not_open' }, 409);
  if (now >= Date.parse(a.closes_at)) return json({ error: 'closed' }, 409);

  // --- Bid amount rules ---
  const minBid = Math.max(a.starting_bid, a.current_bid + a.min_increment);
  if (amount < minBid) {
    return json({ error: 'too_low', minBid, currentBid: a.current_bid }, 409);
  }
  if (amount > a.max_bid) {
    return json({ error: 'over_cap', maxBid: a.max_bid }, 409);
  }

  const nowIso = new Date(now).toISOString();

  // --- Find or create the bidder (email is the identity key) ---
  await env.DB.prepare(
    'INSERT OR IGNORE INTO bidders (name, email, phone, created_at) VALUES (?, ?, ?, ?)'
  ).bind(name, email, phone, nowIso).run();
  const bidder = await env.DB.prepare('SELECT id FROM bidders WHERE email = ?')
    .bind(email).first();
  if (!bidder) return json({ error: 'bidder_error' }, 500);
  const bidderId = bidder.id;

  // --- Anti-snipe: extend the close if this bid lands in the final window ---
  const closesMs = Date.parse(a.closes_at);
  let newCloses = a.closes_at;
  if (closesMs - now < ANTISNIPE_MS) {
    newCloses = new Date(now + ANTISNIPE_MS).toISOString();
  }

  // --- Race-safe compare-and-set ---
  // The WHERE current_bid < ? clause is the lock: if another bid raised the
  // price between our read above and this write, 0 rows change and we reject.
  const upd = await env.DB.prepare(
    `UPDATE auction
        SET current_bid = ?, current_bidder_id = ?, bid_count = bid_count + 1,
            closes_at = ?, updated_at = ?
      WHERE id = 1 AND current_bid < ?`
  ).bind(amount, bidderId, newCloses, nowIso, amount).run();

  if (!upd.meta || upd.meta.changes !== 1) {
    const fresh = await env.DB.prepare('SELECT current_bid FROM auction WHERE id = 1').first();
    return json({ error: 'outbid', currentBid: fresh ? fresh.current_bid : a.current_bid }, 409);
  }

  // --- Log the accepted bid ---
  await env.DB.prepare(
    'INSERT INTO bids (bidder_id, amount, created_at) VALUES (?, ?, ?)'
  ).bind(bidderId, amount, nowIso).run();

  // STAGE 2 will go here: email the previous high bidder (a.current_bidder_id)
  // a "you've been outbid" notification.

  return json({ ok: true, currentBid: amount, closesAt: newCloses });
}
