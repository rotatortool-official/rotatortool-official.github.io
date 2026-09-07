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
//      suggest entries when an unheld eligible coin enters the buy zone
//      AND the engine classified it CANDIDATE (engine 2.2.0). Crossing
//      is the event; the class is whether the event is worth sending.
//      This function does not define "too pumped" or "still falling" and
//      must never start — those thresholds live in the engine's
//      CANDIDATE_RULES and reach here as a label.
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
//
// DRY RUN: append ?dry_run=1 to compose the message and return it as
// `preview` without sending it or marking anything as delivered.
//
// ── TECHNICAL EVENTS section (added 2026-09-07) ─────────────
// A second, independent block: golden/death crosses, RSI(14) crossing
// 80/30, and extreme futures positioning. Written by
// detect_coin_events() (sql/create_coin_events.sql) at 00:45 UTC; this
// function only READS coin_events. It never derives an indicator, for
// the same reason it never re-derives the engine's zone thresholds —
// whoever computes a number owns it.
//
// NOT FILTERED BY HOLDINGS, unlike the zone block above. A cross or an
// RSI extreme is a fact about the coin, not about who owns it, and with
// more than one reader a per-user filter would emit contradictory
// reports from identical data. See promptove/24-coin-events.
//
// THE EVENTS ARE FETCHED BEFORE THE SIGNAL RUNS, on purpose. The zone
// block returns early when there is no run to compare against; doing
// that before reading coin_events would mean a fault in
// compute-signal-run silently suppresses technical events too. The two
// blocks fail independently.
//
// DATES ARE ON EVERY BULLET AND THE WORD "today" IS NEVER USED. One
// message can carry crosses confirmed on three different closes, and
// even the freshest is from the previous 00:00 UTC close — roughly 19h
// before this runs. "Today" would be wrong for all of them.
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

// How far back to look for events that have not been delivered yet.
// Matches CROSS_MAX_AGE in detect_coin_events(): three days is that
// function's repair margin for a missed run, so anything older was
// either already sent or never detected.
const EVENT_LOOKBACK_DAYS = 3;

// Per section. Measured on 2026-09-07 the whole universe produced six
// events in a day, so this never binds on a normal day — but a
// market-wide selloff is exactly when dozens cross 30 at once, and that
// is the day the message would otherwise be unreadable. Ranked by
// distance past the threshold, so what survives the cut is the most
// extreme, not the alphabetically luckiest.
const MAX_EVENT_LINES = 10;

// Contrary evidence, generated rather than written by hand so it cannot
// be forgotten on a day it matters: an upward cross on an
// already-stretched RSI (or a downward one on an already-depressed RSI)
// is two readings pointing different ways. promptove/19 requires the
// contradicting evidence to be shown, not just the confirming kind.
const CONFLICT_RSI_HIGH = 75;
const CONFLICT_RSI_LOW  = 35;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface ItemRow {
  coin_sym: string;
  score: number | string | null;
  zone: string | null;
  eligible: boolean | null;
  candidate_class: string | null;
  rsi: number | string | null;
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

interface EventRow {
  base_asset: string;
  event_date: string;                        // the day it HAPPENED
  event_type: string;
  value: number | string | null;
  prev_value: number | string | null;
  detail: Record<string, unknown> | null;
}

interface CtxRow {
  base_asset: string;
  rsi14_daily: number | string | null;
  long_short_ratio: number | string | null;
  cross_state: string | null;
}

// One message can carry BNB's moving average at 624 and SYN's at 0.1376.
// A fixed decimal count prints either noise or nothing, depending which
// coin you picked to tune it on.
const fmtMa = (n: number | null): string => {
  if (n === null) return 'n/a';
  if (n >= 100) return n.toFixed(2);
  if (n >= 1)   return n.toFixed(4);
  return n.toPrecision(4);
};

// NULL is "not computable", never a number. Ten of the 114 tracked coins
// have no futures listing; printing 0 or "balanced" for them would invent
// a measurement that was never taken.
const fmtRatio = (n: number | null): string =>
  n === null ? 'not available' : `${n.toFixed(2)} : 1`;

const fmtRsi = (n: number | null): string =>
  n === null ? 'n/a' : n.toFixed(1);

// "Sep 6". Every bullet carries its own date — see the header note.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDay = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

// Builds the TECHNICAL EVENTS block and reports which events it actually
// rendered. Only those get stamped as notified — an event that lost the
// MAX_EVENT_LINES cut must stay unstamped so it can be reported later,
// rather than being silently dropped.
function buildEventSections(
  events: EventRow[],
  ctx: Map<string, CtxRow>,
): { lines: string[]; shown: EventRow[] } {
  const lines: string[] = [];
  const shown: EventRow[] = [];
  if (!events.length) return { lines, shown };

  const ctxRsi   = (s: string) => num(ctx.get(s)?.rsi14_daily ?? null);
  const ctxLs    = (s: string) => num(ctx.get(s)?.long_short_ratio ?? null);
  const ctxCross = (s: string) => ctx.get(s)?.cross_state ?? 'n/a';

  const crosses = events.filter(e => e.event_type === 'golden_cross' || e.event_type === 'death_cross');
  const rsis    = events.filter(e => e.event_type === 'rsi_overbought' || e.event_type === 'rsi_oversold');
  const futs    = events.filter(e => e.event_type === 'futures_long_crowded' || e.event_type === 'futures_short_crowded');

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━', '📐 <b>TECHNICAL EVENTS</b>');

  if (crosses.length) {
    // No threshold distance to rank by here, so: most recent close first.
    crosses.sort((a, b) =>
      b.event_date.localeCompare(a.event_date) || a.base_asset.localeCompare(b.base_asset));
    const take = crosses.slice(0, MAX_EVENT_LINES);

    lines.push('', '🟡 <b>Moving-average crosses · 60-day vs 125-day</b>');
    // The periods are named because a reader who assumes the classic
    // 50/200 misreads every line in this section.
    lines.push('<i>The 60-day average moved through the 125-day. This describes past price. Note these are 60/125, not the classic 50/200.</i>');

    const conflicts: string[] = [];
    for (const e of take) {
      const up  = e.event_type === 'golden_cross';
      const d   = e.detail ?? {};
      const rsi = ctxRsi(e.base_asset);
      lines.push(`• <b>${e.base_asset}</b> — 60d moved ${up ? 'above' : 'below'} 125d · ${fmtDay(e.event_date)}`);
      lines.push(`  ${fmtMa(num(d.ma_fast as number | string | null))} vs ${fmtMa(num(d.ma_slow as number | string | null))} · RSI(14) ${fmtRsi(rsi)} · L/S ${fmtRatio(ctxLs(e.base_asset))}`);
      shown.push(e);
      if (rsi !== null && ((up && rsi >= CONFLICT_RSI_HIGH) || (!up && rsi <= CONFLICT_RSI_LOW))) {
        conflicts.push(`${e.base_asset}'s RSI(14) is ${fmtRsi(rsi)} alongside ${up ? 'an upward' : 'a downward'} cross`);
      }
    }
    if (crosses.length > take.length) lines.push(`<i>+ ${crosses.length - take.length} more not shown</i>`);
    if (conflicts.length) lines.push('', `⚠ <i>Readings pointing different ways: ${conflicts.join('; ')}.</i>`);
  }

  if (rsis.length) {
    const dist = (e: EventRow) => {
      const v = num(e.value);
      if (v === null) return 0;
      return e.event_type === 'rsi_overbought' ? v - 80 : 30 - v;
    };
    rsis.sort((a, b) => dist(b) - dist(a));
    const take = rsis.slice(0, MAX_EVENT_LINES);

    lines.push('', '🔵 <b>RSI(14) daily</b>');
    lines.push('<i>RSI compares recent gains with recent losses on a 0–100 scale. Readings above 80 and below 30 are uncommon, not outcomes.</i>');
    for (const e of take) {
      const above = e.event_type === 'rsi_overbought';
      lines.push(`• <b>${e.base_asset}</b> — moved ${above ? 'above 80' : 'below 30'} · ${fmtRsi(num(e.value))}, from ${fmtRsi(num(e.prev_value))} the day before · ${fmtDay(e.event_date)}`);
      lines.push(`  60d/125d: ${ctxCross(e.base_asset)} · L/S ${fmtRatio(ctxLs(e.base_asset))}`);
      shown.push(e);
    }
    if (rsis.length > take.length) lines.push(`<i>+ ${rsis.length - take.length} more not shown</i>`);
  }

  if (futs.length) {
    const dist = (e: EventRow) => {
      const v = num(e.value);
      if (v === null) return 0;
      return e.event_type === 'futures_long_crowded' ? v - 3 : (1 / 3) - v;
    };
    futs.sort((a, b) => dist(b) - dist(a));
    const take = futs.slice(0, MAX_EVENT_LINES);

    lines.push('', '🟣 <b>Futures positioning · Binance accounts</b>');
    lines.push('<i>The share of accounts holding each side. It describes how traders are positioned, not what price does next.</i>');
    for (const e of take) {
      lines.push(`• <b>${e.base_asset}</b> — long/short account ratio reached ${fmtRatio(num(e.value))}, from ${fmtRatio(num(e.prev_value))} · ${fmtDay(e.event_date)}`);
      lines.push(`  RSI(14) ${fmtRsi(ctxRsi(e.base_asset))} · 60d/125d: ${ctxCross(e.base_asset)}`);
      shown.push(e);
    }
    if (futs.length > take.length) lines.push(`<i>+ ${futs.length - take.length} more not shown</i>`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  return { lines, shown };
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

  // ?dry_run=1 — compose everything, send nothing, stamp nothing.
  // Exists so the exact message can be reviewed before it reaches a chat,
  // and so a copy change can be tested without spending a real
  // notification. Deliberately does NOT require the Telegram config: a
  // dry run has nothing to authenticate against.
  const dryRun = new URL(req.url).searchParams.get('dry_run') === '1';

  // Fail fast and legibly on missing config, rather than letting every
  // single send fail one at a time against the Telegram API.
  if (!dryRun && (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)) {
    return json({ ok: false, sent: 0, reason: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' }, 500);
  }

  // ── Technical events ─────────────────────────────────────────
  // Read FIRST, before any signal_runs query. The zone block below bails
  // out when it has no run to compare against, and doing this after it
  // would let a fault in compute-signal-run silently suppress technical
  // events as well. The two blocks are independent and fail that way.
  const evSince = new Date(Date.now() - EVENT_LOOKBACK_DAYS * 864e5)
    .toISOString().slice(0, 10);
  const { data: evRows, error: evErr } = await supabase
    .from('coin_events')
    .select('base_asset, event_date, event_type, value, prev_value, detail')
    .is('notified_at', null)
    .gte('event_date', evSince);
  if (evErr) return json({ ok: false, reason: evErr.message }, 500);
  const events = (evRows ?? []) as EventRow[];

  // Context readings, so a bullet can show supporting and contrary
  // evidence together instead of one number in isolation.
  const ctx = new Map<string, CtxRow>();
  if (events.length) {
    const { data: snapDay } = await supabase
      .from('coin_indicator_daily').select('as_of_date')
      .order('as_of_date', { ascending: false }).limit(1).maybeSingle();
    if (snapDay) {
      const { data: ctxRows } = await supabase
        .from('coin_indicator_daily')
        .select('base_asset, rsi14_daily, long_short_ratio, cross_state')
        .eq('as_of_date', snapDay.as_of_date);
      for (const r of (ctxRows ?? []) as CtxRow[]) ctx.set(r.base_asset, r);
    }
  }
  const { lines: eventLines, shown: shownEvents } = buildEventSections(events, ctx);

  // ── The two runs being compared ──────────────────────────────
  const { data: latestRun, error: lrErr } = await supabase
    .from('signal_runs').select('id, as_of')
    .order('as_of', { ascending: false }).limit(1).maybeSingle();

  if (lrErr) return json({ ok: false, reason: lrErr.message }, 500);

  let prevRun: { id: string; as_of: string } | null = null;
  let zoneSkipped = '';

  if (!latestRun) {
    zoneSkipped = 'no signal_runs yet';
  } else {
    const cutoff = new Date(new Date(latestRun.as_of).getTime() - LOOKBACK_HOURS * 3600000);
    const { data: pr, error: prErr } = await supabase
      .from('signal_runs').select('id, as_of')
      .lte('as_of', cutoff.toISOString())
      .order('as_of', { ascending: false }).limit(1).maybeSingle();
    if (prErr) return json({ ok: false, reason: prErr.message }, 500);
    prevRun = pr;
    // Without a baseline every coin looks like it "just entered" its zone,
    // which on a fresh database means a 90-coin message. Stay silent until
    // there is real history to compare against.
    if (!prevRun) zoneSkipped = `no run older than ${LOOKBACK_HOURS}h to compare against yet`;
  }

  interface Line {
    sym: string;
    score: number | null;
    was: number | null;
    price: number | null;
    mcap: number;
    rsi?: number | null;
  }
  const sells: Line[] = [];
  const buys: Line[] = [];
  // Buy-zone crossings the classification held back. Reported in the
  // response, not the message — the digest says less, the logs say why.
  const withheld: { sym: string; why: string }[] = [];
  let gate = { safe: true, reason: 'clear' };

  if (latestRun && prevRun) {
    const cols = 'coin_sym, score, zone, eligible, price, mcap, candidate_class, rsi';
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

    gate = await getMacroGate();

    // ── Classify transitions ───────────────────────────────────
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
        //
        // CANDIDATE is the engine's answer to "may this be presented as
        // a new entry" (engine 2.2.0). Crossing into the buy zone is the
        // event; being a candidate is whether the event is worth sending.
        // This function does not decide what "too pumped" or "still
        // falling" means and must never start — it reads the label the
        // same run gave the website and the bot.
        //
        // A run older than 2.2.0 has candidate_class = null on every row.
        // Treated as "not classified, send as before" rather than as
        // "not a candidate", so a stale run degrades to the previous
        // behaviour instead of silently sending nothing.
        if (r.candidate_class === null || r.candidate_class === 'CANDIDATE') {
          line.rsi = num(r.rsi);
          buys.push(line);
        } else {
          withheld.push({ sym, why: r.candidate_class });
        }
      }
    }

    sells.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    buys.sort((a, b) => b.mcap - a.mcap);
  }

  const buyShown = buys.slice(0, MAX_BUY_LINES);

  if (!sells.length && !buys.length && !shownEvents.length) {
    // The point of the redesign: most days say nothing at all.
    return json({
      ok: true, sent: 0, buys: 0, sells: 0, events: 0,
      reason: zoneSkipped ||
        (gate.safe
          ? 'no zone transitions in the last 24h and no undelivered technical events'
          : `no holdings entered the sell zone; buys suppressed (${gate.reason}); no undelivered technical events`),
      run_id: latestRun?.id ?? null,
      compared_to: prevRun?.id ?? null,
      ...(withheld.length ? { withheld } : {}),
    });
  }

  // ── Compose one digest ───────────────────────────────────────
  // One notification, the whole picture at a glance, one thing that can
  // fail instead of N. NOT a rate-limit workaround: Telegram allows about
  // 1 msg/sec to a chat and Supabase does not throttle outbound fetch. A
  // limit would surface as HTTP 429 with retry_after in `errors` below.
  // Falls back to today when there is no run: the technical-events block
  // can carry a message on its own, and a header reading "Invalid Date"
  // would be the only visible symptom.
  const day = latestRun
    ? new Date(latestRun.as_of).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const lines: string[] = [`📊 <b>Rotator — what changed</b> — ${day}`];

  if (sells.length) {
    lines.push('', '🔴 <b>RELATIVE STRENGTH</b> — a holding of yours crossed into the top of the tracked range');
    for (const s of sells) {
      lines.push(`• <b>${s.sym}</b> — ${s.score ?? '?'} (was ${s.was ?? '?'}) · ${fmtPrice(s.price)}`);
    }
  }

  if (buyShown.length) {
    lines.push('', '🟢 <b>RELATIVE WEAKNESS</b> — crossed into the bottom of the tracked range');
    for (const b of buyShown) {
      lines.push(`• <b>${b.sym}</b> — ${b.score ?? '?'} (was ${b.was ?? '?'}) · ${fmtPrice(b.price)}`);
    }
    if (buys.length > buyShown.length) {
      lines.push(`<i>+ ${buys.length - buyShown.length} more not shown</i>`);
    }
  }

  if (!gate.safe && sells.length) {
    lines.push('', `<i>Relative-weakness lines suppressed: ${gate.reason}</i>`);
  }

  // Technical events sit after the zone blocks: the zone lines answer
  // "what moved in the rankings", these answer "what crossed a technical
  // threshold". Related, but not the same question, so they stay in
  // separate blocks rather than being interleaved.
  if (eventLines.length) lines.push(...eventLines);

  if (zoneSkipped && shownEvents.length) {
    // Say why half the message is missing rather than letting a silent
    // omission look like a quiet day in the rankings.
    lines.push('', `<i>Ranking changes unavailable: ${zoneSkipped}.</i>`);
  }

  // Every alert ends by pointing back at the evidence rather than at an
  // action. See promptove/19-research-first-language-2026-09-06.md: the job
  // of a notification is to bring someone to the breakdown, not to trade for
  // them.
  lines.push('', '<a href="https://rotatortool-official.github.io/">Explore the full breakdown on Rotator.</a>');
  lines.push('<i>Informational research tool · not financial advice · DYOR</i>');

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

  // Stop here on a dry run: nothing sent, nothing stamped, so the same
  // events are still pending for the real run.
  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      sells: sells.length,
      buys: buyShown.length,
      events: shownEvents.length,
      chunks: chunks.length,
      chars: chunks.reduce((n, c) => n + c.length, 0),
      preview: chunks,
      ...(zoneSkipped ? { zone_skipped: zoneSkipped } : {}),
    });
  }

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

  // ── Mark events as delivered ─────────────────────────────────
  // Only what was actually rendered, and only when EVERY chunk landed.
  // The asymmetry is deliberate: an unstamped event is reported again on
  // a later run — and reads correctly, because its own date is on the
  // bullet — whereas an event stamped after a failed send is gone
  // silently. Under-notifying is the recoverable error.
  //
  // A loop rather than one statement because the primary key is
  // composite and PostgREST has no clean composite IN. At the measured
  // volume (six events on a busy day) that is a handful of updates.
  let stamped = 0;
  if (failed === 0 && shownEvents.length) {
    const at = new Date().toISOString();
    for (const e of shownEvents) {
      const { error } = await supabase
        .from('coin_events')
        .update({ notified_at: at })
        .eq('base_asset', e.base_asset)
        .eq('event_date', e.event_date)
        .eq('event_type', e.event_type);
      if (!error) stamped++;
    }
  }

  return json(
    {
      // `buys`/`sells`/`events` count coins, `sent` counts messages —
      // normally 1. Keeping them separate means a quiet day and a
      // delivery failure can never look alike, which is what made the
      // chat-not-found bug invisible for weeks.
      ok: failed === 0,
      sells: sells.length,
      buys: buyShown.length,
      events: shownEvents.length,
      // Should equal `events` after a clean send. A gap means some rows
      // will be re-reported next run — visible here rather than silent.
      events_stamped: stamped,
      sent,
      failed,
      run_id: latestRun?.id ?? null,
      compared_to: prevRun?.id ?? null,
      ...(zoneSkipped ? { zone_skipped: zoneSkipped } : {}),
      // Buy-zone crossings the engine's classification held back, with
      // the class that held each one. Not in the message — in the
      // response, so a quiet digest can be told apart from a broken one.
      ...(withheld.length ? { withheld } : {}),
      ...(errs.length ? { errors: errs } : {}),
    },
    // Loud only when nothing got through at all. A partial failure still
    // delivered real alerts, so it stays a 200.
    sent === 0 && failed > 0 ? 500 : 200,
  );
});
