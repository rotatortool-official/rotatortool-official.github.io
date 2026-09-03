// ============================================================
// sync-rotation-snapshot — Supabase Edge Function
//
// Records today's "Rotation Opportunities" (strong asset -> weak asset
// pairs) into `rotation_snapshots`, using the SAME scoring formula as
// the live dashboard's computeScores() in js/data-loaders.js.
//
// WHY THIS EXISTS:
// The site previously tried to record these client-side, once per
// visitor per day (takeRotationSnapshot() in js/signal-history.js) via
// an RPC (record_rotation_snapshot) and table (rotation_snapshots) that
// TURNED OUT NEVER TO HAVE BEEN CREATED — confirmed via direct query,
// zero rows, function doesn't exist. Every "call" made by the rotation
// feature since it shipped was silently lost; only whatever happened to
// sit in one browser's localStorage ever existed. This function
// replaces that fragile, traffic-dependent design with the same
// reliable pattern already used by signal_snapshots (real, 99-day,
// 1980-row history) — a scheduled server-side job, immune to whether
// anyone actually visits the site that day.
//
// FIDELITY NOTE:
// This ports computeScores()'s Layer 1 (intra-list momentum rank),
// Layer 2 (macro relative strength vs BTC/Gold/Silver/Oil/DXY/Total3),
// and Layer 3 (tokenomics quality) exactly, using the same weights and
// formula as the live dashboard. It deliberately does NOT implement the
// zone-hysteresis/deadband classifier or the BTC Mayer Multiple
// adaptive-threshold modifier — those only affect which zone a coin is
// labeled when a VISITOR has holdings. A server-side snapshot has no
// concept of "holdings", and the site's own code already falls back to
// plain top-5-by-score vs bottom-5-by-score in that exact situation
// (see the fallback branch in takeRotationSnapshot(), js/signal-history.js)
// — so using pure score ranking here IS the faithful behavior, not a
// shortcut around it.
//
// DATA SOURCES (all already-cached, no new external API calls):
//   market_cache['cg_markets_all']  — full ~177-coin CoinGecko markets
//                                      snapshot (price, 7d/14d/30d %,
//                                      supply, mcap, volume)
//   market_cache['macro_data']      — BTC/Gold/Silver/Oil/DXY/Total3 7D %
//   TOKENOMICS_DB / STABLECOINS     — embedded below, mirrors config.js
//                                      exactly (keep both in sync manually)
//
// DEPLOY:
//   supabase functions deploy sync-rotation-snapshot
//   supabase secrets set ROTATION_SYNC_SECRET=<own secret, same reasoning
//     as BSTOCKS_SYNC_SECRET/MARKET_CYCLE_SYNC_SECRET — never reuse the
//     project-wide SYNC_SECRET>
//
// SCHEDULE: once daily. See sql/sync_rotation_snapshot_cron.sql.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ROTATION_SYNC_SECRET  = Deno.env.get('ROTATION_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── TOKENOMICS_DB — mirrors js/config.js exactly. Keep in sync manually. ──
const TOKENOMICS_DB: Record<string, { deflation: string; unlockRisk: string }> = {
  'bitcoin':              {deflation:'fixed',   unlockRisk:'low'},
  'ethereum':             {deflation:'partial', unlockRisk:'low'},
  'binancecoin':          {deflation:'full',    unlockRisk:'low'},
  'solana':               {deflation:'none',    unlockRisk:'medium'},
  'ripple':               {deflation:'none',    unlockRisk:'high'},
  'dogecoin':             {deflation:'none',    unlockRisk:'low'},
  'cardano':              {deflation:'none',    unlockRisk:'low'},
  'avalanche-2':          {deflation:'partial', unlockRisk:'medium'},
  'shiba-inu':            {deflation:'partial', unlockRisk:'low'},
  'chainlink':            {deflation:'none',    unlockRisk:'high'},
  'polkadot':             {deflation:'none',    unlockRisk:'medium'},
  'bitcoin-cash':         {deflation:'fixed',   unlockRisk:'low'},
  'near':                 {deflation:'none',    unlockRisk:'medium'},
  'litecoin':             {deflation:'fixed',   unlockRisk:'low'},
  'uniswap':              {deflation:'partial', unlockRisk:'medium'},
  'internet-computer':    {deflation:'none',    unlockRisk:'high'},
  'ethereum-classic':     {deflation:'fixed',   unlockRisk:'low'},
  'stellar':              {deflation:'partial', unlockRisk:'medium'},
  'monero':               {deflation:'none',    unlockRisk:'low'},
  'okb':                  {deflation:'full',    unlockRisk:'low'},
  'hedera-hashgraph':     {deflation:'none',    unlockRisk:'high'},
  'filecoin':             {deflation:'none',    unlockRisk:'high'},
  'cosmos':               {deflation:'none',    unlockRisk:'medium'},
  'vechain':              {deflation:'partial', unlockRisk:'low'},
  'tron':                 {deflation:'partial', unlockRisk:'low'},
  'sui':                  {deflation:'none',    unlockRisk:'high'},
  'aptos':                {deflation:'none',    unlockRisk:'high'},
  'sei-network':          {deflation:'none',    unlockRisk:'high'},
  'render-token':         {deflation:'partial', unlockRisk:'medium'},
  'jupiter-exchange-solana':{deflation:'partial',unlockRisk:'medium'},
  'aave':                 {deflation:'partial', unlockRisk:'low'},
  'the-graph':            {deflation:'none',    unlockRisk:'high'},
  'curve-dao-token':      {deflation:'partial', unlockRisk:'medium'},
  'maker':                {deflation:'full',    unlockRisk:'low'},
  'lido-dao':             {deflation:'none',    unlockRisk:'medium'},
  'arbitrum':             {deflation:'none',    unlockRisk:'high'},
  'optimism':             {deflation:'none',    unlockRisk:'high'},
  'stacks':               {deflation:'fixed',   unlockRisk:'medium'},
  'immutable-x':          {deflation:'none',    unlockRisk:'high'},
  'injective-protocol':   {deflation:'full',    unlockRisk:'low'},
  'blur':                 {deflation:'none',    unlockRisk:'high'},
  'bonk':                 {deflation:'partial', unlockRisk:'low'},
  'dogwifcoin':           {deflation:'none',    unlockRisk:'low'},
  'book-of-meme':         {deflation:'none',    unlockRisk:'low'},
  'pepe':                 {deflation:'none',    unlockRisk:'low'},
  'ondo-finance':         {deflation:'none',    unlockRisk:'high'},
  'worldcoin-wld':        {deflation:'none',    unlockRisk:'high'},
  'pyth-network':         {deflation:'none',    unlockRisk:'high'},
  'jito-governance-token':{deflation:'none',    unlockRisk:'high'},
  'ethena':               {deflation:'partial', unlockRisk:'high'}
};

// ── STABLECOINS — mirrors js/config.js. Excluded from scoring entirely. ──
const STABLE_IDS = new Set([
  'tether', 'usd-coin', 'dai', 'first-digital-usd', 'true-usd',
  'ethena-usde', 'frax', 'paypal-usd', 'gemini-dollar', 'usdd'
]);

interface RawCoin {
  id: string; symbol: string; current_price: number;
  price_change_percentage_7d_in_currency: number | null;
  price_change_percentage_14d_in_currency: number | null;
  price_change_percentage_30d_in_currency: number | null;
  circulating_supply: number | null; max_supply: number | null;
}

interface ScoredCoin {
  id: string; sym: string; price: number;
  p7: number; p14: number; p30: number;
  r7: number; r14: number; r30: number;
  score: number;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!ROTATION_SYNC_SECRET || token !== ROTATION_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // ── Load cached market data (already fetched by other sync jobs — no new external calls) ──
    const { data: marketsRow, error: marketsErr } = await supabase
      .from('market_cache').select('data').eq('cache_key', 'cg_markets_all').single();
    if (marketsErr || !marketsRow) throw new Error('cg_markets_all not found in market_cache: ' + (marketsErr?.message ?? 'no row'));

    const { data: macroRow } = await supabase
      .from('market_cache').select('data').eq('cache_key', 'macro_data').single();
    const macro = macroRow?.data || {};

    const raw: RawCoin[] = marketsRow.data;

    // ── Exclude coins whose Binance USDT pair isn't actively trading —
    //    real reported harm: this pipeline was publishing rotation calls
    //    for tokens delisted/suspended on Binance, the exact exchange
    //    this whole site assumes tradability on. See sync-binance-status
    //    Edge Function + binance_delisted_symbols table for how this is
    //    populated (daily, from Binance's own exchangeInfo). Excluded
    //    from BOTH sides — a "sell X for Y" call is equally broken if
    //    either leg can't actually be traded. ──
    const { data: delistedRows } = await supabase
      .from('binance_delisted_symbols').select('base_asset');
    const delistedSet = new Set((delistedRows || []).map((r: { base_asset: string }) => r.base_asset));

    // ── Build scorable set — mirrors computeScores()'s `scorable` filter:
    //    no stablecoins, requires all three of 7d/14d/30d present (same
    //    dataComplete definition as loadCoins() in data-loaders.js) ──
    const scorable: ScoredCoin[] = raw
      .filter((c) => !STABLE_IDS.has(c.id))
      .filter((c) => !delistedSet.has(c.symbol.toUpperCase()))
      .filter((c) =>
        c.price_change_percentage_7d_in_currency  != null &&
        c.price_change_percentage_14d_in_currency != null &&
        c.price_change_percentage_30d_in_currency != null &&
        c.current_price > 0
      )
      .map((c) => ({
        id: c.id, sym: c.symbol.toUpperCase(), price: c.current_price,
        p7:  c.price_change_percentage_7d_in_currency!,
        p14: c.price_change_percentage_14d_in_currency!,
        p30: c.price_change_percentage_30d_in_currency!,
        r7: 0, r14: 0, r30: 0, score: 0
      }));

    if (scorable.length < 10) throw new Error(`only ${scorable.length} scorable coins — too few for a meaningful snapshot`);

    // ── LAYER 1: intra-list rank (0-40 pts) — exact port of computeScores() ──
    const n = Math.max(scorable.length - 1, 1);
    (['p7', 'p14', 'p30'] as const).forEach((k) => {
      const sorted = [...scorable].sort((a, b) => b[k] - a[k]);
      sorted.forEach((c, i) => {
        const rankKey = ('r' + k.slice(1)) as 'r7' | 'r14' | 'r30';
        c[rankKey] = i + 1;
      });
    });

    const btcCoin = scorable.find((c) => c.id === 'bitcoin');
    const btcP7    = macro.btcP7    ?? btcCoin?.p7 ?? 0;
    const goldP7   = macro.goldP7   ?? 2;
    const silvP7   = macro.silverP7 ?? 1.5;
    const oilP7    = macro.oilP7    ?? 1;
    const dxyP7    = macro.dxyP7    ?? 0;
    const total3P7 = macro.total3P7 ?? 0;

    // Original coin objects (with supply data) for Layer 3, keyed by id
    const rawById = new Map(raw.map((c) => [c.id, c]));

    scorable.forEach((c) => {
      const wAvg = c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45;
      const layer1 = Math.round((1 - (wAvg - 1) / n) * 40);

      // ── LAYER 2: macro relative strength (0-30 pts) ──
      const coreDelta = (c.p7 - btcP7) * 0.35 + (c.p7 - goldP7) * 0.25 + (c.p7 - silvP7) * 0.10 + (c.p7 - oilP7) * 0.10;
      const dxyDelta  = -dxyP7 * 0.10;
      const t3Delta   = (c.p7 - total3P7) * 0.10;
      const delta = coreDelta + dxyDelta + t3Delta;
      const layer2 = Math.min(30, Math.max(0, Math.round(15 + Math.min(Math.max(delta * 0.9, -15), 15))));

      // ── LAYER 3: tokenomics quality (-50 to +30 pts) ──
      const tkx = TOKENOMICS_DB[c.id] || { deflation: 'none', unlockRisk: 'medium' };
      const rawC = rawById.get(c.id);
      let supplyPts = 0;
      if (rawC?.circulating_supply && rawC?.max_supply && rawC.max_supply > 0) {
        const ratio = rawC.circulating_supply / rawC.max_supply;
        if      (ratio > 0.90) supplyPts =  10;
        else if (ratio > 0.70) supplyPts =   5;
        else if (ratio > 0.40) supplyPts =   0;
        else if (ratio > 0.20) supplyPts = -15;
        else                   supplyPts = -25;
      } else if (!rawC?.max_supply) { supplyPts = -3; }
      const deflPts   = tkx.deflation  === 'full' ? 15 : tkx.deflation  === 'partial' ? 8 : tkx.deflation === 'fixed' ? 5 : 0;
      const unlockPts = tkx.unlockRisk === 'low'  ?  0 : tkx.unlockRisk === 'medium'  ? -5 : -10;
      const layer3 = Math.min(30, Math.max(-50, supplyPts + deflPts + unlockPts));

      c.score = Math.min(100, Math.max(-50, Math.round(layer1 + layer2 + layer3)));
    });

    // ── Selection: plain top-5 / bottom-5 by score — the SAME fallback
    //    behavior the live site uses for any visitor with no holdings
    //    (see takeRotationSnapshot() in js/signal-history.js). No zone/
    //    hysteresis classifier needed here — that only changes labeling
    //    for holdings-aware visitors, not this ranking. ──
    const sells = [...scorable].sort((a, b) => b.score - a.score).slice(0, 5);
    const buys  = [...scorable].sort((a, b) => a.score - b.score).slice(0, 5);

    const today = new Date().toISOString().slice(0, 10);
    const pairs = [];
    for (let i = 0; i < Math.min(sells.length, buys.length); i++) {
      const from = sells[i], to = buys[i];
      if (from.id === to.id) continue; // shouldn't happen given disjoint sort directions, guard anyway
      pairs.push({
        snap_date:   today,
        from_id:     from.id, from_sym: from.sym, from_price: from.price, from_score: from.score,
        to_id:       to.id,   to_sym:   to.sym,   to_price:   to.price,   to_score:   to.score,
        source:      'sync-rotation-snapshot'
      });
    }

    if (!pairs.length) throw new Error('no valid rotation pairs produced');

    const { error: upsertErr } = await supabase
      .from('rotation_snapshots')
      .upsert(pairs, { onConflict: 'snap_date,from_id,to_id' });

    if (upsertErr) throw new Error('upsert failed: ' + upsertErr.message);

    return new Response(
      JSON.stringify({ synced: pairs.length, snap_date: today, scorable_count: scorable.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sync-rotation-snapshot] failed:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
