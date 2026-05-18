// GET /api/state — returns auction config + current live state.
// The public page calls this on load and polls it every few seconds.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'Someone';
}

export async function onRequestGet({ env }) {
  const a = await env.DB.prepare('SELECT * FROM auction WHERE id = 1').first();
  if (!a) return json({ error: 'no_auction' }, 404);

  const now = Date.now();
  const opens = Date.parse(a.opens_at);
  const closes = Date.parse(a.closes_at);

  let phase = 'scheduled';
  if (now >= closes) phase = 'closed';
  else if (now >= opens) phase = 'live';

  // Only expose the leader's first name — never full identity or email.
  let leader = null;
  if (a.current_bidder_id) {
    const b = await env.DB.prepare('SELECT name FROM bidders WHERE id = ?')
      .bind(a.current_bidder_id).first();
    if (b) leader = firstName(b.name);
  }

  return json({
    phase,
    painting: {
      title: a.painting_title,
      size: a.size,
      medium: a.medium,
      story: a.story,
      image: a.image_path,
    },
    currency: a.currency,
    startingBid: a.starting_bid,
    minIncrement: a.min_increment,
    maxBid: a.max_bid,
    currentBid: a.current_bid,
    bidCount: a.bid_count,
    leader,
    opensAt: a.opens_at,
    closesAt: a.closes_at,
    // serverTime lets the client run an accurate countdown even if the
    // visitor's device clock is wrong.
    serverTime: new Date().toISOString(),
  });
}
