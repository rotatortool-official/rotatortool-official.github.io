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
// WHICH COINS, since 2026-10-01 (HANDOVER.md Task 1): the list in
// market_cache 'coin_universe', written weekly by
// scripts/select-coin-universe.mjs. cg_markets_all holds exactly
// core + fillers + stables, because that row is what compute-signal-run
// scores and every score is a rank inside it. With no 'coin_universe'
// row the hand-written FREE_COINS in js/config.js is used, as before.
//
// Coins that left the list ('retired') go to their own row,
// 'cg_markets_retired', refreshed hourly, so a visitor who holds one
// still sees it without it entering the scored universe.
//
// Each run also stores the day's 24h volume per coin in
// 'coin_volume_days' (last 8 UTC days). The weekly selection and
// compute-signal-run average it once 7 days exist.
//
// CoinGecko cost: 2 calls a run (96 runs = 192/day) plus 1 an hour for
// retired coins, about 216/day of the Demo plan's ~330/day.
//
// Same guards as the edge function: a partial or malformed response
// never overwrites a good cache.
//
// Env: COINGECKO_API_KEY, SUPABASE_SERVICE_ROLE_KEY (repo secrets).
// ============================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig, idsToFetch } from './lib/coin-universe.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const RETIRED_EVERY_MS = 55 * 60 * 1000;
const VOLUME_DAYS_KEPT = 8;

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
  process.exit(1);
}

/* CoinGecko's CDN started answering a single 250-id request (a 3.1 KB
   URL) with a CloudFront 403 on 2026-09-29 while two ~1.65 KB halves
   passed. The cause is not documented, so ids are packed into requests
   whose URL stays under URL_BUDGET, and a refused request is split in
   two and retried. Every status is logged with the URL length (never
   the key). */
const BASE = 'https://api.coingecko.com/api/v3/coins/markets'
  + '?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false'
  + '&price_change_percentage=7d,14d,30d';
const URL_BUDGET = 1900;
const urlFor = (ids) => BASE + '&ids=' + encodeURIComponent(ids.join(','));

async function get(ids) {
  const url = urlFor(ids);
  const headers = { Accept: 'application/json' };
  if (COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(`  ids=${ids.length} urlLen=${url.length} -> HTTP ${res.status}`
    + (res.ok ? '' : ` ${text.replace(/\s+/g, ' ').slice(0, 120)}`));
  if (res.ok) return JSON.parse(text);
  if ((res.status === 403 || res.status === 414) && ids.length > 20) {
    const h = Math.ceil(ids.length / 2);
    return [...await get(ids.slice(0, h)), ...await get(ids.slice(h))];
  }
  throw new Error(`coins/markets -> HTTP ${res.status}`);
}

/* Fewest requests that keep every URL under the budget, ids balanced
   between them so no request is much longer than the others. */
async function fetchIds(ids) {
  const total = urlFor(ids).length - BASE.length;
  const n = Math.max(1, Math.ceil(total / (URL_BUDGET - BASE.length)));
  const size = Math.ceil(ids.length / n);
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(...await get(ids.slice(i, i + size)));
  return out;
}

async function supa(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`supabase ${pathAndQuery.split('?')[0]} -> HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return init.method === 'POST' ? null : res.json();
}
async function cacheRead(key) {
  const rows = await supa(`market_cache?cache_key=eq.${key}&select=data,updated_at`);
  return rows && rows[0] ? rows[0] : null;
}
async function cacheWrite(key, data) {
  await supa('market_cache?on_conflict=cache_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ cache_key: key, data, updated_at: new Date().toISOString() }),
  });
}

console.log(`key present: ${COINGECKO_API_KEY ? 'yes (' + COINGECKO_API_KEY.length + ' chars)' : 'NO'}`);

/* ── Which coins ─────────────────────────────────────────────── */
const uni = (await cacheRead('coin_universe'))?.data;
let wanted, retiredIds;
if (uni && Array.isArray(uni.core) && uni.core.length >= 200) {
  wanted = idsToFetch({ ...uni, retired: [] });
  const live = new Set(wanted);
  retiredIds = (uni.retired || []).map((r) => r.id).filter((id) => !live.has(id));
  console.log(`coin_universe of ${uni.asOf}: ${uni.core.length} core, ${(uni.fillers || []).length} fillers, `
    + `${(uni.stables || []).length} stables, ${retiredIds.length} retired`);
} else {
  wanted = loadSiteConfig(path.join(ROOT, 'js', 'config.js')).FREE_COINS;
  retiredIds = [];
  console.log(`no usable coin_universe row, using config.js FREE_COINS (${wanted.length})`);
}

/* ── The scored universe ─────────────────────────────────────── */
const rows = await fetchIds(wanted);
if (!Array.isArray(rows)) throw new Error('coins/markets did not return an array');

const resolved = rows.length / wanted.length;
if (resolved < MIN_RESOLVED_SHARE) {
  throw new Error(`only ${rows.length} of ${wanted.length} ids resolved — not overwriting the cache`);
}
const missing = REQUIRED_FIELDS.filter((f) => !(f in (rows[0] ?? {})));
if (missing.length) throw new Error(`response is missing expected fields: ${missing.join(', ')}`);

await cacheWrite('cg_markets_all', rows);

const withMcap = rows.filter((r) => Number(r.market_cap) > 0).length;
const with30d = rows.filter((r) => r.price_change_percentage_30d_in_currency != null).length;
console.log(`[sync-coin-universe] wrote ${rows.length} coins (${withMcap} with mcap, ${with30d} with 30d)`
  + (COINGECKO_API_KEY ? ' [demo key]' : ' [no key]'));

/* ── Daily volume, for the 7-day average ────────────────────────
   Overwritten all day, so each UTC day ends holding its last reading.
   Best effort: a failure here must not fail the price sync. */
try {
  const days = (await cacheRead('coin_volume_days'))?.data || {};
  const today = new Date().toISOString().slice(0, 10);
  const vols = {};
  for (const r of rows) if (Number.isFinite(r.total_volume)) vols[r.id] = Math.round(r.total_volume);
  days[today] = vols;
  const keep = Object.keys(days).sort().slice(-VOLUME_DAYS_KEPT);
  await cacheWrite('coin_volume_days', Object.fromEntries(keep.map((d) => [d, days[d]])));
  console.log(`coin_volume_days: ${keep.length} days stored (${keep[0]} .. ${keep[keep.length - 1]})`);
} catch (e) {
  console.warn('coin_volume_days not updated:', e.message);
}

/* ── Retired coins, hourly ──────────────────────────────────────
   Best effort as well: holders see the last copy if this fails. */
try {
  const prevRetired = await cacheRead('cg_markets_retired');
  const age = prevRetired ? Date.now() - Date.parse(prevRetired.updated_at) : Infinity;
  if (!retiredIds.length) {
    if (prevRetired && (prevRetired.data || []).length) await cacheWrite('cg_markets_retired', []);
  } else if (age > RETIRED_EVERY_MS) {
    const ret = await fetchIds(retiredIds);
    await cacheWrite('cg_markets_retired', ret);
    console.log(`cg_markets_retired: wrote ${ret.length} of ${retiredIds.length}`);
  }
} catch (e) {
  console.warn('cg_markets_retired not updated:', e.message);
}
