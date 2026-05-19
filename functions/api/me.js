// GET /api/me — reports whether the current visitor is a verified bidder.
// The page calls this on load to decide between the register form and the
// bid form.

import { json, getSessionBidder, firstName } from './_lib.js';

export async function onRequestGet({ env, request }) {
  const b = await getSessionBidder(env, request);
  if (!b) return json({ verified: false });
  return json({ verified: true, name: b.name, firstName: firstName(b.name) });
}
