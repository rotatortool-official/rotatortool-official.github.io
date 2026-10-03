// ============================================================
// sync-coin-about.mjs — the coin window's "About" block, for every coin
// (promptove/87, 2026-10-03)
//
// For each coin on the live list (market_cache 'cg_markets_all'), asks
// CoinGecko's per-coin record for the official website, whitepaper, X
// account, explorer, GitHub and description, and writes them all to
// market_cache 'coin_about' = { updatedAt, coins: { <id>: About } }.
// The site reads that row (js/data-loaders.js _tdAbout), so every coin
// window shows the full block at once.
//
// Why not live from each visitor's browser (the first version): CoinGecko's
// public API allows a few calls a minute per connection, so a visitor who
// opened several coins, or anyone sharing a connection, got only the
// "View on CoinGecko" button. Daniel saw exactly that on 2026-10-03.
//
// Runs on GitHub, not Supabase, because CoinGecko blocks Supabase's egress
// IPs (see select-coin-universe.yml). Paced for the demo key's 30 calls a
// minute: 262 coins take about 10 minutes.
//
// A coin that fails this run keeps its previous entry; a coin no longer
// on the list is dropped. Nothing is written if fewer than half the coins
// resolved, so a CoinGecko outage cannot blank the row.
//
//   node scripts/sync-coin-about.mjs            (needs SUPABASE_SERVICE_ROLE_KEY)
//   node scripts/sync-coin-about.mjs --dry-run  (reads only; prints the counts)
//   add --limit 5 to try it on the first five coins
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://wyvwycatgexpbugzkdfw.supabase.co';
const DRY = process.argv.includes('--dry-run');
const CG_KEY = (process.env.COINGECKO_API_KEY || '').trim();
const PACE_MS = CG_KEY ? 2200 : 6500;

function readKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY) return null;
  const m = fs.readFileSync(path.join(ROOT, 'js', 'supabase.js'), 'utf8').match(/var SUPA_KEY = '([^']+)'/);
  return m && m[1];
}
const KEY = readKey();
if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY is not set'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const okUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };

/* The same fields, and the same rules, as _tdAboutPick in data-loaders.js:
   http(s) only, an X handle that is a real handle, two sentences of
   description at most 320 characters. */
function pick(d) {
  const l = d.links || {};
  const first = (a) => (a || []).find((x) => x && okUrl(x)) || null;
  const text = String(d.description?.en || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || (text ? [text] : []);
  let desc = sentences.slice(0, 2).join('').trim();
  if (desc.length > 320) desc = desc.slice(0, 317).replace(/\s+\S*$/, '') + '…';
  return {
    site: first(l.homepage),
    paper: okUrl(l.whitepaper || '') ? l.whitepaper : null,
    x: /^[A-Za-z0-9_]{1,15}$/.test(l.twitter_screen_name || '') ? l.twitter_screen_name : null,
    explorer: first(l.blockchain_site),
    code: first(l.repos_url?.github),
    desc,
  };
}

async function coin(id) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}`
    + '?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false';
  const headers = { Accept: 'application/json', ...(CG_KEY ? { 'x-cg-demo-api-key': CG_KEY } : {}) };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return pick(await res.json());
    if (res.status === 429) { console.log(`  ${id}: 429, waiting 61s`); await sleep(61000); continue; }
    console.log(`  ${id}: HTTP ${res.status}`);
    return null;
  }
  return null;
}

const markets = await cacheRow('cg_markets_all');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > 0 ? Number(process.argv[i + 1]) : 0; })();
const ids = [...new Set((markets || []).map((c) => c && c.id).filter(Boolean))].slice(0, LIMIT || undefined);
if (!ids.length) { console.error('cg_markets_all is empty; nothing to do'); process.exit(1); }
const prev = (await cacheRow('coin_about'))?.coins || {};
console.log(`${ids.length} coins on the list, ${Object.keys(prev).length} in the previous row`);

const coins = {};
let fresh = 0;
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  let a = null;
  try { a = await coin(id); } catch (e) { console.log(`  ${id}: ${e.message}`); }
  if (a) { coins[id] = a; fresh++; }
  else if (prev[id]) coins[id] = prev[id];       // keep last week's
  if ((i + 1) % 50 === 0) console.log(`${i + 1}/${ids.length}`);
  await sleep(PACE_MS);
}

const n = (k) => Object.values(coins).filter((c) => c[k]).length;
const summary = { coins: ids.length, fresh, kept: Object.keys(coins).length - fresh,
  website: n('site'), whitepaper: n('paper'), x: n('x'), explorer: n('explorer'), code: n('code'), description: n('desc'),
  noWebsite: ids.filter((id) => !coins[id]?.site) };
console.log(JSON.stringify(summary, null, 1));

if (fresh < ids.length / 2) { console.error(`only ${fresh}/${ids.length} resolved; previous row kept`); process.exit(1); }
if (DRY) { console.log('dry run: nothing written'); process.exit(0); }
await cacheWrite('coin_about', { updatedAt: new Date().toISOString(), coins });
console.log('wrote market_cache coin_about');
