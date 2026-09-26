// ============================================================
// sync-etf-flows — Supabase Edge Function
//
// Daily US spot Bitcoin and Ether ETF net flows from Farside Investors,
// stored, and interpreted ONCE here so the website, the Telegram
// briefing and the reversal alert all say the same thing (promptove/68).
//
// SOURCE AND ATTRIBUTION. farside.co.uk/bitcoin-etf-flow-all-data/ and
// /ethereum-etf-flow-all-data/: the only free daily source, no API.
// The page says "All rights reserved"; Daniel chose to use it with
// attribution (2026-09-26). Everything shown carries "Source: Farside
// Investors" and a link back. Only DERIVED figures are published (daily
// totals, sums, a headline); the per-fund table stays on Farside.
// Verified 2026-09-26: a request from this edge runtime gets the full
// page, with no Cloudflare challenge (a temporary probe, since deleted).
//
// WHAT THE NUMBERS CAN SAY (rotator-backtest/etf-flow-test.js,
// pre-registered, 695 days): flows mostly FOLLOW price (5-day flow vs
// BTC's previous week: correlation 0.64). Strong inflows did not lead
// BTC higher. Strong outflows came before further BTC weakness in both
// halves of the history, but not strongly enough to pass. So every
// message here describes money that already moved. None forecasts.
//
// INTERPRETATION, one state per asset, first match wins. "Unusual" is
// measured against the trailing 252 complete trading days of THAT asset,
// so the thresholds move with the market instead of being typed in.
//   1 reversal   the day's sign is opposite to the previous 5 days' sum
//                AND the day is in its 10% tail  (Daniel's example: a
//                week of buying, then a $400M+ selling day)
//   2 extreme    the day is in its 5% tail
//   3 turned     the 5-day sum changed sign
//   4 slowing    a streak of 3+ days, each smaller than the one before
//   5 accel      a streak of 3+ days, each bigger than the one before
//   6 streak     5+ days in the same direction
//   7 stalled    the last 3 days all within ±$20M
//   8 mixed      none of the above
//
// PROVISIONAL DAYS. Farside fills a day fund by fund, showing "-" for a
// fund not yet reported (and, on old rows, for a fund not yet launched).
// The newest day is incomplete if a fund that reported the day before
// shows "-"; it is stored but kept OUT of the interpretation, so a
// half-reported day can never produce a false "sharp reversal".
//
// ALERT. A fresh reversal (state 1) on the latest complete day sends one
// Telegram message to TELEGRAM_CHAT_ID, remembered in the summary so it
// is sent once. Nothing else alerts; the rest waits for the briefing.
//
// FAILS CLOSED, PER ASSET. Too few parsed rows, or no table, means
// nothing is written for that asset and its previous summary is kept
// (marked with the error): a changed page must not overwrite good data,
// and a broken ETH page must not take the BTC reading down with it.
//
// SCHEDULE: 02:17 and 07:17 UTC daily (sql/etf_flows.sql).
// Farside posts after the US close; the second run catches late funds.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;          // the token trigger_sync_etf_flows() sends
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SOURCES: Record<string, { url: string; minRows: number }> = {
  BTC: { url: 'https://farside.co.uk/bitcoin-etf-flow-all-data/', minRows: 400 },
  ETH: { url: 'https://farside.co.uk/ethereum-etf-flow-all-data/', minRows: 250 },
};
const REF_DAYS = 252;
const MIN_REF = 60;
const STALL_M = 20;
const MON: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

type Day = { day: string; total: number; complete: boolean; funds: Record<string, number | null> };

function parse(html: string): Day[] {
  const tbl = (html.match(/<table[^>]*class="etf"[\s\S]*?<\/table>/) || [])[0];
  if (!tbl) throw new Error('no etf table on the page');
  const cellsOf = (tr: string) => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
  const rows = tbl.match(/<tr[\s\S]*?<\/tr>/g) || [];
  // The ticker row: the first row whose cells after the first are short upper-case codes.
  let tickers: string[] = [];
  for (const tr of rows) {
    const c = cellsOf(tr);
    if (c.length > 3 && c.slice(1, -1).every((x) => /^[A-Z]{2,6}$/.test(x))) { tickers = c.slice(1, -1); break; }
  }
  const num = (s: string): number | null => {
    if (!s || s === '-') return null;
    const n = Number(s.replace(/[(),]/g, ''));
    return Number.isFinite(n) ? (/^\(.*\)$/.test(s) ? -n : n) : null;
  };
  const out: Day[] = [];
  for (const tr of rows) {
    const c = cellsOf(tr);
    const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(c[0] || '');
    if (!m || !(m[2] in MON)) continue;
    const total = num(c[c.length - 1]);
    if (total === null) continue;
    const fundCells = c.slice(1, -1);
    const funds: Record<string, number | null> = {};
    fundCells.forEach((v, i) => { funds[tickers[i] || 'F' + i] = num(v); });
    const day = new Date(Date.UTC(+m[3], MON[m[2]], +m[1])).toISOString().slice(0, 10);
    out.push({ day, total, complete: true, funds });
  }
  out.sort((a, b) => (a.day < b.day ? -1 : 1));
  // "-" also marks a fund that did not exist yet, so only the NEWEST day
  // can be provisional: a fund that reported the day before but shows "-"
  // today has not reported today yet.
  const last = out[out.length - 1], before = out[out.length - 2];
  if (last && before) {
    last.complete = !Object.keys(before.funds).some((k) => before.funds[k] !== null && last.funds[k] === null);
  }
  return out;
}

const fmt = (v: number) => {
  const a = Math.abs(v);
  return (v < 0 ? '−' : '+') + (a >= 1000 ? '$' + (a / 1000).toFixed(2) + 'B' : '$' + Math.round(a) + 'M');
};
const fmtAbs = (v: number) => fmt(Math.abs(v)).slice(1);
const nice = (d: string) => { const t = new Date(d + 'T00:00:00Z'); return t.getUTCDate() + ' ' + Object.keys(MON)[t.getUTCMonth()]; };
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const q = (arr: number[], p: number) => { const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const sum = (a: Day[]) => a.reduce((s, x) => s + x.total, 0);
const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

function isReversal(days: Day[], i: number): boolean {
  if (i < 5) return false;
  const ref = days.slice(Math.max(0, i - REF_DAYS), i).map((d) => d.total);
  if (ref.length < MIN_REF) return false;
  const v = days[i].total, prev5 = sum(days.slice(i - 5, i));
  return sign(v) !== 0 && sign(prev5) !== 0 && sign(v) !== sign(prev5) && (v <= q(ref, 0.10) || v >= q(ref, 0.90));
}

function interpret(asset: string, all: Day[]) {
  const days = all.filter((d) => d.complete);
  const provisional = all.length && !all[all.length - 1].complete ? all[all.length - 1] : null;
  const n = days.length, last = days[n - 1];
  const ref = days.slice(Math.max(0, n - 1 - REF_DAYS), n - 1).map((d) => d.total);
  const p = { p5: q(ref, 0.05), p10: q(ref, 0.10), p90: q(ref, 0.90), p95: q(ref, 0.95) };
  const s5 = sum(days.slice(n - 5)), prev5 = sum(days.slice(n - 6, n - 1)), s5prev = prev5;
  const s20 = sum(days.slice(n - 20));
  let len = 0; const dir = sign(last.total);
  for (let i = n - 1; i >= 0 && dir !== 0 && sign(days[i].total) === dir; i--) len++;
  const l3 = days.slice(n - 3).map((d) => Math.abs(d.total));
  const word = dir > 0 ? 'inflows' : 'outflows';

  let state = 'mixed', headline = '', detail = '', tone = 'neutral';
  const reversalsSince = (() => {
    let inN = 0, outN = 0;
    for (let i = 0; i < n; i++) if (isReversal(days, i)) { if (days[i].total < 0) outN++; else inN++; }
    return { in: inN, out: outN, since: days[0].day.slice(0, 4) };
  })();

  if (isReversal(days, n - 1)) {
    state = dir < 0 ? 'reversal_out' : 'reversal_in';
    const cnt = dir < 0 ? reversalsSince.out : reversalsSince.in;
    headline = dir < 0 ? `Sharp reversal: ${fmtAbs(last.total)} of outflows in one day` : `Sharp reversal: ${fmtAbs(last.total)} of inflows in one day`;
    detail = `On ${nice(last.day)}, after ${fmtAbs(prev5)} ${prev5 > 0 ? 'came in' : 'left'} over the previous 5 days. `
      + `One of the 10% biggest ${dir < 0 ? 'outflow' : 'inflow'} days of the past year. Days like this since ${reversalsSince.since}: ${cnt}, this one included.`;
    tone = dir < 0 ? 'out' : 'in';
  } else if (last.total <= p.p5 || last.total >= p.p95) {
    state = last.total < 0 ? 'extreme_out' : 'extreme_in';
    headline = `One of the biggest ${last.total < 0 ? 'outflow' : 'inflow'} days of the year: ${fmt(last.total)}`;
    detail = `On ${nice(last.day)}. Only 5% of the past year's days were ${last.total < 0 ? 'bigger outflows' : 'bigger inflows'}.`;
    tone = last.total < 0 ? 'out' : 'in';
  } else if (sign(s5) !== 0 && sign(s5prev) !== 0 && sign(s5) !== sign(s5prev)) {
    state = s5 > 0 ? 'turned_in' : 'turned_out';
    headline = `Flows turned to net ${s5 > 0 ? 'inflow' : 'outflow'}`;
    detail = `${fmt(s5)} over the last 5 trading days, after ${fmt(s5prev)} over the 5 before.`;
    tone = s5 > 0 ? 'in' : 'out';
  } else if (len >= 3 && l3[2] < l3[1] && l3[1] < l3[0]) {
    state = dir > 0 ? 'slowing_in' : 'slowing_out';
    const streak = days.slice(n - len);
    const peak = streak.reduce((a, b) => (Math.abs(b.total) > Math.abs(a.total) ? b : a));
    headline = dir > 0 ? 'Inflows continuing, but slowing' : 'Outflows continuing, but easing';
    detail = `${ord(len)} straight day of ${word}, each of the last 3 smaller: ${fmtAbs(peak.total)} on ${nice(peak.day)} down to ${fmtAbs(last.total)} on ${nice(last.day)}.`;
    tone = 'warn';
  } else if (len >= 3 && l3[2] > l3[1] && l3[1] > l3[0]) {
    state = dir > 0 ? 'accel_in' : 'accel_out';
    headline = dir > 0 ? 'Inflows accelerating' : 'Outflows accelerating';
    detail = `${ord(len)} straight day of ${word}, each of the last 3 bigger, up to ${fmtAbs(last.total)} on ${nice(last.day)}.`;
    tone = dir > 0 ? 'in' : 'out';
  } else if (len >= 5) {
    state = dir > 0 ? 'streak_in' : 'streak_out';
    headline = `${ord(len)} straight day of ${word}`;
    detail = `${fmt(sum(days.slice(n - len)))} over the streak. ${fmt(last.total)} on ${nice(last.day)}.`;
    tone = dir > 0 ? 'in' : 'out';
  } else if (days.slice(n - 3).every((d) => Math.abs(d.total) <= STALL_M)) {
    state = 'stalled';
    headline = 'ETF flows have stalled';
    detail = `Under $${STALL_M}M either way on each of the last 3 trading days.`;
  } else {
    state = 'mixed';
    headline = 'Mixed flows';
    detail = `${fmt(s5)} over the last 5 trading days, with no clear direction day to day. ${fmt(last.total)} on ${nice(last.day)}.`;
  }

  return {
    asset, state, headline, detail, tone,
    last: { day: last.day, total: last.total },
    provisional: provisional ? { day: provisional.day, total: provisional.total } : null,
    sum5: s5, sum20: s20, streak: { dir, len },
    bars: days.slice(n - 20).map((d) => ({ day: d.day, total: d.total })),
    ref: { ...p, days: ref.length },
    reversals: reversalsSince,
    firstDay: days[0].day,
  };
}

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false, error: 'telegram not configured' };
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return { ok: r.ok, error: r.ok ? null : `HTTP ${r.status}` };
}

Deno.serve(async (req: Request) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!SYNC_SECRET || token !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const { data: prevRow } = await supabase.from('market_cache').select('data').eq('cache_key', 'etf_flows_summary').maybeSingle();
    const prev = (prevRow?.data || {}) as Record<string, any>;
    const alerted: Record<string, string> = { ...(prev.alerted || {}) };
    const summary: Record<string, any> = { source: 'Farside Investors', sourceUrl: 'https://farside.co.uk/', updated_at: new Date().toISOString(), alerted };
    const report: Record<string, unknown> = {};

    for (const [asset, src] of Object.entries(SOURCES)) {
     try {
      const r = await fetch(src.url, { headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-GB,en;q=0.9' } });
      if (!r.ok) throw new Error(`${asset}: HTTP ${r.status}`);
      const days = parse(await r.text());
      if (days.length < src.minRows) throw new Error(`${asset}: only ${days.length} rows parsed (floor ${src.minRows}) — not overwriting`);

      for (let i = 0; i < days.length; i += 500) {
        const { error } = await supabase.from('etf_flows').upsert(
          days.slice(i, i + 500).map((d) => ({ asset, day: d.day, total: d.total, funds: d.funds, complete: d.complete, fetched_at: new Date().toISOString() })),
          { onConflict: 'asset,day' });
        if (error) throw new Error(`${asset}: upsert failed: ${error.message}`);
      }
      const s = interpret(asset, days);
      summary[asset] = s;
      report[asset] = { rows: days.length, state: s.state, headline: s.headline, last: s.last, provisional: s.provisional };

      // Alert once, only for a fresh sharp reversal on a recent day.
      const recent = (Date.now() - Date.parse(s.last.day + 'T00:00:00Z')) < 4 * 86400000;
      if ((s.state === 'reversal_out' || s.state === 'reversal_in') && recent && alerted[asset] !== s.last.day) {
        const name = asset === 'BTC' ? 'Bitcoin' : 'Ether';
        const text = `🔄 <b>${name} ETFs: ${s.headline.replace('Sharp reversal: ', 'sharp reversal, ')}</b>\n`
          + `${s.detail}\n\n<i>Source: Farside Investors. ETF flows mostly follow price; this describes money that already moved, not what comes next.</i>`;
        const sent = await sendTelegram(text);
        report[asset + '_alert'] = sent;
        if (sent.ok) alerted[asset] = s.last.day;
      }
     } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[sync-etf-flows]', asset, msg);
      if (prev[asset]) summary[asset] = { ...prev[asset], error: msg };
      report[asset] = { ok: false, error: msg };
     }
    }

    const { error } = await supabase.from('market_cache').upsert(
      { cache_key: 'etf_flows_summary', data: summary, updated_at: new Date().toISOString() }, { onConflict: 'cache_key' });
    if (error) throw new Error('summary write failed: ' + error.message);
    const ok = Object.keys(SOURCES).every((a) => !(report[a] as any)?.error);
    return new Response(JSON.stringify({ ok, ...report }, null, 1), { status: ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sync-etf-flows]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
