// ============================================================
// send-telegram-alerts — Supabase Edge Function
//
// Reads today's rows from momentum_snapshots + holdings_snapshots
// (written once/day by the client — see js/signals.js's
// renderTopBars() and js/supabase.js's supaRecordMomentumSnapshot /
// supaRecordHoldingsSnapshot) and sends filtered Telegram alerts.
//
// IMPORTANT — why not signal_snapshots: that table's 'bullish' pool
// (written by js/signal-history.js's takeSnapshot()) is gated by the
// mean-reversion filter (-3%..-40% 30D pullback) and structurally
// EXCLUDES high-momentum coins. It's a different, opposite-intent
// table from what "BUY = High Momentum" needs. See
// sql/create_momentum_and_holdings_snapshots.sql for the fix.
//
// FILTERS (per your Sept 2026 spec + Sept 4 clarification):
//   BUY  — score >= 70 (the "High Momentum" tier, score>=60 in the UI,
//          filtered here to >=70 — the tier that actually caught
//          FIL/JTO, per your explicit choice over the mean-reversion
//          "buy zone")
//        AND vol_ratio >= 1.5 (24h volume >= 1.5x the 7d average)
//        AND safeToBuy (macro gate — suppressed entirely if false)
//   SELL — score <= 40, read from holdings_snapshots (today's score
//          for each symbol actually in my_holdings — not "whichever
//          10 coins are globally lowest-scored", which could miss a
//          held coin sitting at score 38 if 50 others scored lower)
//   Macro gate closed -> suppress ALL alerts (buy AND sell)
//
// NOTE ON THE MACRO GATE: js/signals.js computes window.safeToBuy
// client-side in renderAll() using live Fear & Greed + DXY/Oil %. This
// function can't read that browser global, so it recomputes the same
// three conditions here from market_cache['fear_greed'] and
// market_cache['macro_data'] — kept in sync manually with the
// renderAll() version, same as TOKENOMICS_DB is kept in sync with
// config.js elsewhere in this repo.
//
// DEPLOY:
//   supabase functions deploy send-telegram-alerts
//   supabase secrets set TELEGRAM_BOT_TOKEN=<from @BotFather>
//   supabase secrets set TELEGRAM_CHAT_ID=<your chat id>
//   supabase secrets set TELEGRAM_ALERTS_SECRET=<own random secret>
//
// SCHEDULE: see sql/send_telegram_alerts_cron.sql. Both snapshot
// tables are written once/day by the FIRST VISITOR of the day (same
// pattern as signal_snapshots always used) — not on a fixed schedule.
// If traffic is light some days, this may find nothing yet and return
// "no snapshots for today yet" rather than erroring.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_ALERTS_SECRET = Deno.env.get('TELEGRAM_ALERTS_SECRET') ?? '';
const TELEGRAM_BOT_TOKEN     = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID       = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

const BUY_SCORE_MIN     = 70;
const BUY_VOLRATIO_MIN  = 1.5;
const SELL_SCORE_MAX    = 40;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface MomentumRow {
  coin_id: string;
  coin_sym: string;
  coin_name: string;
  score: number;
  price: number;
  vol_ratio: number | null;
}

interface HoldingsRow {
  sym: string;
  coin_id: string | null;
  score: number;
  price: number;
}

async function getMacroGate(): Promise<{ safe: boolean; reason: string }> {
  const { data: fgRow } = await supabase
    .from('market_cache').select('data').eq('cache_key', 'fear_greed').maybeSingle();
  const { data: macroRow } = await supabase
    .from('market_cache').select('data').eq('cache_key', 'macro_data').maybeSingle();

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
  const expected = `Bearer ${TELEGRAM_ALERTS_SECRET}`;
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const gate = await getMacroGate();
  if (!gate.safe) {
    return new Response(
      JSON.stringify({ ok: true, sent: 0, reason: `macro gate closed: ${gate.reason}` }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;

  // ── BUY: momentum_snapshots ──────────────────────────────────
  const { data: momRows, error: momErr } = await supabase
    .from('momentum_snapshots')
    .select('coin_id, coin_sym, coin_name, score, price, vol_ratio')
    .eq('snap_date', today);

  if (momErr) {
    return new Response(JSON.stringify({ ok: false, reason: momErr.message }), { status: 500 });
  }

  for (const r of (momRows ?? []) as MomentumRow[]) {
    if (r.score >= BUY_SCORE_MIN && (r.vol_ratio ?? 0) >= BUY_VOLRATIO_MIN) {
      await sendTelegram(
        `🟢 <b>BUY signal</b>: ${r.coin_sym} (${r.coin_name})\n` +
        `Score: ${r.score} · Vol ratio: ${(r.vol_ratio ?? 0).toFixed(2)}x\n` +
        `Price: $${r.price}`
      );
      sent++;
    }
  }

  // ── SELL: holdings_snapshots ─────────────────────────────────
  const { data: heldRows, error: heldErr } = await supabase
    .from('holdings_snapshots')
    .select('sym, coin_id, score, price')
    .eq('snap_date', today);

  if (heldErr) {
    return new Response(JSON.stringify({ ok: false, reason: heldErr.message }), { status: 500 });
  }

  for (const r of (heldRows ?? []) as HoldingsRow[]) {
    if (r.score <= SELL_SCORE_MAX) {
      await sendTelegram(
        `🔴 <b>SELL signal</b>: ${r.sym} — held position\n` +
        `Score: ${r.score}\n` +
        `Price: $${r.price}`
      );
      sent++;
    }
  }

  if (!momRows?.length && !heldRows?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no snapshots for today yet' }));
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
