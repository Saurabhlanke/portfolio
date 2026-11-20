// Cloudflare Pages Function: a read-only pass-through to the public FPL API.
// The browser can't call fantasy.premierleague.com directly (no CORS headers),
// so the site calls /api/<path> and this function forwards it.
// Nothing is stored: no Cloudflare cache, and responses tell browsers not to keep them.

const ORIGIN = 'https://fantasy.premierleague.com/api/';

// Only these FPL endpoints are reachable through the proxy.
const ROUTES = [
  /^bootstrap-static$/,
  /^event-status$/,
  /^fixtures$/,
  /^event\/\d+\/live$/,
  /^leagues-classic\/\d+\/standings$/,
  /^entry\/\d+$/,
  /^entry\/\d+\/history$/,
  /^entry\/\d+\/transfers$/,
  /^entry\/\d+\/event\/\d+\/picks$/,
  /^element-summary\/\d+$/,
];

export async function onRequestGet({ params, request }) {
  const path = [].concat(params.path || []).join('/').replace(/\/+$/, '');
  if (!ROUTES.some((re) => re.test(path))) return json({ error: 'Not an allowed FPL endpoint' }, 404);

  const inUrl = new URL(request.url);
  const qs = new URLSearchParams();
  for (const k of ['page_standings', 'event']) if (inUrl.searchParams.has(k)) qs.set(k, inUrl.searchParams.get(k));
  const target = ORIGIN + path + '/' + (qs.toString() ? '?' + qs : '');

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (league-site)', Accept: 'application/json' },
      cf: { cacheTtl: 0, cacheEverything: false },
      cache: 'no-store',
    });
  } catch (e) {
    return json({ error: 'Could not reach the FPL API' }, 502);
  }
  if (!upstream.ok) {
    // FPL returns 503 with an HTML page while it updates after a gameweek.
    const msg = upstream.status === 503 ? 'The FPL game is updating. Try again in a few minutes.' : 'FPL API returned ' + upstream.status;
    return json({ error: msg }, upstream.status === 404 ? 404 : 502);
  }
  return new Response(upstream.body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
