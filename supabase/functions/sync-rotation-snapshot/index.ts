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
    // ── Latest canonical run — same source the site and the bot read. ──
    const { data: run, error: runErr } = await supabase
      .from('signal_runs')
      .select('id,as_of,engine_version')
      .order('as_of', { ascending: false })
      .limit(1)
      .single();
    if (runErr || !run) throw new Error('no signal_runs row found: ' + (runErr?.message ?? 'empty'));

    const { data: items, error: itemsErr } = await supabase
      .from('signal_run_items')
      .select('coin_id,coin_sym,price,score,eligible,data_complete')
      .eq('run_id', run.id);
    if (itemsErr || !items) throw new Error('signal_run_items fetch failed: ' + (itemsErr?.message ?? 'empty'));

    // Stablecoins/delisted are already excluded upstream by compute-signal-run
    // (its own eligibility gate) — no re-filtering needed here beyond that.
    const scorable = (items as RunItem[]).filter((it) =>
      it.eligible !== false &&
      it.data_complete !== false &&
      it.score != null &&
      it.price != null && it.price > 0
    );

    if (scorable.length < 10) {
      throw new Error(`only ${scorable.length} scorable coins in run #${run.id} — too few for a meaningful snapshot`);
    }

    const sells = [...scorable].sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 5);
    const buys  = [...scorable].sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 5);

    const today = new Date().toISOString().slice(0, 10);
    const pairs = [];
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
    }

    if (!pairs.length) throw new Error('no valid rotation pairs produced');

    const { error: upsertErr } = await supabase
      .from('rotation_snapshots')
      .upsert(pairs, { onConflict: 'snap_date,from_id,to_id' });

    if (upsertErr) throw new Error('upsert failed: ' + upsertErr.message);

    return new Response(
      JSON.stringify({
        synced: pairs.length,
        snap_date: today,
        run_id: run.id,
        engine_version: run.engine_version,
        scorable_count: scorable.length
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
