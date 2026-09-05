// ============================================================
// compute-signal-run — Supabase Edge Function
//
// Roadmap Step B (promptove/07-roadmap-2026-09-05.md). Computes ONE
// authoritative signal run and persists it to signal_runs /
// signal_run_items (see rotator-engine/sql/signal_runs.sql) so the site
// and the Telegram bot can both READ a run instead of each computing
// their own — the root cause of the measured Spearman-0.759 divergence
// between them (rotator-fixture).
//
// WHAT THIS DOES NOT YET CHANGE:
// The site still computes client-side too (runSignalEngine() in
// js/data-loaders.js) and still writes signal_zone_state itself via
// supaApplyZoneState — this function writes the SAME zone state (same
// apply_zone_state RPC, same staleness guard) so nothing regresses
// while both writers coexist. Switching the site to READ signal_runs
// instead of computing, and deleting the bot's own scoring (Step C), are
// separate follow-up changes — deliberately not bundled into standing
// up this table, same reasoning rotator-engine/README.md gives for why
// Phase 1's zone-state migration and site-rewiring were kept as two
// separate, individually-reviewable steps.
//
// SCORING: v1 (computeSignalRun's score/zone) is what's stored as
// authoritative (`scoring_model = 'v1'`) — promptove/08-backtest-
// results-2026-09-05.md found v2 not distinguishably better on a
// reconstructed backtest. v2's `strength`/`setup` are computed anyway
// (computeSignalRunV2 is a superset call, see rotator-engine/README.md)
// and stored alongside on every row — cheap, and it's exactly what that
// file's "still open" list asks for next: re-running the backtest
// against real production history once enough of it exists, without a
// second write path.
//
// NOT INCLUDED: the technical indicator layer (RSI/MACD/Bollinger %B).
// Computing that here would mean fetching Binance klines on every cron
// tick; left out for now, same as the rest of v2 not being published —
// `technicals` is simply not passed, so v2's technical component is
// absent from `v2.components` for every coin on every run (that's a
// real, visible gap in the stored `params`, not a silent one).
//
// DATA SOURCES: same already-cached tables every other sync function in
// this project reads (market_cache, market_cycle, binance_delisted_
// symbols) — no new external API calls. market_cache is a shared
// visitor-populated cache with its own TTLs (5min for cg_markets_all),
// so a run's actual freshness is bounded by whatever the last visitor's
// browser refreshed, not guaranteed by this cron tick — the same
// freshness model sync-rotation-snapshot already runs on in production.
//
// coins[] IS BUILT the same way rotator-fixture/lib/fixture.js's
// toWebsiteCoins() does — deliberately the no-Binance-merge fallback
// path (the deterministic one), not a re-typed guess at loadCoins().
//
// DEPLOY:
//   node rotator-engine/sync-to-edge-function.js   (refresh the _vendor/ copy first)
//   supabase functions deploy compute-signal-run
//   supabase secrets set SIGNAL_RUN_SYNC_SECRET=<own secret — never reuse
//     the project-wide SYNC_SECRET, same reasoning as every other *_SYNC_SECRET>
//
// SCHEDULE: see sql/compute_signal_run_cron.sql in this folder.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — generated files, see rotator-engine/sync-to-edge-function.js.
// Both MUST be static imports, not runtime Deno.readTextFile calls — the
// edge sandbox only bundles files reachable through the import graph.
import Engine from './_vendor/rotator-engine/engine.mjs';
// @ts-ignore
import siteTables from './_vendor/rotator-engine/site-tables.mjs';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNAL_RUN_SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;
const ELIGIBILITY_MIN_VOLUME = 250000;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface RawCoin {
  id: string; symbol: string; name: string; current_price: number;
  market_cap: number | null; total_volume: number | null;
  circulating_supply: number | null; max_supply: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency: number | null;
  price_change_percentage_14d_in_currency: number | null;
  price_change_percentage_30d_in_currency: number | null;
}

// Verbatim shape of rotator-fixture/lib/fixture.js's toWebsiteCoins() —
// the no-Binance-merge fallback path, which is the deterministic one a
// server job (no visitor browser) should always be on.
function toWebsiteCoins(raw: RawCoin[], stableIds: Set<string>) {
  const coins = raw.map((c) => {
    const raw7 = c.price_change_percentage_7d_in_currency;
    const raw14 = c.price_change_percentage_14d_in_currency;
    const raw30 = c.price_change_percentage_30d_in_currency;
    const dataComplete = raw7 != null && raw14 != null && raw30 != null;
    return {
      id: c.id, sym: c.symbol.toUpperCase(), name: c.name,
      price: c.current_price,
      image: '', mcap: c.market_cap || 0, rank: 0,
      p24: c.price_change_percentage_24h || 0,
      p7: raw7 || 0, p14: raw14 || 0, p30: raw30 || 0,
      dataComplete,
      volume24: c.total_volume || 0,
      circulating_supply: c.circulating_supply || 0,
      max_supply: c.max_supply || null,
      ath: 0, ath_change_pct: 0,
      score: 0, r7: 0, r14: 0, r30: 0, isPro: false,
      isStable: stableIds.has(c.id),
      apr: 0, aprPlatform: '',
    };
  });
  coins.sort((a, b) => b.mcap - a.mcap);
  coins.forEach((c, i) => { c.rank = i + 1; });
  return coins;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!SIGNAL_RUN_SYNC_SECRET || token !== SIGNAL_RUN_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const stableIds = new Set(Object.keys(siteTables.STABLECOINS));

    const [marketsRow, macroRow, cycleRows, delistedRows, zoneRows] = await Promise.all([
      supabase.from('market_cache').select('data').eq('cache_key', 'cg_markets_all').single(),
      supabase.from('market_cache').select('data').eq('cache_key', 'macro_data').single(),
      supabase.from('market_cycle').select('symbol, ma200, mayer_multiple'),
      supabase.from('binance_delisted_symbols').select('base_asset'),
      supabase.from('signal_zone_state').select('coin_id, zone'),
    ]);
    if (marketsRow.error || !marketsRow.data) throw new Error('cg_markets_all not found: ' + (marketsRow.error?.message ?? 'no row'));

    const raw: RawCoin[] = marketsRow.data.data;
    const macro = macroRow.data?.data || {};
    const marketCycle: Record<string, { ma200: number; mayer_multiple: number }> = {};
    for (const r of cycleRows.data || []) marketCycle[r.symbol] = { ma200: Number(r.ma200), mayer_multiple: r.mayer_multiple != null ? Number(r.mayer_multiple) : null as any };
    const delisted = (delistedRows.data || []).map((r: { base_asset: string }) => r.base_asset);
    const previousZones: Record<string, string> = {};
    for (const r of zoneRows.data || []) previousZones[r.coin_id] = r.zone;

    const coins = toWebsiteCoins(raw, stableIds);
    const asOf = new Date().toISOString();

    const run = Engine.computeSignalRunV2({
      asOf,
      coins,
      tokenomics: siteTables.TOKENOMICS_DB,
      macro,
      marketCycle,
      volumeHistory: {},
      previousZones,
      eligibility: { minVolume24h: ELIGIBILITY_MIN_VOLUME, delisted },
      // technicals intentionally omitted — see header comment.
    });

    // ── Persist the run + its items ──────────────────────────────────
    const { data: runRow, error: runErr } = await supabase
      .from('signal_runs')
      .insert({
        as_of: asOf,
        engine_version: run.engineVersion,
        scoring_model: 'v1',
        cycle_label: run.cycleLabel,
        eligibility: run.eligibility,
        universe_size: run.universeSize,
        eligible_count: run.eligibleCount,
        params: { macro, v2Weights: run.v2?.weights, technicalApplied: run.v2?.technicalApplied ?? false },
      })
      .select('id')
      .single();
    if (runErr || !runRow) throw new Error('signal_runs insert failed: ' + runErr?.message);

    const items = run.items
      .filter((it: any) => !it.isStable)
      .map((it: any) => ({
        run_id: runRow.id,
        coin_id: it.id,
        coin_sym: it.sym,
        price: coins.find((c) => c.id === it.id)?.price ?? null,
        mcap: it.mcap,
        p7: it.p7, p14: it.p14, p30: it.p30,
        r7: it.r7, r14: it.r14, r30: it.r30,
        score: it.score,
        effective_score: it.effectiveScore,
        zone: it.zone,
        eligible: it.eligible,
        data_complete: it.dataComplete !== false,
        strength: it.strength ?? null,
        setup: it.setup ?? null,
        breakdown: it.breakdown ?? null,
      }));

    const { error: itemsErr } = await supabase.from('signal_run_items').insert(items);
    if (itemsErr) throw new Error('signal_run_items insert failed: ' + itemsErr.message);

    // ── Keep signal_zone_state fed exactly as the client already does,
    //    so nothing regresses while the site's own client-side compute
    //    is still live (see header comment). ──
    const zonePayload: Record<string, unknown> = {};
    run.items.forEach((it: any) => {
      if (run.zones[it.id]) zonePayload[it.id] = { zone: run.zones[it.id], sym: it.sym, score: it.score, effective_score: it.effectiveScore };
    });
    const { error: zoneErr } = await supabase.rpc('apply_zone_state', {
      p_zones: zonePayload,
      p_engine_version: run.engineVersion,
      p_as_of: asOf,
    });
    if (zoneErr) console.error('[compute-signal-run] apply_zone_state failed (non-fatal):', zoneErr.message);

    return new Response(
      JSON.stringify({
        run_id: runRow.id, as_of: asOf, engine_version: run.engineVersion,
        cycle_label: run.cycleLabel, universe_size: run.universeSize,
        eligible_count: run.eligibleCount, items: items.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[compute-signal-run] failed:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
