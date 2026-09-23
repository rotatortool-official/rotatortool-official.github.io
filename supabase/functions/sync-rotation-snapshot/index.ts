// ============================================================
// sync-rotation-snapshot — Supabase Edge Function
//
// Records today's "Rotation Opportunities" (strong asset -> weak asset
// pairs) into `rotation_snapshots`, for the track-record page's
// then-vs-now grading.
//
// RETIRED 2026-09-05 (roadmap backlog #4): this used to be a THIRD,
// hand-rolled copy of the scoring formula — a manual TypeScript port of
// computeScores()'s Layer 1/2/3 math, kept in sync with engine.js and
// config.js entirely by hand. It had already drifted (that's exactly
// the failure mode Steps B/C exist to kill for the site and the bot) and
// there was no test catching it. Since Step B, a canonical, already-
// computed run exists in `signal_runs`/`signal_run_items` every 15
// minutes — so this function no longer scores anything itself. It reads
// the latest run's per-coin score/eligibility (already filtered for
// stablecoins, delisted symbols, and data completeness by
// compute-signal-run) and just picks top-5-by-score / bottom-5-by-score,
// same as before. Divergence from the site/bot goes to zero by
// construction, same as Step C.
//
// FIDELITY NOTE (carried over): this is plain score ranking, not the
// zone-hysteresis/deadband classifier or BTC Mayer Multiple modifier —
// those only affect labeling for a visitor with holdings, which a
// server-side snapshot has no concept of. The site's own code already
// falls back to plain top-5/bottom-5-by-score in that exact situation
// (see the fallback branch in takeRotationSnapshot(), js/signal-history.js)
// — so this IS the faithful behavior, not a shortcut around it.
//
// DEPLOY:
//   supabase functions deploy sync-rotation-snapshot
//   (ROTATION_SYNC_SECRET already set from the original deploy — unchanged)
//
// SCHEDULE: once daily. See sql/sync_rotation_snapshot_cron.sql (unchanged —
// this function's request/response shape didn't change, only its internals).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ROTATION_SYNC_SECRET  = Deno.env.get('ROTATION_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface RunItem {
  coin_id: string;
  coin_sym: string | null;
  price: number | null;
  score: number | null;
  eligible: boolean | null;
  data_complete: boolean | null;
  asset_type: string | null;
  p30: number | null;   // percent, e.g. -7.03
  mcap: number | null;  // USD; ranks the top-20 shadow
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
    // ── Latest COMPLETE canonical run — same source the site and the bot read. ──
    // Not simply the newest row. compute-signal-run runs every 15 minutes
    // and this cron fires at 19:00, the same instant: on 2026-09-20 and
    // 2026-09-22 it read run #1654's header ~0.2s after it was inserted,
    // before its 285 items were, found 0 scorable coins and wrote nothing.
    // pg_cron logged both days as "succeeded". So walk back from the
    // newest run to the first one that is actually populated.
    // Since 2026-09-23 the cron fires at 19:07 instead, off the quarter
    // hour (sql/measurement_hardening_2026-09-23.sql). The walk-back stays:
    // it costs nothing and covers a slow or failed 19:00 run.
    const { data: runs, error: runErr } = await supabase
      .from('signal_runs')
      .select('id,as_of,engine_version')
      .order('as_of', { ascending: false })
      .limit(3);
    if (runErr || !runs?.length) throw new Error('no signal_runs row found: ' + (runErr?.message ?? 'empty'));

    let run: { id: number; as_of: string; engine_version: string } | null = null;
    let scorable: RunItem[] = [];
    const skippedRuns: number[] = [];
    for (const candidate of runs) {
      const { data: items, error: itemsErr } = await supabase
        .from('signal_run_items')
        .select('coin_id,coin_sym,price,score,eligible,data_complete,asset_type,p30,mcap')
        .eq('run_id', candidate.id);
      if (itemsErr || !items) throw new Error('signal_run_items fetch failed: ' + (itemsErr?.message ?? 'empty'));

      // Stablecoins/delisted are already excluded upstream by compute-signal-run
      // (its own eligibility gate) — no re-filtering needed here beyond that.
      const ok = (items as RunItem[]).filter((it) =>
        it.eligible !== false &&
        it.data_complete !== false &&
        it.score != null &&
        it.price != null && it.price > 0
      );
      if (ok.length >= 10) { run = candidate; scorable = ok; break; }
      skippedRuns.push(candidate.id);
    }

    if (!run) {
      throw new Error(`none of the last ${runs.length} runs (#${skippedRuns.join(', #')}) had 10+ scorable coins — too few for a meaningful snapshot`);
    }

    // ── Binance Monitoring Tag, buy side only (added 2026-09-06) ──
    // NOT covered by the eligibility gate above. compute-signal-run's
    // `eligible` flag is liquidity + market-cap sanity + delisting; the
    // Monitoring Tag is a still-TRADING coin the exchange has flagged as
    // materially riskier and is reviewing for delisting, so nothing
    // upstream sees it.
    //
    // This function is where it mattered most: `buys` is the FIVE LOWEST
    // SCORES in the run, and Monitoring-tagged coins cluster at exactly
    // that end — GLMR (2), GNS (5) and SYN (8) on 2026-09-06. They were
    // being written into rotation_snapshots and graded as published calls
    // on the track record.
    //
    // Sell side is deliberately untouched: `sells` is the strongest
    // coins, and if a flagged coin is up there it is a holding worth
    // reporting on, not a recommendation to acquire anything.
    //
    // Fails OPEN, like every other consumer of this table: on a read
    // error the set is empty and nothing is excluded, rather than the
    // snapshot silently narrowing to a handful of coins.
    let monitored = new Set<string>();
    try {
      const { data: monRows, error: monErr } = await supabase
        .from('binance_monitoring_symbols').select('base_asset');
      if (monErr) throw new Error(monErr.message);
      monitored = new Set((monRows ?? []).map((r: { base_asset: string }) => r.base_asset));
    } catch (e) {
      console.warn('[sync-rotation-snapshot] monitoring-tag read failed, no exclusions applied:',
        e instanceof Error ? e.message : String(e));
    }

    const isMonitored = (it: RunItem) =>
      monitored.has((it.coin_sym || '').toUpperCase());

    const sells = [...scorable].sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 5);
    const buys  = [...scorable].filter((it) => !isMonitored(it))
                               .sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 5);

    const today = new Date().toISOString().slice(0, 10);
    const pairs = [];
    // ── SHADOW: the same pairs, reversed ────────────────────────────
    // Written 2026-09-18. Backtested over 771 days and 3,855 pairs, the
    // published rule (sell top-5 by score, buy bottom-5) returns a mean
    // spread of -1.1% and is positive on 46.8% of pairs, against ~50.3%
    // for two coins picked at random. Score deciles beat the market
    // 45.1% of the time at the bottom and 51.8% at the top, and rank IC
    // is +0.053 — so the score predicts outperformance and this rule
    // sells it. See promptove/52.
    //
    // That evidence is IN-SAMPLE, which is exactly the situation
    // promptove/50 records getting wrong, so nothing is inverted here.
    // Instead both directions are recorded from today and graded side
    // by side on live, out-of-sample data. The live pairs are unchanged
    // and remain the only ones the site publishes.
    //
    // The shadow is the SAME five pairs with from/to swapped, not a
    // fresh pick. Re-selecting coins would compare two different
    // strategies; swapping isolates the single variable under test.
    //
    // The monitoring-tag gate is deliberately NOT applied to the
    // shadow's buy side. That gate exists so the site never recommends
    // ACQUIRING a flagged coin; the shadow is graded, never published as
    // a recommendation, and re-filtering it would break the one-variable
    // comparison above.
    const shadowPairs = [];
    for (let i = 0; i < Math.min(sells.length, buys.length); i++) {
      const from = sells[i], to = buys[i];
      if (from.coin_id === to.coin_id) continue; // shouldn't happen given disjoint sort directions, guard anyway
      pairs.push({
        snap_date:   today,
        from_id:     from.coin_id,
        from_sym:    (from.coin_sym || from.coin_id).toUpperCase(),
        from_price:  from.price,
        from_score:  from.score,
        to_id:       to.coin_id,
        to_sym:      (to.coin_sym || to.coin_id).toUpperCase(),
        to_price:    to.price,
        to_score:    to.score,
        source:      'sync-rotation-snapshot'
      });
      shadowPairs.push({
        snap_date:   today,
        from_id:     to.coin_id,
        from_sym:    (to.coin_sym || to.coin_id).toUpperCase(),
        from_price:  to.price,
        from_score:  to.score,
        to_id:       from.coin_id,
        to_sym:      (from.coin_sym || from.coin_id).toUpperCase(),
        to_price:    from.price,
        to_score:    from.score,
        source:      'sync-rotation-snapshot-inverted'
      });
    }

    if (!pairs.length) throw new Error('no valid rotation pairs produced');

    const { error: upsertErr } = await supabase
      .from('rotation_snapshots')
      .upsert(pairs, { onConflict: 'snap_date,from_id,to_id,source' });

    if (upsertErr) throw new Error('upsert failed: ' + upsertErr.message);

    // The shadow fails SOFT. It is an experiment running alongside the
    // product; if it cannot be written, the published snapshot has
    // already succeeded above and must not be rolled back or reported
    // as failed because a test could not record itself.
    let shadowSynced = 0;
    if (shadowPairs.length) {
      const { error: shadowErr } = await supabase
        .from('rotation_snapshots')
        .upsert(shadowPairs, { onConflict: 'snap_date,from_id,to_id,source' });
      if (shadowErr) {
        console.warn('[sync-rotation-snapshot] shadow upsert failed, live pairs unaffected:',
          shadowErr.message);
      } else {
        shadowSynced = shadowPairs.length;
      }
    }

    // ── SHADOW 2: park in gold (added 2026-09-23) ───────────────────
    // Hot coins paired with PAXG: every coin in the give-back zone (score
    // >= GOLD_FROM_SCORE), plus the top GOLD_TOP_P30 crypto by 30d return.
    // It is the candidate "Park in gold" card, recorded before anything is
    // published.
    //
    // The in-sample case (Apr–Sep 2026 daily candles): hot coin -> PAXG
    // beat the coin by >2% over 7d on 53.3% of pairs, against 44.8% for a
    // random coin, but the mean spread was only +0.18%. It was +2.54% after
    // BTC 30d was UP and -2.22% after it was DOWN. PAXG–BTC daily
    // correlation is 0.56, so gold is a low-beta place to park, not a hedge.
    // No regime gate is applied here: both regimes are recorded so the gate
    // can be graded on live data rather than adopted from the backtest.
    // BTC's 30d return for any snap_date comes from binance_daily_klines.
    //
    // Deliberately wider than the five live sells. The card would fire for
    // any holding in that zone, so the shadow grades what the card would say.
    //
    // TWO definitions of "hot", recorded side by side (added the same day).
    // The backtest picked the top 5 crypto by 30d RETURN; the card was
    // drafted to fire on SCORE >= 70. They are not the same claim. A high
    // score predicts outperformance (promptove/52), so parking a
    // high-score coin may simply lose: the five live sells -> PAXG over
    // 09-07..09-16 graded spread7 -7.26%, win7 27.5%. Trailing return
    // mean-reverts instead, which is what the backtest's +2.54% rests on.
    // Recording both lets the live data say which trigger the card needs.
    //
    // The 30d pick mirrors the backtest: crypto only (the backtest ranked
    // binance_daily_klines, which has no bstocks), gold itself excluded.
    //
    // A coin picked by BOTH rules gets ONE row, source '-gold-both', so
    // it is recorded once and counted by both grades: grade the score
    // rule on ('-gold','-gold-both') and the 30d rule on
    // ('-gold-30d','-gold-both').
    //
    // Since v16 (2026-09-23) the upsert key includes source
    // (sql/measurement_hardening_2026-09-23.sql). v15 had to SKIP a gold
    // pair the live snapshot had already written, because PAXG scores low
    // enough to land in the live buys and the shared key would have
    // overwritten the live row. Now each source owns its own row and no
    // pair is dropped from the gold grade.
    //
    // Fails soft, like the inverted shadow above.
    const GOLD_FROM_SCORE = 70;
    const GOLD_TOP_P30    = 5;
    const GOLD_SYMS       = new Set(['PAXG', 'XAUT']);
    let goldSynced = 0;
    let goldNote: string | null = null;
    const goldBySource: Record<string, number> = {};
    const gold = scorable.find((it) => (it.coin_sym || '').toUpperCase() === 'PAXG');
    if (!gold) {
      goldNote = 'PAXG not scorable in this run';
    } else {
      const notGold = (it: RunItem) => !GOLD_SYMS.has((it.coin_sym || '').toUpperCase());
      const byScore = new Set(scorable
        .filter((it) => notGold(it) && (it.score as number) >= GOLD_FROM_SCORE)
        .map((it) => it.coin_id));
      const by30d = new Set(scorable
        .filter((it) => notGold(it) && it.asset_type === 'crypto' && it.p30 != null)
        .sort((a, b) => (b.p30 as number) - (a.p30 as number))
        .slice(0, GOLD_TOP_P30)
        .map((it) => it.coin_id));
      const goldPairs = scorable
        .filter((it) => byScore.has(it.coin_id) || by30d.has(it.coin_id))
        .map((from) => ({
          snap_date:   today,
          from_id:     from.coin_id,
          from_sym:    (from.coin_sym || from.coin_id).toUpperCase(),
          from_price:  from.price,
          from_score:  from.score,
          to_id:       gold.coin_id,
          to_sym:      'PAXG',
          to_price:    gold.price,
          to_score:    gold.score,
          source:      byScore.has(from.coin_id) && by30d.has(from.coin_id) ? 'sync-rotation-snapshot-gold-both'
                     : byScore.has(from.coin_id)                           ? 'sync-rotation-snapshot-gold'
                     :                                                       'sync-rotation-snapshot-gold-30d'
        }));
      if (goldPairs.length) {
        const { error: goldErr } = await supabase
          .from('rotation_snapshots')
          .upsert(goldPairs, { onConflict: 'snap_date,from_id,to_id,source' });
        if (goldErr) {
          console.warn('[sync-rotation-snapshot] gold shadow upsert failed, live pairs unaffected:',
            goldErr.message);
          goldNote = 'upsert failed: ' + goldErr.message;
        } else {
          goldSynced = goldPairs.length;
          for (const p of goldPairs) goldBySource[p.source] = (goldBySource[p.source] ?? 0) + 1;
        }
      }
    }

    // ── SHADOW 3: top-20 by market cap, inverted (added 2026-09-23) ──
    // The only rule that stayed above random in both halves of the
    // 771-day history at every horizon (promptove/58, rule R3): within the
    // 20 largest scorable coins, rotate OUT of the 5 lowest scores INTO the
    // 5 highest, paired rank by rank. ~53% of 7-day pairs won in the
    // backtest. It is graded at 7 days by rotator-backtest/rotation-verdict.js
    // against bands fixed the same day. Never published.
    //
    // Built exactly as the backtest ran it, so the live grade tests the
    // same rule: no monitoring-tag filter (the backtest had none, and a
    // top-20 coin rarely carries one), bstocks are never scorable here.
    // Fails soft, like the shadows above.
    let top20Synced = 0;
    let top20Note: string | null = null;
    {
      const big = scorable.filter((it) => it.mcap != null && it.mcap > 0)
        .sort((a, b) => (b.mcap as number) - (a.mcap as number)).slice(0, 20);
      const out = [...big].sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 5);
      const into = [...big].sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 5);
      const top20Pairs = [];
      for (let i = 0; i < Math.min(out.length, into.length); i++) {
        const from = out[i], to = into[i];
        if (from.coin_id === to.coin_id) continue;
        top20Pairs.push({
          snap_date:   today,
          from_id:     from.coin_id,
          from_sym:    (from.coin_sym || from.coin_id).toUpperCase(),
          from_price:  from.price,
          from_score:  from.score,
          to_id:       to.coin_id,
          to_sym:      (to.coin_sym || to.coin_id).toUpperCase(),
          to_price:    to.price,
          to_score:    to.score,
          source:      'sync-rotation-snapshot-top20'
        });
      }
      if (big.length < 20) top20Note = `only ${big.length} scorable coins with a market cap`;
      if (top20Pairs.length) {
        const { error: t20Err } = await supabase
          .from('rotation_snapshots')
          .upsert(top20Pairs, { onConflict: 'snap_date,from_id,to_id,source' });
        if (t20Err) {
          console.warn('[sync-rotation-snapshot] top-20 shadow upsert failed, live pairs unaffected:', t20Err.message);
          top20Note = 'upsert failed: ' + t20Err.message;
        } else {
          top20Synced = top20Pairs.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        synced: pairs.length,
        top20_synced: top20Synced,
        top20_note: top20Note,
        shadow_synced: shadowSynced,
        gold_synced: goldSynced,
        gold_by_source: goldBySource,
        gold_note: goldNote,
        snap_date: today,
        run_id: run.id,
        // Runs passed over because their items were not written yet.
        skipped_runs: skippedRuns,
        engine_version: run.engine_version,
        scorable_count: scorable.length,
        // Named separately from scorable_count so "the tag sync is broken"
        // and "no flagged coins were in range today" can never look alike.
        monitoring_known: monitored.size,
        monitoring_excluded_from_buys: scorable.filter(isMonitored).map((it) =>
          (it.coin_sym || it.coin_id).toUpperCase()),
      }),
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
