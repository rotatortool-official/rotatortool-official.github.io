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

// Returns a result instead of throwing.
//
// It used to throw, and nothing wrapped the send loops — so ONE bad send
// aborted the whole run and silently dropped every remaining alert. Worse,
// the throw escaped Deno.serve, so the caller got a bare 500 with an empty
// body and no clue why. The 2026-09-06 outage was a single wrong
// TELEGRAM_CHAT_ID ("chat not found"), and finding that took an edge-log
// dig that the response should have told us outright.
type SendResult = { ok: true } | { ok: false; error: string };

async function sendTelegram(text: string): Promise<SendResult> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
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
      const body = (await res.text().catch(() => '')).slice(0, 300);
      return { ok: false, error: `${res.status} ${body}` };
    }
    return { ok: true };
  } catch (e) {
    // fetch itself threw — network/DNS, no response at all.
    return { ok: false, error: `fetch failed: ${e instanceof Error ? e.message : String(e)}` };
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

  // Fail fast and legibly on missing config, rather than letting every
  // single send fail one at a time against the Telegram API.
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return new Response(
      JSON.stringify({
        ok: false,
        sent: 0,
        reason: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const gate = await getMacroGate();
  if (!gate.safe) {
    return new Response(
      JSON.stringify({ ok: true, sent: 0, reason: `macro gate closed: ${gate.reason}` }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  let failed = 0;
  const errs: string[] = [];

  // ── BUY: momentum_snapshots ──────────────────────────────────
  const { data: momRows, error: momErr } = await supabase
    .from('momentum_snapshots')
    .select('coin_id, coin_sym, coin_name, score, price, vol_ratio')
    .eq('snap_date', today);

  if (momErr) {
    return new Response(JSON.stringify({ ok: false, reason: momErr.message }), { status: 500 });
  }

  const buyLines: string[] = [];
  for (const r of (momRows ?? []) as MomentumRow[]) {
    if (r.score >= BUY_SCORE_MIN && (r.vol_ratio ?? 0) >= BUY_VOLRATIO_MIN) {
      buyLines.push(
        `• <b>${r.coin_sym}</b> (${r.coin_name}) — ${r.score} · vol ${(r.vol_ratio ?? 0).toFixed(2)}x · $${r.price}`,
      );
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

  const sellLines: string[] = [];
  for (const r of (heldRows ?? []) as HoldingsRow[]) {
    if (r.score <= SELL_SCORE_MAX) {
      sellLines.push(`• <b>${r.sym}</b> — ${r.score} · $${r.price}`);
    }
  }

  if (!momRows?.length && !heldRows?.length) {
    return new Response(
      JSON.stringify({ ok: true, alerts: 0, sent: 0, reason: 'no snapshots for today yet' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const alerts = buyLines.length + sellLines.length;
  if (alerts === 0) {
    return new Response(
      JSON.stringify({ ok: true, alerts: 0, sent: 0, reason: 'no coin met the thresholds today' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── One digest, not one message per coin ─────────────────────
  // Rationale: a single phone notification, the whole picture in one
  // glance, and one thing that can fail instead of N.
  //
  // NOT a rate-limit workaround — worth stating so nobody "fixes" it back.
  // Telegram allows ~1 msg/sec sustained to a single chat and the 5-message
  // run on 2026-09-06 delivered 5 of 5. Supabase does not throttle outbound
  // fetch at all. If a limit ever were hit it would surface as HTTP 429 with
  // retry_after in the `errors` array below, not as silence.
  const lines: string[] = [`📊 <b>Rotator signals</b> — ${today}`];
  if (buyLines.length)  lines.push('', '🟢 <b>BUY</b>', ...buyLines);
  if (sellLines.length) lines.push('', '🔴 <b>SELL</b> — held positions', ...sellLines);

  // Telegram hard-caps a message at 4096 chars. Split on line boundaries
  // well under that rather than risking a 400 on an unusually busy day.
  const MAX_CHARS = 3500;
  const chunks: string[] = [];
  let buf = '';
  for (const ln of lines) {
    const next = buf ? `${buf}\n${ln}` : ln;
    if (buf && next.length > MAX_CHARS) {
      chunks.push(buf);
      buf = ln;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);

  let sent = 0;
  for (const c of chunks) {
    const out = await sendTelegram(c);
    if (out.ok) {
      sent++;
    } else {
      failed++;
      if (errs.length < 5) errs.push(out.error);
    }
  }

  return new Response(
    // `alerts` counts coins, `sent` counts messages — normally 1. Keeping
    // both means a quiet day and a delivery failure never look alike.
    JSON.stringify({ ok: failed === 0, alerts, sent, failed, ...(errs.length ? { errors: errs } : {}) }),
    {
      // Loud only when nothing got through at all. A partial failure still
      // delivered real alerts, so it stays a 200 carrying the count and the
      // reason, rather than reading as a total outage.
      status: sent === 0 && failed > 0 ? 500 : 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
