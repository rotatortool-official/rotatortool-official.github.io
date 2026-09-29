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
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';

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

async function fetchUniverse() {
  const url = 'https://api.coingecko.com/api/v3/coins/markets'
    + '?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false'
    + '&price_change_percentage=7d,14d,30d'
    + '&ids=' + encodeURIComponent(FREE_COINS.join(','));

  // One retry on 429/5xx — a GitHub runner shares nothing with other
  // tenants' traffic the way Supabase egress did, but be polite anyway.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RotatorSync/1.0 (+https://rotatortool-official.github.io)',
        ...(COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {}),
      },
    });
    if (res.ok) return res.json();
    const body = (await res.text().catch(() => '')).slice(0, 200);
    if (attempt === 1 && (res.status === 429 || res.status >= 500)) {
      console.warn(`coins/markets -> HTTP ${res.status}, retrying in 20s`);
      await new Promise((r) => setTimeout(r, 20000));
      continue;
    }
    throw new Error(`coins/markets -> HTTP ${res.status} ${body}`);
  }
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
