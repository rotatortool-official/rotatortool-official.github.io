// ============================================================
// send-telegram-alerts — Supabase Edge Function
//
// Alerts on ZONE TRANSITIONS in the canonical engine's own output.
// Sell into strength, buy into weakness, and say nothing on a quiet day.
//
// ── Why this was rewritten (2026-09-06) ─────────────────────
// The previous version bought at score >= 70 and sold at score <= 40.
// The engine's own zone thresholds are _SIG_BUY_BASE = 38 and
// _SIG_SELL_BASE = 62 (rotator-engine/engine.template.js), so the old
// SELL rule fired almost exactly where the website says BUY. On
// 2026-09-06 it told the user to sell ONDO, INJ, FIL and RENDER — all
// four labelled zone='buy' by the site, with FIL up 16.7% over 7d. The
// bot and the website gave opposite advice on the same data.
//
// Three things changed:
//   1. SOURCE. Reads signal_run_items (server-authoritative, recomputed
//      every 15 min) instead of momentum_snapshots/holdings_snapshots,
//      which were written once a day by whichever visitor happened to
//      load the site first. Those were measurably stale: ONDO 20 vs a
//      live 25, INJ 28 vs 37, RENDER 34 vs 42.
//   2. DIRECTION. Take profit when a HELD coin enters the sell zone;
//      suggest entries when an unheld eligible coin enters the buy zone.
//   3. TRANSITIONS, NOT STATE. A coin sitting in a zone is not news —
//      that is what produced the same four SELL lines every evening.
//      Crossing into a zone is the event. No crossings, no message.
//
// Do NOT re-derive thresholds here. They belong to the engine and are
// versioned with it; this function reads the `zone` column and never
// second-guesses it.
//
// ── Known open question, deliberately shipped anyway ────────
// rotator-backtest measured POSITIVE rank IC on `score` over 771 days
// (0.019 7d -> 0.057 30d, significant at every horizon), i.e. momentum
// persisted and the low end kept underperforming. The `setup` metric
// built for the mean-reversion thesis had NEGATIVE 7d IC (-0.022,
// t=-2.72). See promptove/08-backtest-results-2026-09-05.md.
//
// That measurement is about ranking what to buy. It does not cover
// take-profit on an existing position, which is path-dependent and was
// never tested. Shipping this makes the bot agree with the website —
// the inconsistency above is a defect either way — and the transition
// backtest is the follow-up that settles the direction with data.
//
// MACRO GATE: applies to BUY only. Suppressing take-profit alerts
// during greed would silence them exactly when they matter most; the
// old version gated both, which was wrong for the sell side.
//
// DEPLOY:
//   supabase functions deploy send-telegram-alerts --no-verify-jwt
//   supabase secrets set TELEGRAM_BOT_TOKEN=<from @BotFather>
//   supabase secrets set TELEGRAM_CHAT_ID=<your chat id>
//   supabase secrets set TELEGRAM_ALERTS_SECRET=<own random secret>
//
// SCHEDULE: sql/send_telegram_alerts_cron.sql — daily 19:30 UTC. The
// 24h lookback matches that cadence: run it more often and the same
// crossing would be reported repeatedly.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_ALERTS_SECRET = Deno.env.get('TELEGRAM_ALERTS_SECRET') ?? '';
const TELEGRAM_BOT_TOKEN     = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID       = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

// Look-back for "did this coin cross a zone boundary". Matches the daily
// cron; a shorter window would re-report the same crossing.
const LOOKBACK_HOURS = 24;

// Cap on buy suggestions in one message. A market-wide selloff can push
// dozens of coins into the buy zone at once; five ranked by market cap is
// a shortlist, not a wall of text. Sells are never capped — they are your
// own positions and you should see all of them.
const MAX_BUY_LINES = 5;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface ItemRow {
  coin_sym: string;
  score: number | string | null;
  zone: string | null;
  eligible: boolean | null;
  price: number | string | null;
  mcap: number | string | null;
}

// signal_run_items stores score/price/mcap as `numeric`, which PostgREST
// returns as JSON STRINGS to preserve precision. Every comparison and
// sort below would be lexicographic without this.
const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const fmtPrice = (p: number | null): string => {
  if (p === null) return 'n/a';
  if (p >= 1000) return `$${p.toFixed(0)}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  return `$${p.toPrecision(3)}`;
};

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') || '';
  if (auth !== `Bearer ${TELEGRAM_ALERTS_SECRET}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  // Fail fast and legibly on missing config, rather than letting every
  // single send fail one at a time against the Telegram API.
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return json({ ok: false, sent: 0, reason: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' }, 500);
  }

  // ── The two runs being compared ──────────────────────────────
  const { data: latestRun, error: lrErr } = await supabase
    .from('signal_runs').select('id, as_of')
    .order('as_of', { ascending: false }).limit(1).maybeSingle();

  if (lrErr)      return json({ ok: false, reason: lrErr.message }, 500);
  if (!latestRun) return json({ ok: true, sent: 0, reason: 'no signal_runs yet' });

  const cutoff = new Date(new Date(latestRun.as_of).getTime() - LOOKBACK_HOURS * 3600000);
  const { data: prevRun, error: prErr } = await supabase
    .from('signal_runs').select('id, as_of')
    .lte('as_of', cutoff.toISOString())
    .order('as_of', { ascending: false }).limit(1).maybeSingle();

  if (prErr) return json({ ok: false, reason: prErr.message }, 500);

  // Without a baseline every coin looks like it "just entered" its zone,
  // which on a fresh database means a 90-coin message. Stay silent until
  // there is real history to compare against.
  if (!prevRun) {
    return json({
      ok: true, sent: 0, buys: 0, sells: 0,
      reason: `no run older than ${LOOKBACK_HOURS}h to compare against yet`,
    });
  }

  const cols = 'coin_sym, score, zone, eligible, price, mcap';
  const [nowRes, oldRes] = await Promise.all([
    supabase.from('signal_run_items').select(cols).eq('run_id', latestRun.id),
    supabase.from('signal_run_items').select('coin_sym, zone, score').eq('run_id', prevRun.id),
  ]);
  if (nowRes.error) return json({ ok: false, reason: nowRes.error.message }, 500);
  if (oldRes.error) return json({ ok: false, reason: oldRes.error.message }, 500);

  const { data: holdRows, error: hErr } = await supabase.from('my_holdings').select('sym');
  if (hErr) return json({ ok: false, reason: hErr.message }, 500);
  const held = new Set((holdRows ?? []).map((h: { sym: string }) => (h.sym || '').toUpperCase()));

  const prevZone = new Map<string, { zone: string | null; score: number | null }>();
  for (const r of (oldRes.data ?? []) as ItemRow[]) {
    prevZone.set((r.coin_sym || '').toUpperCase(), { zone: r.zone, score: num(r.score) });
  }

  const gate = await getMacroGate();

  // ── Classify transitions ─────────────────────────────────────
  interface Line {
    sym: string;
    score: number | null;
    was: number | null;
    price: number | null;
    mcap: number;
  }
  const sells: Line[] = [];
  const buys: Line[] = [];

  for (const r of (nowRes.data ?? []) as ItemRow[]) {
    const sym = (r.coin_sym || '').toUpperCase();
    const prev = prevZone.get(sym);

    // A coin with no baseline is newly listed or newly scored, not a
    // crossing. Silence beats a false signal.
    if (!prev || !prev.zone || !r.zone || prev.zone === r.zone) continue;

    const line: Line = {
      sym,
      score: num(r.score),
      was: prev.score,
      price: num(r.price),
      mcap: num(r.mcap) ?? 0,
    };

    if (r.zone === 'sell' && held.has(sym)) {
      // Take profit: a position of yours has run into the sell zone.
      // Never gated by macro — greed is when this matters most.
      sells.push(line);
    } else if (r.zone === 'buy' && !held.has(sym) && r.eligible === true && gate.safe) {
      // Oversold entry: eligible (tradable) and not already held.
      buys.push(line);
    }
  }

  sells.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  buys.sort((a, b) => b.mcap - a.mcap);
  const buyShown = buys.slice(0, MAX_BUY_LINES);

  if (!sells.length && !buys.length) {
    // The point of the redesign: most days say nothing at all.
    return json({
      ok: true, sent: 0, buys: 0, sells: 0,
      reason: gate.safe
        ? 'no zone transitions in the last 24h'
        : `no holdings entered the sell zone; buys suppressed (${gate.reason})`,
      run_id: latestRun.id,
      compared_to: prevRun.id,
    });
  }

  // ── Compose one digest ───────────────────────────────────────
  // One notification, the whole picture at a glance, one thing that can
  // fail instead of N. NOT a rate-limit workaround: Telegram allows about
  // 1 msg/sec to a chat and Supabase does not throttle outbound fetch. A
  // limit would surface as HTTP 429 with retry_after in `errors` below.
  const day = new Date(latestRun.as_of).toISOString().slice(0, 10);
  const lines: string[] = [`📊 <b>Rotator signals</b> — ${day}`];

  if (sells.length) {
    lines.push('', '🔴 <b>TAKE PROFIT</b> — your holding entered the sell zone');
    for (const s of sells) {
      lines.push(`• <b>${s.sym}</b> — ${s.score ?? '?'} (was ${s.was ?? '?'}) · ${fmtPrice(s.price)}`);
    }
  }

  if (buyShown.length) {
    lines.push('', '🟢 <b>OVERSOLD</b> — entered the buy zone');
    for (const b of buyShown) {
      lines.push(`• <b>${b.sym}</b> — ${b.score ?? '?'} (was ${b.was ?? '?'}) · ${fmtPrice(b.price)}`);
    }
    if (buys.length > buyShown.length) {
      lines.push(`<i>+ ${buys.length - buyShown.length} more not shown</i>`);
    }
  }

  if (!gate.safe && sells.length) {
    lines.push('', `<i>Buy signals suppressed: ${gate.reason}</i>`);
  }

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
  let failed = 0;
  const errs: string[] = [];
  for (const c of chunks) {
    const out = await sendTelegram(c);
    if (out.ok) {
      sent++;
    } else {
      failed++;
      if (errs.length < 5) errs.push(out.error);
    }
  }

  return json(
    {
      // `buys`/`sells` count coins, `sent` counts messages — normally 1.
      // Keeping them separate means a quiet day and a delivery failure
      // can never look alike, which is what made the chat-not-found bug
      // invisible for weeks.
      ok: failed === 0,
      sells: sells.length,
      buys: buyShown.length,
      sent,
      failed,
      run_id: latestRun.id,
      compared_to: prevRun.id,
      ...(errs.length ? { errors: errs } : {}),
    },
    // Loud only when nothing got through at all. A partial failure still
    // delivered real alerts, so it stays a 200.
    sent === 0 && failed > 0 ? 500 : 200,
  );
});
