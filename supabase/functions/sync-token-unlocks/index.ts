// ============================================================
// sync-token-unlocks — Supabase Edge Function
//
// Fills `token_unlocks.unlock30d_pct`: how much of a coin's currently
// unlocked supply vests over the NEXT 30 DAYS.
//
// WHY THIS EXISTS, added 2026-09-11.
//
// The engine has had an `unlock30d` field in TOKENOMICS_DB since 2.0.0,
// with a real penalty behind it (`unlock30d > 5` costs 15 points). It
// has been set for ZERO of 250 coins, because the comment beside it says
// no live vesting feed exists in this project and it must be filled by
// hand. Nobody ever filled one.
//
// So the tool could — and did — give a good score to a coin with a large
// cliff the next day. An unlock is the most predictable adverse event in
// this asset class and it is knowable days in advance.
//
// SOURCE. DefiLlama's emissions API returns 402 (paid). The dataset
// bucket their own front end reads is open:
//   https://defillama-datasets.llama.fi/emissions/<slug>
// Each file carries labelled tranches of timestamped CUMULATIVE
// `unlocked` amounts, past and future.
//
// THE MAPPING IS VERIFIED, NOT TRUSTED. The slug comes from DefiLlama's
// free /protocols index joined on `gecko_id`, which avoids symbol
// guessing — but several matches land on a BRIDGE or a CHAIN rather than
// the token (polygon-bridge, starknet-bridge, ronin-bridge,
// binance-smart-chain). Every payload carries its own `gecko_id`, so
// this function re-checks it and REFUSES the row on a mismatch rather
// than storing someone else's schedule. That check is the difference
// between a feed and a plausible-looking feed.
//
// BATCHED, because payloads run 0.5-5.6MB each and 76 of them will not
// fit in one invocation. Each run takes the few stalest rows. Unlock
// schedules are published vesting plans; they do not move hour to hour,
// so a full cycle every few hours is ample.
//
// NULL IS NOT ZERO. Coverage is ~30% of the universe. A coin with no
// schedule keeps `unlock30d_pct = NULL`, which means "no schedule
// available" and must never be read as "no unlock due". Same rule that
// fear_greed and the RSI confirmation gate already follow.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNAL_RUN_SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/* Sized against the 5.6MB worst case (osmosis-dex). Parsed one at a time
   and discarded, so peak memory is one payload, not six. */
const BATCH = 6;
const DAY = 86400;

type Point = { timestamp: number; unlocked: number };
type Tranche = { label?: string; data?: Point[] };

/** Cumulative unlocked across every tranche, at a point in time. */
function unlockedAt(tranches: Tranche[], at: number): number {
  let total = 0;
  for (const t of tranches) {
    const pts = t.data ?? [];
    let best = 0;
    /* `unlocked` is cumulative per tranche, so the value at `at` is the
       last point at or before it. Taking the max rather than assuming
       the array is sorted — a non-monotonic series would otherwise
       silently under-report. */
    for (const p of pts) {
      if (p && typeof p.timestamp === 'number' && typeof p.unlocked === 'number'
          && p.timestamp <= at && p.unlocked > best) best = p.unlocked;
    }
    total += best;
  }
  return total;
}

/** The first future step up, so the row can say WHEN as well as how much. */
function nextStep(tranches: Tranche[], now: number, nowTotal: number) {
  let bestTs: number | null = null;
  for (const t of tranches) {
    for (const p of (t.data ?? [])) {
      if (!p || typeof p.timestamp !== 'number') continue;
      if (p.timestamp <= now) continue;
      if (bestTs !== null && p.timestamp >= bestTs) continue;
      if (unlockedAt(tranches, p.timestamp) > nowTotal * 1.0001) bestTs = p.timestamp;
    }
  }
  if (bestTs === null) return { at: null as string | null, pct: null as number | null };
  const jump = unlockedAt(tranches, bestTs) - nowTotal;
  return {
    at: new Date(bestTs * 1000).toISOString(),
    pct: nowTotal > 0 ? (jump / nowTotal) * 100 : null,
  };
}

Deno.serve(async (req: Request) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!SIGNAL_RUN_SYNC_SECRET || token !== SIGNAL_RUN_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    /* Stalest first, nulls before dates, so a fresh table fills in and
       then rotates evenly without needing a cursor. */
    const { data: rows, error: pickErr } = await supabase
      .from('token_unlocks')
      .select('coin_id, slug')
      .order('schedule_checked_at', { ascending: true, nullsFirst: true })
      .limit(BATCH);
    if (pickErr) throw new Error('pick failed: ' + pickErr.message);
    if (!rows?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0, note: 'no rows seeded' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const now = Math.floor(Date.now() / 1000);
    const report: Record<string, unknown>[] = [];

    for (const row of rows) {
      const stamp = new Date().toISOString();
      try {
        const res = await fetch(
          `https://defillama-datasets.llama.fi/emissions/${encodeURIComponent(row.slug)}`,
          { headers: { 'Accept': 'application/json' } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();

        /* THE VERIFICATION. A slug matched via /protocols can point at a
           bridge or chain; the payload says who it really is. */
        const gecko = payload?.gecko_id;
        if (gecko && gecko !== row.coin_id) {
          await supabase.from('token_unlocks').update({
            unlock30d_pct: null, next_unlock_at: null, next_unlock_pct: null,
            schedule_checked_at: stamp, updated_at: stamp,
            last_error: `gecko_id mismatch: payload says ${gecko}`,
          }).eq('coin_id', row.coin_id);
          report.push({ coin: row.coin_id, slug: row.slug, skipped: `belongs to ${gecko}` });
          continue;
        }

        const tranches: Tranche[] = payload?.documentedData?.data ?? [];
        if (!tranches.length) throw new Error('no documentedData.data');

        const nowTotal = unlockedAt(tranches, now);
        const in30 = unlockedAt(tranches, now + 30 * DAY);
        if (!(nowTotal > 0)) throw new Error('nothing unlocked yet — cannot express as a percentage');

        const pct = ((in30 - nowTotal) / nowTotal) * 100;
        const step = nextStep(tranches, now, nowTotal);

        await supabase.from('token_unlocks').update({
          unlock30d_pct: Number(pct.toFixed(4)),
          next_unlock_at: step.at,
          next_unlock_pct: step.pct != null ? Number(step.pct.toFixed(4)) : null,
          unlocked_now: nowTotal,
          schedule_checked_at: stamp, updated_at: stamp, last_error: null,
        }).eq('coin_id', row.coin_id);

        report.push({ coin: row.coin_id, unlock30d_pct: Number(pct.toFixed(2)), next: step.at });
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        /* Stamp checked_at even on failure, so one broken slug cannot
           wedge the rotation by staying permanently stalest. The old
           value is left in place rather than nulled — a stale reading
           beats no reading, and last_error records why. */
        await supabase.from('token_unlocks').update({
          schedule_checked_at: stamp, updated_at: stamp, last_error: msg.slice(0, 300),
        }).eq('coin_id', row.coin_id);
        report.push({ coin: row.coin_id, error: msg.slice(0, 120) });
        console.warn(`[sync-token-unlocks] ${row.coin_id} (${row.slug}):`, msg);
      }
    }

    const { count } = await supabase.from('token_unlocks')
      .select('coin_id', { count: 'exact', head: true })
      .not('unlock30d_pct', 'is', null);

    console.log(`[sync-token-unlocks] processed ${rows.length}, ${count ?? '?'} coins now have a figure`);
    return new Response(JSON.stringify({
      ok: true, processed: rows.length, with_figure: count, report,
      ts: new Date().toISOString(),
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error('[sync-token-unlocks] failed:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
