// ============================================================
// scripts/sync-coin-universe.mjs — run by .github/workflows/sync-coin-universe.yml
//
// Same job as supabase/functions/sync-coin-universe, run from GitHub's
// servers instead of Supabase's.
//
// WHY, added 2026-09-29. From 03:26 UTC that day CoinGecko's CDN answered
// every request from Supabase's edge-function egress with HTTP 403,
// with or without our Demo API key (sync-market-data got the same
// 403 at 06:00). That is an IP-level block we cannot fix from our side,
// and with market_cache.cg_markets_all going stale every visitor's
// browser fell back to calling CoinGecko directly and hit its keyless
// rate limit ("too many API calls").
//
// Same guards as the edge function: a partial or malformed response
// never overwrites a good cache.
//
// Env: COINGECKO_API_KEY, SUPABASE_SERVICE_ROLE_KEY (repo secrets).
// ============================================================

import { FREE_COINS } from '../supabase/functions/sync-coin-universe/_vendor/coin-universe.mjs';

const SUPABASE_URL = 'https://wyvwycatgexpbugzkdfw.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COINGECKO_API_KEY = (process.env.COINGECKO_API_KEY || '').trim();

const MIN_RESOLVED_SHARE = 0.70;
const REQUIRED_FIELDS = [
  'id', 'symbol', 'current_price', 'market_cap', 'total_volume',
  'circulating_supply', 'total_supply',
  'price_change_percentage_7d_in_currency',
  'price_change_percentage_30d_in_currency',
];

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
  process.exit(1);
}

/* CoinGecko's CDN started answering our requests with a CloudFront 403
   on 2026-09-29 while the dashboard showed 0 credits used, i.e. the
   requests never reached the API. The cause is not documented, so the
   request is tried in a few shapes, most likely-to-pass first, and every
   status is logged (never the key). The first shape that works is used.

   - Default fetch User-Agent, key in header        (CoinGecko's documented form)
   - Default User-Agent, key as x_cg_demo_api_key  (documented alternative)
   - Two half-size requests                        (in case the ~3 KB query string trips a WAF length rule)
*/
const BASE = 'https://api.coingecko.com/api/v3/coins/markets'
  + '?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false'
  + '&price_change_percentage=7d,14d,30d';

async function get(ids, mode) {
  let url = BASE + '&ids=' + encodeURIComponent(ids.join(','));
  const headers = { 'Accept': 'application/json' };
  if (COINGECKO_API_KEY && mode === 'header') headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
  if (COINGECKO_API_KEY && mode === 'query') url += '&x_cg_demo_api_key=' + encodeURIComponent(COINGECKO_API_KEY);
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(`  ${mode.padEnd(6)} ids=${ids.length} urlLen=${url.length} -> HTTP ${res.status}`
    + (res.ok ? '' : ` ${text.replace(/\s+/g, ' ').slice(0, 120)}`));
  return res.ok ? JSON.parse(text) : null;
}

async function fetchUniverse() {
  console.log(`key present: ${COINGECKO_API_KEY ? 'yes (' + COINGECKO_API_KEY.length + ' chars)' : 'NO'}`);
  for (const mode of ['header', 'query']) {
    const all = await get(FREE_COINS, mode);
    if (all) return all;
    const half = Math.ceil(FREE_COINS.length / 2);
    const a = await get(FREE_COINS.slice(0, half), mode);
    const b = a && await get(FREE_COINS.slice(half), mode);
    if (a && b) return a.concat(b);
  }
  throw new Error('coins/markets failed in every request shape — see statuses above');
}

const rows = await fetchUniverse();
if (!Array.isArray(rows)) throw new Error('coins/markets did not return an array');

const resolved = rows.length / FREE_COINS.length;
if (resolved < MIN_RESOLVED_SHARE) {
  throw new Error(`only ${rows.length} of ${FREE_COINS.length} ids resolved — not overwriting the cache`);
}
const missing = REQUIRED_FIELDS.filter((f) => !(f in (rows[0] ?? {})));
if (missing.length) throw new Error(`response is missing expected fields: ${missing.join(', ')}`);

const up = await fetch(`${SUPABASE_URL}/rest/v1/market_cache?on_conflict=cache_key`, {
  method: 'POST',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify({
    cache_key: 'cg_markets_all',
    data: rows,
    updated_at: new Date().toISOString(),
  }),
});
if (!up.ok) {
  throw new Error(`market_cache upsert -> HTTP ${up.status} ${(await up.text()).slice(0, 300)}`);
}

const withMcap = rows.filter((r) => Number(r.market_cap) > 0).length;
const with30d = rows.filter((r) => r.price_change_percentage_30d_in_currency != null).length;
console.log(`[sync-coin-universe] wrote ${rows.length} coins (${withMcap} with mcap, ${with30d} with 30d)`
  + (COINGECKO_API_KEY ? ' [demo key]' : ' [no key]'));
