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

    return new Response(
      JSON.stringify({ checked: usdtPairs.length, flagged: notTrading.length, flagged_symbols: notTrading.map((s) => s.base_asset) }),
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
