// ============================================================
// send-telegram-alerts — Supabase Edge Function
//
// Reads today's row in `signal_snapshots` (written once/day by the
// client via record_daily_snapshot — see js/signal-history.js) and
// sends filtered Telegram alerts. Does NOT recompute scores — reuses
// what the site already snapshots, same pattern as
// sync-rotation-snapshot reusing market_cache instead of re-fetching.
//
// FILTERS (per your Sept 2026 spec):
//   BUY  — score >= 70 (your "High Momentum" tier, not the
//          mean-reversion "buy zone" — those are opposite ends of your
//          score. Momentum tier is what actually caught FIL/JTO.)
//        AND vol_ratio >= 1.5 (24h volume >= 1.5x the 7d average)
//        AND safeToBuy (macro gate — suppressed entirely if false)
//   SELL — score <= 40
//        AND the coin's symbol is in my_holdings (see
//          sql/my_holdings_table.sql — holdings only ever lived in
//          browser localStorage before this, so this is the one place
//          you tell the server what you hold)
//   Macro gate closed -> suppress ALL alerts (buy AND sell), matching
//   "if the macro gate is closed, suppress all alerts" from the spec.
//
// NOTE ON THE MACRO GATE: js/signals.js computes window.safeToBuy
// client-side in renderAll() using live Fear & Greed + DXY/Oil %.
// This function can't read that browser global, so it recomputes the
// same three conditions here from market_cache['fear_greed'] and
// market_cache['macro_data'] (both already populated by existing sync
// jobs) — kept in sync manually with the renderAll() version, same as
// TOKENOMICS_DB is kept in sync with config.js elsewhere in this repo.
//
// DEPLOY:
//   supabase functions deploy send-telegram-alerts
//   supabase secrets set TELEGRAM_BOT_TOKEN=<from @BotFather>
//   supabase secrets set TELEGRAM_CHAT_ID=<your chat id, from
//     https://api.telegram.org/bot<TOKEN>/getUpdates after messaging
//     your bot once>
//   supabase secrets set TELEGRAM_ALERTS_SECRET=<own random secret,
//     same reasoning as ROTATION_SYNC_SECRET — never reuse another
//     function's secret>
//
// SCHEDULE: see sql/send_telegram_alerts_cron.sql — run AFTER the
// day's signal_snapshots row exists (after sync-rotation-snapshot's
// 19:00 UTC slot is a safe bet; adjust to when YOUR daily snapshot
// actually lands, since it's currently written by the first visitor
// of the day, not on a fixed schedule).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_ALERTS_SECRET = Deno.env.get('TELEGRAM_ALERTS_SECRET')!;
const TELEGRAM_BOT_TOKEN     = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_CHAT_ID       = Deno.env.get('TELEGRAM_CHAT_ID')!;

const BUY_SCORE_MIN   = 70;
const BUY_VOLRATIO_MIN = 1.5;
const SELL_SCORE_MAX  = 40;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface SnapshotRow {
  coin_id: string;
  coin_sym: string;
  coin_name: string;
  signal_type: string;
  score: number;
  price: number;
  vol_ratio: number | null;
  zone: string | null;
}

async function getMacroGate(): Promise<{ safe: boolean; reason: string }> {
  const { data: fgRow } = await supabase
    .from('market_cache')
    .select('data')
    .eq('cache_key', 'fear_greed')
    .maybeSingle();
  const { data: macroRow } = await supabase
    .from('market_cache')
    .select('data')
    .eq('cache_key', 'macro_data')
    .maybeSingle();

  const fg = fgRow?.data?.value ?? 50;
  const dxyP7 = macroRow?.data?.dxyP7 ?? 0;
  const oilP7 = macroRow?.data?.oilP7 ?? 0; // % 7d change — no absolute oil price feed in this project

  if (fg > 70) return { safe: false, reason: `Fear&Greed ${fg} (Greed)` };
  if (dxyP7 > 2) return { safe: false, reason: `DXY +${dxyP7.toFixed(1)}% 7d` };
  if (oilP7 > 5) return { safe: false, reason: `Oil +${oilP7.toFixed(1)}% 7d` };
  return { safe: true, reason: 'clear' };
}

async function sendTelegram(text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram send failed: ${res.status} ${body}`);
  }
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') || '';
  if (auth !== `Bearer ${TELEGRAM_ALERTS_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const gate = await getMacroGate();
  if (!gate.safe) {
    return new Response(
      JSON.stringify({ ok: true, sent: 0, reason: `macro gate closed: ${gate.reason}` }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: rows, error } = await supabase
    .from('signal_snapshots')
    .select('coin_id, coin_sym, coin_name, signal_type, score, price, vol_ratio, zone')
    .eq('snap_date', today);

  if (error) {
    return new Response(JSON.stringify({ ok: false, reason: error.message }), { status: 500 });
  }
  if (!rows || !rows.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no snapshot for today yet' }));
  }

  const { data: holdingsRows } = await supabase.from('my_holdings').select('sym');
  const holdings = new Set((holdingsRows || []).map((h: { sym: string }) => h.sym.toUpperCase()));

  let sent = 0;

  for (const r of rows as SnapshotRow[]) {
    // BUY: High Momentum tier (score >= 70) + volume confirmation.
    // This is deliberately the momentum tier, not the mean-reversion
    // "buy zone" (which is LOW score in this project's scoring model
    // — see _classifyZones() in js/signals.js) per your explicit
    // choice of "alert on High Momentum tiles."
    if (r.score >= BUY_SCORE_MIN && (r.vol_ratio ?? 0) >= BUY_VOLRATIO_MIN) {
      await sendTelegram(
        `🟢 <b>BUY signal</b>: ${r.coin_sym} (${r.coin_name})\n` +
        `Score: ${r.score} · Vol ratio: ${(r.vol_ratio ?? 0).toFixed(2)}x\n` +
        `Price: $${r.price}`
      );
      sent++;
    }

    // SELL: score <= 40 AND you actually hold it (see my_holdings).
    if (r.score <= SELL_SCORE_MAX && holdings.has(r.coin_sym.toUpperCase())) {
      await sendTelegram(
        `🔴 <b>SELL signal</b>: ${r.coin_sym} (${r.coin_name}) — held position\n` +
        `Score: ${r.score}\n` +
        `Price: $${r.price}`
      );
      sent++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
