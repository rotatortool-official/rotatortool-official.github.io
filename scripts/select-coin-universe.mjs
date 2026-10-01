// ============================================================
// scripts/select-coin-universe.mjs — run weekly by
// .github/workflows/select-coin-universe.yml (HANDOVER.md Task 1)
//
// Picks the coin list from the real market and writes it to
// market_cache 'coin_universe'. Every consumer reads it from there:
// the 15-minute sync (scripts/sync-coin-universe.mjs), the site
// (js/config.js loadCoinUniverse), compute-signal-run and the bot.
// The rules are in scripts/lib/coin-universe.mjs.
//
// Runs on GitHub, not Supabase, because CoinGecko blocks Supabase's
// egress IPs (HTTP 403 since 2026-09-29).
//
// Cost: about 8 CoinGecko calls a week: 5 category lists (meme,
// stablecoin, wrapped, liquid-staking, liquid-restaking) and 250-coin
// market-cap pages until 300 coins pass the filters (3 pages on
// 2026-10-01; HANDOVER.md's top 300 leaves only 123).
//
// FAIL SAFE: any failed step, or a result under 200 coins, writes
// nothing and exits non-zero. The last good list stays in use. The
// previous row is copied to 'coin_universe_prev' before the new one is
// written, so a bad week can be rolled back by hand:
//   update market_cache set data = (select data from market_cache
//     where cache_key = 'coin_universe_prev') where cache_key = 'coin_universe';
//
//   node scripts/select-coin-universe.mjs --dry-run [--out file.json]
// reads with the public key, writes nothing, prints the result.
//
// Env: COINGECKO_API_KEY, SUPABASE_SERVICE_ROLE_KEY (repo secrets).
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, loadSiteConfig, selectUniverse, validateUniverse } from './lib/coin-universe.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://wyvwycatgexpbugzkdfw.supabase.co';
const DRY = process.argv.includes('--dry-run');
const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : null; })();
const CG_KEY = (process.env.COINGECKO_API_KEY || '').trim();

/* A dry run reads with the publishable key the site already ships;
   a real run needs the service key to write. */
function readKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY) return null;
  const m = fs.readFileSync(path.join(ROOT, 'js', 'supabase.js'), 'utf8').match(/var SUPA_KEY = '([^']+)'/);
  return m && m[1];
}
const KEY = readKey();
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY is not set'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cg(query) {
  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=false&' + query;
  const headers = { Accept: 'application/json', ...(CG_KEY ? { 'x-cg-demo-api-key': CG_KEY } : {}) };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers });
    console.log(`  coingecko ${query.slice(0, 70)} -> HTTP ${res.status}`);
    if (res.ok) {
      const j = await res.json();
      if (!Array.isArray(j)) throw new Error(`coins/markets ${query} did not return an array`);
      await sleep(CG_KEY ? 800 : 6000);   // keyless (local dry run) is rate-limited hard
      return j;
    }
    if (res.status === 429 && attempt === 0) { await sleep(61000); continue; }
    throw new Error(`coins/markets ${query} -> HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
}

async function supa(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`supabase ${pathAndQuery.split('?')[0]} -> HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 || init.method === 'POST' ? null : res.json();
}

async function cacheRow(key) {
  const rows = await supa(`market_cache?cache_key=eq.${key}&select=data`);
  return rows && rows[0] ? rows[0].data : null;
}

async function cacheWrite(key, data) {
  await supa('market_cache?on_conflict=cache_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ cache_key: key, data, updated_at: new Date().toISOString() }),
  });
}

const { STABLECOINS, FREE_COINS } = loadSiteConfig(path.join(ROOT, 'js', 'config.js'));
/* 'frax' is a classifier entry only (config.js 2026-09-09), never fetched. */
const stableIds = Object.keys(STABLECOINS).filter((id) => id !== 'frax');

console.log(`[select-coin-universe] ${DRY ? 'DRY RUN, nothing is written' : 'live'}; `
  + `key ${CG_KEY ? 'present' : 'absent'}`);

const spot = await supa('binance_spot_metrics?select=base_asset,last_price');
if (!Array.isArray(spot) || spot.length < 300) throw new Error(`binance_spot_metrics has ${spot && spot.length} rows, too few to trust`);
const binance = new Map(spot.map((r) => [String(r.base_asset).toUpperCase(), Number(r.last_price)]));

const prev = await cacheRow('coin_universe');
const volumeDays = (await cacheRow('coin_volume_days')) || {};

const memes = await cg('category=meme-token&order=market_cap_desc&per_page=250&page=1');
const stableCat = (await cg('category=stablecoins&order=market_cap_desc&per_page=250&page=1')).map((c) => c.id);
const copyCat = [
  ...(await cg('category=wrapped-tokens&order=market_cap_desc&per_page=250&page=1')),
  ...(await cg('category=liquid-staking-tokens&order=market_cap_desc&per_page=250&page=1')),
  ...(await cg('category=liquid-restaking-tokens&order=market_cap_desc&per_page=250&page=1')),
].map((c) => c.id);

/* Read the market-cap ranking a page at a time until enough coins pass
   the filters (RULES.SURVIVORS_WANTED), see the note on PAGE_SIZE. */
const top = [];
let row;
for (let page = 1; page <= RULES.MAX_PAGES; page++) {
  const rows = await cg(`order=market_cap_desc&per_page=${RULES.PAGE_SIZE}&page=${page}`);
  if (rows.length < RULES.PAGE_SIZE * 0.9) throw new Error(`market-cap page ${page} returned ${rows.length} coins`);
  top.push(...rows);
  row = selectUniverse({
    top, memes, stableCat, copyCat, stableIds, binance, volumeDays, prev,
    fallbackListed: FREE_COINS, now: new Date(),
  });
  if (row.survivors >= RULES.SURVIVORS_WANTED) break;
}
console.log(`read the top ${top.length} by market cap, ${row.survivors} passed the filters`);
const problems = validateUniverse(row);

const vol = new Map(top.map((c) => [c.id, Number(c.total_volume) || 0]));
const counts = {};
for (const r of Object.values(row.excluded)) counts[r] = (counts[r] || 0) + 1;
console.log(`core ${row.core.length}, fillers ${row.fillers.join(', ') || 'none'}, `
  + `meme tags ${Object.keys(row.tags).length}, retired ${row.retired.length}`);
console.log(`volume basis: ${row.volumeBasis.days7} on the ${RULES.VOLUME_DAYS}-day average, ${row.volumeBasis.h24} on 24h`);
console.log(`left off the top ${top.length}:`, JSON.stringify(counts));
console.log(`added ${row.added.length}: ${row.added.join(', ')}`);
console.log(`removed ${row.removed.length}: ${row.removed.map((r) => r.id + ' (' + r.reason + ')').join(', ')}`);
const minVol = Math.min(...row.core.map((id) => vol.get(id) ?? Infinity));
console.log(`lowest 24h volume in core: $${(minVol / 1e6).toFixed(1)}M`);

if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify(row, null, 2));
  if (DRY) fs.writeFileSync(OUT.replace(/\.json$/, '') + '.inputs.json',
    JSON.stringify({ top, memes, stableCat, copyCat, stableIds, binance: [...binance], volumeDays, prev }));
}
if (problems.length) {
  console.error('NOT WRITTEN: ' + problems.join('; '));
  process.exit(1);
}
if (DRY) process.exit(0);

if (prev) await cacheWrite('coin_universe_prev', prev);
await cacheWrite('coin_universe', row);
console.log('[select-coin-universe] wrote coin_universe');
