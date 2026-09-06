// ============================================================
// sync-binance-status — Supabase Edge Function
//
// Flags coins whose Binance USDT pair is no longer actively trading
// (delisted, suspended, or in a pre/post-trading transition) so the
// site stops suggesting them as buy targets or rotation destinations.
//
// WHY THIS EXISTS:
// Reported directly: the rotation/buy suggestions were recommending a
// token that was being delisted on Binance — actively harmful advice
// from a tool built specifically around Binance-executable rotation
// (the swap calculator, ratio tool, and bStocks feature all assume
// Binance tradability). Nothing in the scoring pipeline ever checked
// real exchange listing status; FREE_COINS (config.js) is a static
// list that has no awareness of what Binance is currently doing.
//
// WHAT THIS DOES NOT CATCH:
// Binance announces upcoming delistings in advance via blog posts, not
// a structured API. A coin can be status='TRADING' today and scheduled
// for removal next week — this function has no way to see that
// announcement. It only catches symbols that have ALREADY moved out of
// TRADING status (BREAK, HALT, END_OF_DAY, etc.) — real protection
// against an already-broken pair, not a crystal ball for future
// announcements. Said plainly here rather than oversold as complete.
//
// ── SECOND JOB, added 2026-09-06: Binance's tag vocabulary ───
// Reported directly: rotation suggestions were surfacing SYN and GLMR.
// Both carry Binance's Monitoring Tag — the exchange's own marker for a
// token with materially higher volatility/risk that it reviews
// periodically for possible delisting. Both are still status='TRADING'.
//
// Measured the same day: 32 USDT pairs carry the tag and ALL 32 are
// TRADING, so the delisted check above caught exactly zero of them.
// That is the point — the Monitoring Tag is the state BETWEEN "fine"
// and "already broken", and it was invisible to this pipeline.
//
// SOURCE, and its caveat: the tag is NOT in /api/v3/exchangeInfo. It
// comes from the same endpoint the Binance website itself uses,
// bapi/asset/v2/public/asset-service/product/get-products, which is
// undocumented and unversioned. It can change shape or start refusing
// datacentre IPs without notice. So it is fetched SEPARATELY and its
// failure is caught SEPARATELY: if it breaks, the delisted sync above
// still completes and the response says monitoring_ok:false. It must
// never take the primary job down with it.
//
// It ingests the WHOLE tag vocabulary into binance_symbol_tags, not just
// Monitoring: the site hand-maintains 194 category assignments in
// config.js that duplicate tags Binance already publishes here. Seed and
// the rest are labels, not exclusions -- only Monitoring gates anything,
// via the binance_monitoring_symbols view.
//
// DATA SOURCE:
// GET /api/v3/exchangeInfo — single public call, weight 20, no auth.
// Filtered to <SYM>USDT pairs, since that's the quote pair convention
// already used everywhere else in this codebase (ratio.js, signal-
// history.js's _fetchKlines, sync-bstocks) — sym + 'USDT'.
//
// DEPLOY:
//   supabase functions deploy sync-binance-status
//   supabase secrets set BINANCE_STATUS_SYNC_SECRET=<own secret>
//
// SCHEDULE: once daily. See sql/sync_binance_status_cron.sql.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY          = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BINANCE_STATUS_SYNC_SECRET= Deno.env.get('BINANCE_STATUS_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface BinanceSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

// The website's own product feed. Undocumented — see the header note.
const PRODUCTS_URL =
  'https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-products';

// Exact tag string as Binance returns it, capital M. Verified against the
// live feed on 2026-09-06: 32 USDT pairs matched, including SYN and GLMR.
const MONITORING_TAG = 'Monitoring';

// Shape of one row from get-products. Terse single-letter keys are
// Binance's, not ours: s=symbol, b=base, q=quote, st=status.
interface BinanceProduct {
  s: string;
  b: string;
  q: string;
  st: string;
  tags?: string[];
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!BINANCE_STATUS_SYNC_SECRET || token !== BINANCE_STATUS_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    if (!res.ok) throw new Error(`exchangeInfo -> HTTP ${res.status}`);
    const json = await res.json();
    const symbols: BinanceSymbol[] = json.symbols || [];

    // Only USDT pairs — the quote asset convention used everywhere else
    // in this codebase. A coin with e.g. a BUSD or BTC pair still active
    // but its USDT pair broken is exactly the "can't execute the
    // suggested trade" case we're protecting against.
    const usdtPairs = symbols.filter((s) => s.quoteAsset === 'USDT');

    // Store ONLY the non-trading ones — smaller table, clearer semantics
    // ("appears here" = "known problem"), and fails safe: if this sync
    // itself breaks, the table just goes stale rather than the site
    // wrongly excluding every coin because the "known-good" list didn't
    // load.
    const notTrading = usdtPairs
      .filter((s) => s.status !== 'TRADING')
      .map((s) => ({
        base_asset: s.baseAsset,
        binance_symbol: s.symbol,
        status: s.status,
        checked_at: new Date().toISOString()
      }));

    // Replace the table wholesale each run — a symbol that returns to
    // TRADING status (relisted, or was a temporary HALT) should stop
    // being flagged, not linger forever from a stale row.
    const { error: delErr } = await supabase.from('binance_delisted_symbols').delete().neq('base_asset', '');
    if (delErr) throw new Error('clear failed: ' + delErr.message);

    if (notTrading.length) {
      const { error: insErr } = await supabase.from('binance_delisted_symbols').insert(notTrading);
      if (insErr) throw new Error('insert failed: ' + insErr.message);
    }

    // ── Binance tags, isolated from everything above ───────────
    // Its own try/catch on purpose: an undocumented endpoint must not be
    // able to fail the delisted sync that has already succeeded.
    type TaggedRow = { base_asset: string; binance_symbol: string; tags: string[] };
    let tagged: TaggedRow[] = [];
    let monitoring: TaggedRow[] = [];
    let monitoringOk = true;
    let monitoringErr: string | null = null;
    try {
      const pRes = await fetch(PRODUCTS_URL, {
        headers: { 'Accept': 'application/json' },
      });
      if (!pRes.ok) throw new Error(`get-products -> HTTP ${pRes.status}`);
      const pJson = await pRes.json();
      const products: BinanceProduct[] = pJson?.data ?? [];
      if (!Array.isArray(products) || !products.length) {
        throw new Error('get-products returned no data (shape may have changed)');
      }

      // Every tagged USDT pair, not just the Monitoring ones. Binance
      // publishes its whole category vocabulary on this one feed, and the
      // site has been hand-maintaining 194 of these assignments in
      // config.js where they can drift. One ingest, three consumers:
      // category tabs, the Monitoring exclusion, and informational labels
      // like Seed (higher volatility -- which cuts both ways, so it is
      // labelled, never excluded).
      tagged = products
        .filter((p) => p.q === 'USDT' && Array.isArray(p.tags) && p.tags.length > 0)
        .map((p) => ({
          base_asset: p.b,
          binance_symbol: p.s,
          tags: p.tags,
        }));

      monitoring = tagged.filter((t) => t.tags.includes(MONITORING_TAG));

      // A zero-length result is far more likely to mean "they renamed the
      // tag" than "Binance cleared all 32 overnight". Treating it as a
      // real result would silently un-exclude everything, which is the
      // exact failure this whole change exists to prevent.
      if (!monitoring.length) throw new Error('no Monitoring-tagged USDT pairs found — tag name likely changed');

      const { error: tDelErr } = await supabase
        .from('binance_symbol_tags').delete().neq('base_asset', '');
      if (tDelErr) throw new Error('tags clear failed: ' + tDelErr.message);

      // Chunked: ~490 tagged pairs is past the point where a single
      // PostgREST insert is comfortable.
      for (let i = 0; i < tagged.length; i += 200) {
        const { error: tInsErr } = await supabase
          .from('binance_symbol_tags').insert(tagged.slice(i, i + 200));
        if (tInsErr) throw new Error('tags insert failed: ' + tInsErr.message);
      }
    } catch (e) {
      // Leave the previous rows in place. Stale exclusions are safe;
      // an empty table would silently start recommending flagged coins.
      monitoringOk = false;
      monitoringErr = e instanceof Error ? e.message : String(e);
      console.error('[sync-binance-status] monitoring tag sync failed:', monitoringErr);
    }

    return new Response(
      JSON.stringify({
        checked: usdtPairs.length,
        flagged: notTrading.length,
        flagged_symbols: notTrading.map((s) => s.base_asset),
        monitoring_ok: monitoringOk,
        tagged_symbols: monitoringOk ? tagged.length : null,
        monitoring_flagged: monitoringOk ? monitoring.length : null,
        monitoring_symbols: monitoringOk ? monitoring.map((m) => m.base_asset) : null,
        ...(monitoringErr ? { monitoring_error: monitoringErr } : {}),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sync-binance-status] failed:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
