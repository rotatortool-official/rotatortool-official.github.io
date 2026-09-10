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
// TECHNICALS: RSI is now passed in. It is NOT computed here — that would
// mean fetching Binance klines on every cron tick. It is READ from
// coin_technicals, which sync-binance-daily-klines already writes from
// the klines it holds anyway, so this costs one more cheap table read
// and no external call. That table has carried real Wilder RSI(14) for
// weeks; it was reaching the website as a display lens and stopping
// there, so nothing that made a recommendation had ever seen it.
//
// It feeds two things: v2's technical component (still measured, still
// not published) and — the reason it is wired now — engine 2.2.0's
// candidate classification, where RSI is the oversold CONFIRMATION step.
// Below 80% coverage the engine drops the confirmation for every coin
// and says so in `candidates.rsiApplied`, rather than judging the coins
// that happen to have RSI on a stronger rule than the rest.
//
// MACD and Bollinger %B are still not supplied; the engine treats each
// technical field independently, so their absence costs nothing here.
//
// bStocks ARE included since 2026-09-06, stamped asset_type='bstock'.
// They are ranked in their own peer group by the engine (computeScores()
// filters !c.isStock for crypto and ranks stocks separately), so their
// presence cannot move a crypto score — and they come out eligible=false
// with reason 'equity', so consumers that respect `eligible` keep them
// out of crypto rotation without any change.
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
// The site (js/data-loaders.js's runSignalEngine()) reads this table
// directly now — score/zone/breakdown are server-authoritative for every
// visitor, bStocks included since 2026-09-06. The local engine pass is
// now only a same-session fallback for when this table has no row yet or
// the fetch fails.
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
  // Engine 2.6.0 reads this when max_supply is absent - it covers 166 of
  // 166 coins where max covers 111. It was already in the cached payload
  // and dropped here. See _supplyBasis() in the engine.
  total_supply: number | null;
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
      total_supply: c.total_supply || null,
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

    const [marketsRow, macroRow, cycleRows, delistedRows, zoneRows, techRows, fgRow, futRows] = await Promise.all([
      supabase.from('market_cache').select('data').eq('cache_key', 'cg_markets_all').single(),
      supabase.from('market_cache').select('data').eq('cache_key', 'macro_data').single(),
      supabase.from('market_cycle').select('symbol, ma200, mayer_multiple'),
      supabase.from('binance_delisted_symbols').select('base_asset'),
      supabase.from('signal_zone_state').select('coin_id, zone'),
      supabase.from('coin_technicals').select('base_asset, rsi14_daily'),
      // Pillar 6 of the insight score (engine 2.3.0). Same market_cache
      // row the website reads, so the server run and a cold-start local
      // pass see the same sentiment reading.
      supabase.from('market_cache').select('data, updated_at').eq('cache_key', 'fear_greed').maybeSingle(),
      // Derivatives. Engine 2.7.0 LABELS this and scores nothing from
      // it - see _positioning(). It is read here so the reading is
      // stored beside the call it sat next to, which is the only way
      // it becomes gradeable once there is enough history to measure.
      supabase.from('binance_futures_metrics')
        .select('base_asset, funding_rate, open_interest_value, oi_change_24h_pct, long_short_ratio, taker_buy_sell_ratio'),
    ]);
    if (marketsRow.error || !marketsRow.data) throw new Error('cg_markets_all not found: ' + (marketsRow.error?.message ?? 'no row'));

    const raw: RawCoin[] = marketsRow.data.data;
    const macro = macroRow.data?.data || {};
    const marketCycle: Record<string, { ma200: number; mayer_multiple: number }> = {};
    for (const r of cycleRows.data || []) marketCycle[r.symbol] = { ma200: Number(r.ma200), mayer_multiple: r.mayer_multiple != null ? Number(r.mayer_multiple) : null as any };
    const delisted = (delistedRows.data || []).map((r: { base_asset: string }) => r.base_asset);
    const previousZones: Record<string, string> = {};
    for (const r of zoneRows.data || []) previousZones[r.coin_id] = r.zone;

    // Keyed by base_asset, which is the same uppercase symbol the engine
    // carries as `c.sym` — the engine looks up by id first, then sym.
    // A null rsi14_daily is left OUT rather than passed as null, so it
    // counts against coverage instead of reading as a real reading.
    const technicals: Record<string, { rsi: number }> = {};
    for (const r of (techRows.data || [])) {
      if (r.rsi14_daily != null) technicals[r.base_asset] = { rsi: Number(r.rsi14_daily) };
    }
    // Keyed by base_asset like technicals; the engine looks up by id then
    // symbol. A coin with no perp simply has no entry, and the engine
    // reports positioning null for it - which is "no futures market", not
    // "balanced positioning".
    const futures: Record<string, unknown> = {};
    for (const r of (futRows.data || [])) {
      if (r && r.base_asset) futures[r.base_asset] = r;
    }
    if (futRows.error) {
      console.warn('[compute-signal-run] binance_futures_metrics read failed:', futRows.error.message);
    }

    if (techRows.error) {
      // A missing technicals feed must not stop the run. The engine will
      // see 0% coverage, skip confirmation for everyone, and record that.
      console.warn('[compute-signal-run] coin_technicals read failed:', techRows.error.message);
    }

    // A missing or unparseable row is passed as null, NOT as 50. The
    // engine skips pillar 6 on null and scores it on 50, and those are
    // different statements — one says sentiment was not consulted, the
    // other says it was and read neutral. dataQuality.fearGreedSupplied
    // records which happened.
    //
    // AND A STALE ROW IS TREATED AS A MISSING ONE, added 2026-09-10.
    //
    // Until today nothing wrote this row. It was set by hand on
    // 2026-09-03 and read as live by every run for a week, because a
    // cache row with no owner is indistinguishable from a healthy one at
    // the point of reading. sync-market-data now owns it — but the fix
    // that matters is here, because the next feed to die silently will
    // not announce itself either.
    //
    // The age is measured on updated_at, which is when WE last wrote,
    // not on the index's own asOf. A sentiment reading is one number for
    // the whole market: unlike RSI coverage, no per-coin gate would
    // notice it going stale, so the run-level age check is the only
    // thing standing between a frozen constant and 190 scores.
    //
    // 48h is deliberately loose. The index publishes daily and the sync
    // runs far more often, so anything approaching two days means the
    // sync is broken rather than the market being quiet.
    const FEAR_GREED_MAX_AGE_H = 48;
    let fearGreed: number | null = null;
    let fearGreedAge: number | null = null;
    let fearGreedStale = false;
    const fgVal = (fgRow?.data as { data?: { value?: unknown } } | null)?.data?.value;
    const fgAt = (fgRow?.data as { updated_at?: string } | null)?.updated_at;
    if (fgAt) {
      const ms = Date.now() - new Date(fgAt).getTime();
      if (Number.isFinite(ms)) fearGreedAge = Math.round(ms / 36e5);
    }
    if (fgVal != null && Number.isFinite(Number(fgVal))) {
      if (fearGreedAge != null && fearGreedAge > FEAR_GREED_MAX_AGE_H) {
        // Passed as null, so the engine records "not consulted" rather
        // than scoring a week-old number as today's sentiment.
        fearGreedStale = true;
        console.warn(
          `[compute-signal-run] fear_greed is ${fearGreedAge}h old (max ${FEAR_GREED_MAX_AGE_H}h) — pillar 6 skipped`,
        );
      } else {
        fearGreed = Number(fgVal);
      }
    }
    if (fgRow?.error) console.warn('[compute-signal-run] fear_greed read failed:', fgRow.error.message);

    const coins = toWebsiteCoins(raw, stableIds);

    // ── bStocks, added 2026-09-06 ────────────────────────────────────
    // Tokenized equities, previously scored ONLY in the visitor's browser
    // — the last thing on the page the server did not own. Now they ride
    // the same run.
    //
    // THIS DOES NOT MOVE ANY CRYPTO SCORE. The engine partitions them
    // already: computeScores() filters `!c.isStock` for the crypto peer
    // group and ranks bStocks separately against each other (`sn`), so
    // adding them to coins[] cannot change a crypto rank. Verified by
    // diffing scores before and after.
    //
    // They also come out eligible=false with reason 'equity' from
    // _eligibility(), which is deliberate — a 0-70 partial score is not
    // comparable to a crypto 0-100 — so every consumer that respects
    // `eligible` keeps them out of crypto rotation with no change.
    //
    // Source is the binance-sourced row: the yahoo row for the same
    // symbol carries sector/52-week fields but no p7/p14/p30, so picking
    // the wrong one would silently produce a coin with zero momentum.
    let bstocks: ReturnType<typeof toWebsiteCoins> = [];
    try {
      const { data: bsRows } = await supabase
        .from('unified_market_data')
        .select('symbol,name,price,change_24h,metadata')
        .eq('asset_type', 'stock')
        .eq('source_name', 'binance');

      bstocks = (bsRows ?? []).map((r: any) => {
        const meta = r.metadata ?? {};
        const n = (v: unknown) => (v == null ? null : Number(v));
        const p7 = n(meta.p7), p14 = n(meta.p14), p30 = n(meta.p30);
        return {
          // Same id shape the site builds in loadBstocks(), so the
          // server row lands on the right coin when the page merges.
          id: 'bstock_' + r.symbol,
          sym: r.symbol,
          name: r.name || r.symbol,
          price: r.price != null ? Number(r.price) : 0,
          image: '', mcap: n(meta.mcap) ?? 0, rank: 0,
          p24: n(r.change_24h) ?? 0,
          p7: p7 ?? 0, p14: p14 ?? 0, p30: p30 ?? 0,
          // Momentum is the whole score for an equity here; without the
          // full set the row would rank mid-pack on defaults rather than
          // be excluded, which is the bug dataComplete exists to prevent.
          dataComplete: p7 != null && p14 != null && p30 != null,
          volume24: n(meta.volume24) ?? 0,
          circulating_supply: 0, max_supply: null, total_supply: null,
          ath: 0, ath_change_pct: 0,
          score: 0, r7: 0, r14: 0, r30: 0, isPro: false,
          isStable: false, isStock: true,
          apr: 0, aprPlatform: '',
        };
      }) as any;
    } catch (e) {
      // A missing bStock feed must not stop the crypto run.
      console.warn('[compute-signal-run] bStock load failed:', (e as Error).message);
    }

    const universe = [...coins, ...bstocks];
    const asOf = new Date().toISOString();

    // How far back run.changes compares. See the note below.
    const CHANGE_WINDOW_HOURS = 24;

    // ── The comparison run, for engine 2.4.0's run.changes ───────────
    // NOT the immediately previous run. Measured against production on
    // 2026-09-09, across 191 coins:
    //
    //   adjacent runs (15 min)   largest score move in the universe: 0
    //   1 hour apart             largest: 1 point,  0 rank moves >= 5
    //   4 hours apart            largest: 1 point,  0 rank moves >= 5
    //   9 hours apart            16 coins moved >= 3, 4 zone changes
    //
    // Market data does not refresh every 15 minutes, so consecutive runs
    // are near-identical by construction. Diffing against the previous
    // run would have produced an empty `changes` block on essentially
    // every run — a homepage telling visitors "nothing changed" 96 times
    // a day, which is a claim the data never made.
    //
    // 24 hours is the window a DAILY brief means, and it is what
    // CHANGE_RULES' thresholds are calibrated against (p90 of the 24h
    // move distribution). If history is shorter than that, the oldest
    // run available is used and vsAsOf says how far back it reached, so
    // a consumer can always tell what "changed" is measured over.
    //
    // Fails OPEN. Any problem here leaves `previous` null, the engine
    // returns changes: null, and the run is written exactly as a 2.3.0
    // run would be. A movement report is worth having; it is not worth
    // failing a scoring run over.
    //
    // Note the shape: signal_run_items holds no stablecoin rows (they
    // are filtered at insert, below), and the engine skips isStable
    // items for the same reason — otherwise every stablecoin would read
    // as newly "entered" on every run.
    let previous: any[] | null = null;
    let previousRunId: number | null = null;
    let previousAsOf: string | null = null;
    try {
      const since = new Date(Date.now() - CHANGE_WINDOW_HOURS * 3600 * 1000).toISOString();
      let { data: prevRun } = await supabase
        .from('signal_runs')
        .select('id, as_of')
        .lte('as_of', since)
        .order('as_of', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!prevRun) {
        // Less history than the window: fall back to the OLDEST run
        // rather than the newest, so the comparison spans as much time
        // as exists instead of collapsing to "no change".
        const { data: oldest } = await supabase
          .from('signal_runs')
          .select('id, as_of')
          .order('as_of', { ascending: true })
          .limit(1)
          .maybeSingle();
        prevRun = oldest ?? null;
      }
      if (prevRun) {
        previousRunId = prevRun.id;
        previousAsOf = prevRun.as_of;
        const { data: prevItems } = await supabase
          .from('signal_run_items')
          .select('coin_id, coin_sym, r30, score, zone, candidate_class')
          .eq('run_id', prevRun.id);
        if (prevItems && prevItems.length) {
          // PostgREST returns `numeric` as a string on some paths; the
          // engine coerces, but map the names here rather than teaching
          // it about column names.
          previous = prevItems.map((r: any) => ({
            id: r.coin_id,
            sym: r.coin_sym,
            r30: r.r30,
            score: r.score,
            zone: r.zone,
            candidateClass: r.candidate_class,
          }));
        }
      }
    } catch (e) {
      console.warn('[compute-signal-run] previous-run read failed, changes will be null:', (e as Error).message);
    }

    const run = Engine.computeSignalRunV2({
      asOf,
      coins: universe,
      tokenomics: siteTables.TOKENOMICS_DB,
      macro,
      marketCycle,
      volumeHistory: {},
      previousZones,
      eligibility: { minVolume24h: ELIGIBILITY_MIN_VOLUME, delisted },
      technicals,
      fearGreed,
      futures,
      previous,
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
        // What moved since the previous run. The engine reports the
        // movement; the run IDs are provenance only this function has.
        // NULL means "no comparison available", which is not the same
        // statement as "nothing changed" — see sql/signal_runs_changes.sql.
        changes: run.changes
          ? { ...run.changes, vsRunId: previousRunId, vsAsOf: previousAsOf }
          : null,
        params: {
          macro,
          v2Weights: run.v2?.weights,
          technicalApplied: run.v2?.technicalApplied ?? false,
          // The rules that produced this run's labels, stored with the
          // run so a call can still explain itself after the thresholds
          // are next tuned.
          candidates: run.candidates,
          // The zone lines and the hysteresis margin that produced this
          // run's buy/sell labels. Until 2.5.0 NEITHER was stored, so a
          // stored item sitting at 42 in the buy zone could not be read
          // back: 42 is above the buy line, and only the margin says
          // whether that was hysteresis holding a prior call or a bug.
          // `thresholds` moves with the cycle and `hysteresis` is the
          // one the engine just changed, so both belong with the run for
          // the same reason `candidates` does.
          zoneRules: { thresholds: run.thresholds, hysteresis: run.hysteresis },
          // The positioning rules, coverage and the explicit
          // weighted:false. Stored so a call made today can later be
          // graded against the positioning that existed when it was
          // made, and so nobody has to take a comment's word for the
          // fact that this data moved no score.
          positioning: run.positioning,
          // Why pillar 6 did or did not run, in the run itself. A null
          // fearGreed in `insights` says "not consulted"; this says
          // whether that was because the row was absent or because it
          // was too old to trust, and how old.
          fearGreedSource: {
            ageHours: fearGreedAge,
            stale: fearGreedStale,
            maxAgeHours: FEAR_GREED_MAX_AGE_H,
          },
          // Same reasoning as candidates above: the thresholds and the
          // point budget that produced this run's insight scores, stored
          // with the run so an effective_score can still be explained
          // after they are next tuned.
          insights: run.insights,
        },
      })
      .select('id')
      .single();
    if (runErr || !runRow) throw new Error('signal_runs insert failed: ' + runErr?.message);

    // Index the universe once. Two reasons, both real:
    //
    // 1. asset_type CANNOT come from the item. _projectItem() in the
    //    engine carries `isStable` but NOT `isStock`, so `it.isStock` is
    //    undefined for every row — stamping from it would have labelled
    //    every bStock 'crypto'. Caught by running the engine locally
    //    before deploying. Fixed here rather than by adding a field to
    //    _projectItem, which would move the golden fixture for what is a
    //    labelling concern, not a scoring one.
    // 2. The old `.find()` per item was a linear scan inside a map over
    //    ~190 items.
    const bySrcId = new Map(universe.map((c: any) => [c.id, c]));

    const items = run.items
      .filter((it: any) => !it.isStable)
      .map((it: any) => ({
        run_id: runRow.id,
        coin_id: it.id,
        coin_sym: it.sym,
        price: bySrcId.get(it.id)?.price ?? null,
        mcap: it.mcap,
        p7: it.p7, p14: it.p14, p30: it.p30,
        r7: it.r7, r14: it.r14, r30: it.r30,
        score: it.score,
        effective_score: it.effectiveScore,
        zone: it.zone,
        eligible: it.eligible,
        // WHY it was refused, not just that it was. _eligibility() has
        // always returned these and only the boolean was kept; engine
        // 2.4.1 stores them because a delisted large cap and an illiquid
        // micro cap share `eligible: false` and mean opposite things.
        // See sql/signal_run_items_exclusions.sql.
        exclusions: it.exclusions ?? null,
        data_complete: it.dataComplete !== false,
        strength: it.strength ?? null,
        setup: it.setup ?? null,
        breakdown: it.breakdown ?? null,
        candidate_class: it.candidateClass ?? null,
        rsi: it.rsi ?? null,
        rsi_state: it.rsiState ?? null,
        candidate: it.candidate ?? null,
        // The 7-pillar forward-looking read (engine 2.3.0). Stored
        // because the website's zone already depends on it — it is what
        // _classifyZones() dampens on — so a stored run that omitted it
        // could not explain its own effective_score.
        insight: it.insight ?? null,
        // Derivatives positioning (engine 2.7.0). Stored, labelled, and
        // worth zero points - see sql/signal_run_items_positioning.sql
        // for the measurement that decided that. NULL means no perp
        // market, which is not the same as balanced positioning.
        positioning: it.positioning ?? null,
        asset_type: (bySrcId.get(it.id) as any)?.isStock ? 'bstock' : 'crypto',
      }));

    const { error: itemsErr } = await supabase.from('signal_run_items').insert(items);
    if (itemsErr) throw new Error('signal_run_items insert failed: ' + itemsErr.message);

    // ── Keep signal_zone_state fed — the site no longer writes it
    //    itself (Step B site rewiring), so this cron is now the SOLE
    //    writer, on the same RPC with the same staleness guard. ──
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
        bstocks: items.filter((i) => i.asset_type === 'bstock').length,
        changed_vs_run: previousRunId,
        changed_vs_as_of: previousAsOf,
        rank_moves: run.changes
          ? (run.changes.rank.improvedCount + run.changes.rank.declinedCount) : null,
        zone_moves: run.changes ? run.changes.zoneTransitionCount : null,
        rsi_coverage: run.candidates?.rsiCoverage ?? 0,
        rsi_applied: run.candidates?.rsiApplied ?? false,
        candidate_classes: run.candidates?.counts ?? {},
        fear_greed: run.insights?.fearGreed ?? null,
        insight_labels: run.insights?.counts ?? {},
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
