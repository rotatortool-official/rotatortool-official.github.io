// ============================================================
// scripts/lib/coin-universe.mjs — which coins Rotator follows
// (HANDOVER.md Task 1, 2026-10-01)
//
// Pure functions, no network. The weekly job (select-coin-universe.mjs)
// feeds them CoinGecko and Supabase data; the 15-minute sync and
// compute-signal-run read the row they produce.
//
// The row, market_cache key 'coin_universe':
//   { asOf, core:[ids], fillers:[ids], tags:{id:'meme'}, stables:[ids],
//     retired:[{id, at, reason}], removed:[{id, reason}], added:[ids],
//     strikes:{id:n}, volumeBasis:{days7, h24} }
//
// core     the first 250 that survive the filters, market-cap order
// fillers  3 high-volume memes outside the 250, tagged filler 'meme'
// stables  fetched for the yield display, never ranked (config.js)
// retired  coins that left in the last RETIRE_WEEKS weeks. Still
//          fetched, so a visitor holding one keeps seeing it with a
//          "No longer in the top 250" note; never put forward.
// ============================================================

import fs from 'node:fs';
import vm from 'node:vm';

export const RULES = {
  CORE_SIZE: 250,
  JOIN_RANK: 240,        // a new coin joins inside the filtered top 240
  LEAVE_RANK: 275,       // a listed coin leaves below 275 ...
  LEAVE_STRIKES: 2,      // ... in two weekly runs in a row
  /* Two volume lines, average daily USD across all exchanges.
     Measured 2026-10-01: only 205 coins with a Binance USDT pair trade
     over $5M a day, even reading the top 1000, so "250 coins" and "none
     under $5M" cannot both hold. The owner chose 250 (2026-10-01):
       MIN_VOLUME_USD      to be on the list at all ($2M fills 250 today);
       PROMOTE_VOLUME_USD  to be put forward as a leader or turning coin.
     Coins between the two are listed, scored and shown to holders, and
     compute-signal-run marks them 'thin_volume' so nothing promotes them. */
  MIN_VOLUME_USD: 2e6,
  PROMOTE_VOLUME_USD: 5e6,
  VOLUME_DAYS: 7,        // days of stored volume before the average replaces 24h
  FILLERS: 3,
  RETIRE_WEEKS: 12,
  MIN_TOTAL: 200,        // fewer than this in core and nothing is written
  MAX_PRICE_GAP: 0.10,   // CoinGecko vs Binance price, to catch ticker collisions
  /* How deep to read CoinGecko's market-cap ranking. HANDOVER.md said the
     top 300; measured 2026-10-01 that yields 123 survivors, because 120 of
     the top 300 have no Binance USDT pair and 39 are stablecoins. So the
     job reads 250-coin pages until LEAVE_RANK + 25 coins survive, up to
     MAX_PAGES (the top 1000). Still about 5 calls a week. */
  PAGE_SIZE: 250,
  MAX_PAGES: 4,
  SURVIVORS_WANTED: 300,
};

/* Wrapped, staked and bridged copies the category calls can miss. A copy
   of an asset is not a second asset: it moves with the original and only
   duplicates it in every list. */
export const COPY_DENYLIST = new Set([
  'wrapped-bitcoin', 'weth', 'staked-ether', 'wrapped-steth', 'wrapped-eeth',
  'coinbase-wrapped-btc', 'rocket-pool-eth', 'binance-peg-weth', 'msol',
  'jito-staked-sol', 'mantle-staked-ether', 'renzo-restaked-eth',
  'kelp-dao-restaked-eth', 'wrapped-beacon-eth', 'lombard-staked-btc',
  'solv-btc', 'wrapped-bnb', 'binance-staked-sol', 'bridged-usdc-polygon-pos-bridge',
  'wbnb', 'wrapped-solana', 'wrapped-avax', 'wrapped-tron', 'cbeth',
  'frax-ether', 'staked-frax-ether', 'liquid-staked-ethereum', 'stakewise-v3-oseth',
]);
const COPY_NAME = /\b(wrapped|bridged|staked|restaked)\b/i;

/* STABLECOINS and the old FREE_COINS, read out of the site's own
   config.js so there is one copy of each. */
export function loadSiteConfig(configPath) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(configPath, 'utf8') + ';this.__out={FREE_COINS,STABLECOINS};',
    ctx,
  );
  return {
    FREE_COINS: [...ctx.__out.FREE_COINS],
    STABLECOINS: { ...ctx.__out.STABLECOINS },
  };
}

/* Average daily volume. volumeDays is the 'coin_volume_days' row:
   { 'YYYY-MM-DD': { id: usd } }. The average replaces the 24h figure
   only once VOLUME_DAYS days exist for that coin. */
export function avgVolume(id, h24, volumeDays) {
  const vals = Object.values(volumeDays || {})
    .map((d) => d && d[id])
    .filter((v) => Number.isFinite(v) && v >= 0);
  if (vals.length >= RULES.VOLUME_DAYS) {
    return { usd: vals.reduce((a, b) => a + b, 0) / vals.length, basis: 'days7' };
  }
  return { usd: Number(h24) || 0, basis: 'h24' };
}

/* Why a coin cannot be on the list at all, or null. */
function exclusionOf(c, ctx) {
  const id = c.id;
  if (ctx.stableIds.has(id) || ctx.stableCat.has(id)) return 'stablecoin';
  if (ctx.copyCat.has(id) || COPY_DENYLIST.has(id) || COPY_NAME.test(c.name || '')) return 'wrapped_or_staked';
  /* Tokenised equities belong to the bStocks list (config.js BSTOCK_LIST). */
  if (/-(b|x)stock$/.test(id) || /\btokeni[sz]ed\b/i.test(c.name || '')) return 'tokenized_stock';
  const sym = String(c.symbol || '').toUpperCase();
  /* Plain A-Z/0-9 tickers only, as in the 2026-09-25 batch: the site,
     the bot and the MK translation all key on the ticker. */
  if (!/^[A-Z0-9]{1,15}$/.test(sym)) return 'unusual_ticker';
  const bnb = ctx.binance.get(sym);
  if (bnb == null) return 'no_binance_usdt_pair';
  const p = Number(c.current_price);
  if (!(p > 0) || Math.abs(bnb - p) / p > RULES.MAX_PRICE_GAP) return 'binance_price_mismatch';
  if (!(Number(c.market_cap) > 0)) return 'no_market_cap';
  const v = avgVolume(id, c.total_volume, ctx.volumeDays);
  if (v.usd < RULES.MIN_VOLUME_USD) return 'volume_under_2m';
  return null;
}

/**
 * @param top         coins/markets rows by market cap, deep enough that
 *                    LEAVE_RANK coins survive (see SURVIVORS_WANTED)
 * @param memes       coins/markets rows for category=meme-token
 * @param stableCat   ids in CoinGecko's stablecoins category
 * @param copyCat     ids in the wrapped / liquid-staking categories
 * @param stableIds   STABLECOINS keys from config.js
 * @param binance     Map SYMBOL -> last price, TRADING USDT spot pairs
 * @param volumeDays  'coin_volume_days' row (may be empty)
 * @param prev        previous 'coin_universe' row, or null on the first run
 * @param fallbackListed  config.js FREE_COINS: what was listed before the first run
 * @param now         Date
 */
export function selectUniverse({ top, memes, stableCat, copyCat, stableIds, binance, volumeDays, prev, fallbackListed, now }) {
  const ctx = {
    stableIds: new Set(stableIds), stableCat: new Set(stableCat), copyCat: new Set(copyCat),
    binance, volumeDays,
  };
  const reasonOf = new Map();
  const ranked = [];            // survivors in market-cap order
  const seenSym = new Set();
  const byId = new Map();
  [...top].sort((a, b) => (Number(b.market_cap) || 0) - (Number(a.market_cap) || 0)).forEach((c) => {
    byId.set(c.id, c);
    let why = exclusionOf(c, ctx);
    const sym = String(c.symbol || '').toUpperCase();
    /* Two coins rendering one ticker: a holding matches whichever loaded
       first (the FRAX lesson, config.js 2026-09-09). The larger keeps it. */
    if (!why && seenSym.has(sym)) why = 'ticker_taken';
    if (why) { reasonOf.set(c.id, why); return; }
    seenSym.add(sym);
    ranked.push(c.id);
  });
  const rankOf = new Map(ranked.map((id, i) => [id, i + 1]));

  const prevCore = prev && Array.isArray(prev.core) ? prev.core : null;
  const strikes = {};
  const removed = [];
  let keep;

  if (!prevCore) {
    keep = ranked.slice(0, RULES.CORE_SIZE);
  } else {
    keep = [];
    for (const id of prevCore) {
      if (reasonOf.has(id) && reasonOf.get(id) !== 'ticker_taken') {
        removed.push({ id, reason: reasonOf.get(id) });       // fails a filter: out now
        continue;
      }
      const r = rankOf.get(id);
      if (r != null && r <= RULES.LEAVE_RANK) { keep.push(id); continue; }
      const n = ((prev.strikes || {})[id] || 0) + 1;
      if (n >= RULES.LEAVE_STRIKES) {
        removed.push({ id, reason: r == null ? 'outside_fetched_ranks' : 'rank_below_' + RULES.LEAVE_RANK });
      } else {
        strikes[id] = n;
        keep.push(id);
      }
    }
    const kept = new Set(keep);
    for (const id of ranked) {
      if (rankOf.get(id) > RULES.JOIN_RANK) break;
      if (!kept.has(id)) { keep.push(id); kept.add(id); }
    }
    /* Exactly CORE_SIZE: trim the lowest-ranked holdovers, or fill from
       the next ranks when departures leave room. */
    const order = (id) => rankOf.get(id) ?? Infinity;
    keep.sort((a, b) => order(a) - order(b));
    if (keep.length > RULES.CORE_SIZE) {
      for (const id of keep.slice(RULES.CORE_SIZE)) {
        removed.push({ id, reason: 'trimmed_to_' + RULES.CORE_SIZE });
        delete strikes[id];
      }
      keep = keep.slice(0, RULES.CORE_SIZE);
    }
    for (const id of ranked) {
      if (keep.length >= RULES.CORE_SIZE) break;
      if (!keep.includes(id)) keep.push(id);
    }
  }
  keep.sort((a, b) => (rankOf.get(a) ?? Infinity) - (rankOf.get(b) ?? Infinity));
  const core = keep;
  const coreSet = new Set(core);
  for (const id of Object.keys(strikes)) if (!coreSet.has(id)) delete strikes[id];

  /* Memes. A big meme that made the 250 on its own gets the tag; the
     fillers are the most-traded memes outside it, with a Binance pair. */
  const memeIds = new Set(memes.map((m) => m.id));
  const tags = {};
  for (const id of core) if (memeIds.has(id)) tags[id] = 'meme';
  const fillers = [];
  const coreSyms = new Set(core.map((id) => String(byId.get(id)?.symbol || '').toUpperCase()));
  for (const m of [...memes].sort((a, b) => (Number(b.total_volume) || 0) - (Number(a.total_volume) || 0))) {
    if (fillers.length >= RULES.FILLERS) break;
    if (coreSet.has(m.id)) continue;
    const sym = String(m.symbol || '').toUpperCase();
    if (coreSyms.has(sym) || !/^[A-Z0-9]{1,15}$/.test(sym)) continue;
    const bnb = binance.get(sym);
    const p = Number(m.current_price);
    if (bnb == null || !(p > 0) || Math.abs(bnb - p) / p > RULES.MAX_PRICE_GAP) continue;
    fillers.push(m.id);
    tags[m.id] = 'meme';
    coreSyms.add(sym);
  }

  /* Retired: everything that was listed and no longer is, kept fetchable
     for RETIRE_WEEKS so holders do not lose the coin overnight. */
  const iso = now.toISOString();
  const listed = new Set([...core, ...fillers]);
  const cutoff = now.getTime() - RULES.RETIRE_WEEKS * 7 * 864e5;
  const retired = new Map();
  for (const r of (prev && prev.retired) || []) {
    if (!listed.has(r.id) && Date.parse(r.at) >= cutoff) retired.set(r.id, r);
  }
  /* On the first run the hand-written list is what was listed before. */
  const prevListed = prev
    ? [...(prev.core || []), ...(prev.fillers || [])]
    : (fallbackListed || []).filter((id) => !ctx.stableIds.has(id));
  const removedIds = new Set(removed.map((r) => r.id));
  for (const id of prevListed) {
    if (listed.has(id) || retired.has(id)) continue;
    const why = removedIds.has(id)
      ? removed.find((r) => r.id === id).reason
      : prev ? 'filler_rotated' : (reasonOf.get(id) || (byId.has(id) ? 'not_selected' : 'outside_fetched_ranks'));
    if (!removedIds.has(id)) removed.push({ id, reason: why });
    retired.set(id, { id, at: iso, reason: why });
  }
  const prevSet = new Set(prevListed);
  const added = [...core, ...fillers].filter((id) => !prevSet.has(id));

  const basis = { days7: 0, h24: 0 };
  for (const id of core) basis[avgVolume(id, byId.get(id)?.total_volume, volumeDays).basis]++;

  return {
    asOf: iso,
    core, fillers, tags,
    stables: [...ctx.stableIds],
    retired: [...retired.values()],
    removed, added, strikes,
    volumeBasis: basis,
    // Coins that passed every filter, and how deep the ranking was read.
    survivors: ranked.length,
    fetched: top.length,
    rules: RULES,
    // Why each top-300 coin that is not on the list was left off.
    excluded: Object.fromEntries(reasonOf),
  };
}

/* Every id the 15-minute sync must fetch for a given row. */
export function idsToFetch(row) {
  const out = [];
  const seen = new Set();
  for (const id of [
    ...(row.core || []), ...(row.fillers || []), ...(row.stables || []),
    ...((row.retired || []).map((r) => r.id)),
  ]) {
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

/* The checks a row must pass before it may replace the live one. */
export function validateUniverse(row) {
  const problems = [];
  if (!Array.isArray(row.core) || row.core.length < RULES.MIN_TOTAL) {
    problems.push(`core has ${row.core ? row.core.length : 0} coins, need at least ${RULES.MIN_TOTAL}`);
  }
  if (new Set(row.core).size !== row.core.length) problems.push('core has duplicate ids');
  return problems;
}
