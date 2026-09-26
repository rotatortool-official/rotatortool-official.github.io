// ============================================================
// send-dm-alerts — Supabase Edge Function (promptove/71, /73)
//
// Hourly (:50, sql/telegram_dm_alerts.sql). For every linked Pro chat in
// telegram_subscribers, works out what is new on its coins and sends ONE
// direct message with all of it. Each alert is sent once per subscriber
// (telegram_subscribers.sent), so a quiet hour sends nothing.
//
// WHAT IS SENT, all from tables the server already keeps:
//   exchange   binance_delisted_symbols / binance_monitoring_symbols
//   unlock     token_unlocks: more than 5% of supply within 30 days
//              (the engine's UNLOCK_PENDING_PCT line)
//   events     coin_events from the daily detector (00:45 UTC), last 3
//              days: RSI bounces, golden and death crosses, RSI extremes,
//              crowded futures
//   etf        market_cache.etf_flows_summary: a sharp reversal, an
//              extreme day or a turn, for BTC and ETH holders
// The site's in-page alerts also show intraday futures readings (taker
// flow, short covering). Those flip within hours, so they are not DMed.
//
// LANGUAGE (promptove/73). Each message is written in the subscriber's
// site language (telegram_subscribers.lang, kept current by the site
// through alert_set_coins). Alert keys carry no words, so a change of
// language never re-sends an alert. The Macedonian follows the glossary
// in copy/glossary-mk.md; ETF headlines come from the server's own
// headline_mk.
//
// Wording follows the coin window. Tested signs say "tested: weak, not
// proven"; the figures stay on the site (ROTATOR_EVIDENCE, one owner),
// and every message says it is a reading, not a forecast.
//
// Pro is checked on every run: a chat whose browser is no longer Pro
// gets nothing. A chat that blocked the bot (HTTP 403) is switched off.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;
const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const SITE = 'https://rotatortool-official.github.io/';
const UNLOCK_LINE = 5;          // mirrors RotatorEngine.UNLOCK_PENDING_PCT
const EVENT_DAYS = 3;
const SENT_KEEP_DAYS = 90;
const MON: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  mk: ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'],
};

type Lang = 'en' | 'mk';
const he = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nice = (d: string, L: Lang) => { const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); return isNaN(+t) ? '' : t.getUTCDate() + ' ' + MON[L][t.getUTCMonth()]; };
const fmtM = (v: number) => { const a = Math.abs(v); return (v < 0 ? '−' : '+') + (a >= 1000 ? '$' + (a / 1000).toFixed(2) + 'B' : '$' + Math.round(a) + 'M'); };

/* Every sentence the message can contain, in both languages. */
const W = {
  en: {
    held: 'held', watching: 'watching',
    delist: 'Binance delisting announced', notListed: 'Not listed on Binance', notTrading: 'Not trading on Binance',
    checkBinance: "Check Binance's announcement for dates.",
    monitoring: 'Binance Monitoring tag. Binance reviews tagged coins for possible delisting.',
    unlock: (p: string, when: string) => `${p}% of supply unlocks within 30 days${when ? `, next on ${when}` : ''}.`,
    etf: (h: string, v: string, d: string, s5: string) => `ETF flows, <b>${h}</b>. ${v} on ${d}, ${s5} over 5 days. <i>Source: Farside Investors.</i>`,
    header: '🔔 <b>Rotator · alerts for your coins</b>',
    more: (n: number) => `<i>…and ${n} more on the site.</i>`,
    footer: `<i>A reading of what already happened, not a forecast.</i> <a href="${SITE}">Open Rotator</a> for each coin's full window. /stop turns these off.`,
    tested: 'tested: weak, not proven',
    ev: {
      quick: 'Quick RSI bounce', slow: 'Slow RSI bounce', back: 'RSI back above 30',
      backAfter: (nb: string) => `RSI back above 30 after ${nb} below`,
      slowDetail: (nb: string) => `RSI back above 30 only after ${nb} below; slow bounces mostly trailed the market`,
      days: (n: number, floor: boolean) => `${n}${floor ? '+' : ''} day${n === 1 ? '' : 's'}`,
      golden: 'Golden cross', goldenD: '60-day average crossed above the 125-day',
      death: 'Death cross', deathD: '60-day average crossed below the 125-day', deathN: 'tested: it was not a warning',
      ob: 'Overbought', os: 'Oversold', rsi: (v: string) => `Daily RSI ${v}`, obNone: 'Daily RSI above 70', osNone: 'Daily RSI below 30',
      osN: 'oversold alone has not beaten the market',
      longs: 'Crowded longs', longsD: 'Futures traders lean heavily long. Crowded trades can unwind fast',
      shorts: 'Crowded shorts', shortsD: 'Futures traders lean heavily short. This is the setup a short squeeze needs',
    },
  },
  mk: {
    held: 'држите', watching: 'следите',
    delist: 'Binance најави отстранување од листата', notListed: 'Не е листана на Binance', notTrading: 'Не се тргува на Binance',
    checkBinance: 'Проверете ја објавата на Binance за датумите.',
    monitoring: 'Ознака Monitoring на Binance. Binance ги разгледува означените монети за можно отстранување од листата.',
    unlock: (p: string, when: string) => `${p}% од понудата се отклучува во рок од 30 дена${when ? `, следно на ${when}` : ''}.`,
    etf: (h: string, v: string, d: string, s5: string) => `Текови во ETF-овите, <b>${h}</b>. ${v} на ${d}, ${s5} за 5 дена. <i>Извор: Farside Investors.</i>`,
    header: '🔔 <b>Rotator · известувања за вашите монети</b>',
    more: (n: number) => `<i>…и уште ${n} на страницата.</i>`,
    footer: `<i>Опис на она што веќе се случи, не прогноза.</i> <a href="${SITE}">Отворете го Rotator</a> за целиот прозорец на секоја монета. /stop ги исклучува.`,
    tested: 'тестирано: слабо, не е докажано',
    ev: {
      quick: 'Брз RSI отскок', slow: 'Бавен RSI отскок', back: 'RSI повторно над 30',
      backAfter: (nb: string) => `RSI повторно над 30 по ${nb} под таа граница`,
      slowDetail: (nb: string) => `RSI повторно над 30 дури по ${nb} под таа граница; бавните отскоци главно заостануваа зад пазарот`,
      days: (n: number, floor: boolean) => `${n}${floor ? '+' : ''} ${n === 1 ? 'ден' : 'дена'}`,
      golden: 'Златен крст', goldenD: '60-дневниот просек мина над 125-дневниот',
      death: 'Крст на смртта', deathD: '60-дневниот просек падна под 125-дневниот', deathN: 'тестирано: не беше предупредување',
      ob: 'Прекупена', os: 'Препродадена', rsi: (v: string) => `Дневен RSI ${v}`, obNone: 'Дневен RSI над 70', osNone: 'Дневен RSI под 30',
      osN: 'самата препродаденост не го победи пазарот',
      longs: 'Преполни лонг позиции', longsD: 'Трговците со фјучерси силно се наклонети кон лонг. Преполните позиции може брзо да се одмотаат',
      shorts: 'Преполни шорт позиции', shortsD: 'Трговците со фјучерси силно се наклонети кон шорт. Тоа е условот што му треба на шорт-стискање',
    },
  },
};

type Alert = { key: string; sym: string; sev: number; line: string };

/* One event row in the coin window's words. null = not worth a DM. */
function eventLine(e: any, L: Lang): { icon: string; title: string; detail: string; note: string } | null {
  const d = e.detail || {}, w = W[L].ev, tested = W[L].tested;
  const v = e.value != null ? Number(e.value) : null;
  switch (e.event_type) {
    case 'rsi_reclaim': {
      const nb = d.days_below != null ? Number(d.days_below) : null;
      const nbTxt = nb == null ? '' : w.days(nb, !!d.days_below_is_floor);
      if (d.fast) return { icon: '▲', title: w.quick, detail: nbTxt ? w.backAfter(nbTxt) : w.back, note: tested };
      if ((nb != null && nb >= 6) || d.days_below_is_floor) return { icon: '▼', title: w.slow, detail: w.slowDetail(nbTxt), note: '' };
      return { icon: '•', title: w.back, detail: nbTxt ? w.backAfter(nbTxt) : '', note: '' };
    }
    case 'golden_cross': return { icon: '▲', title: w.golden, detail: w.goldenD, note: tested };
    case 'death_cross': return { icon: '•', title: w.death, detail: w.deathD, note: w.deathN };
    case 'rsi_overbought': return { icon: '▼', title: w.ob, detail: v != null ? w.rsi(v.toFixed(1)) : w.obNone, note: '' };
    case 'rsi_oversold': return { icon: '•', title: w.os, detail: v != null ? w.rsi(v.toFixed(1)) : w.osNone, note: w.osN };
    case 'futures_long_crowded': return { icon: '▼', title: w.longs, detail: w.longsD, note: '' };
    case 'futures_short_crowded': return { icon: '▲', title: w.shorts, detail: w.shortsD, note: '' };
    default: return null;
  }
}

async function send(chat_id: number, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return r.status;
}

Deno.serve(async (req: Request) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!SYNC_SECRET || token !== SYNC_SECRET) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!BOT) return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not set' }), { status: 500 });
  const report = { subscribers: 0, notPro: 0, sent: 0, quiet: 0, blocked: 0, failed: 0 };
  try {
    const { data: subs, error } = await supabase.from('telegram_subscribers').select('rot_uid,chat_id,coins,sent,lang').eq('active', true);
    if (error) throw new Error(error.message);
    report.subscribers = (subs || []).length;
    if (!report.subscribers) return new Response(JSON.stringify({ ok: true, ...report }));

    const uids = subs!.map((s: any) => s.rot_uid);
    const { data: pros } = await supabase.from('pro_users').select('rot_uid,is_pro,expirres_at').in('rot_uid', uids).eq('is_pro', true);
    const proSet = new Set((pros || []).filter((p: any) => !p.expirres_at || Date.parse(p.expirres_at) > Date.now()).map((p: any) => p.rot_uid));

    const coinsOf = (s: any) => (Array.isArray(s.coins) ? s.coins : []).filter((c: any) => c && c.sym);
    const syms = [...new Set(subs!.flatMap((s: any) => coinsOf(s).map((c: any) => String(c.sym).toUpperCase())))];
    const ids = [...new Set(subs!.flatMap((s: any) => coinsOf(s).map((c: any) => c.id).filter(Boolean)))];
    const since = new Date(Date.now() - EVENT_DAYS * 86400000).toISOString().slice(0, 10);

    const [del, mon, unl, evs, etfRow] = await Promise.all([
      supabase.from('binance_delisted_symbols').select('base_asset,status').in('base_asset', syms),
      supabase.from('binance_monitoring_symbols').select('base_asset').in('base_asset', syms),
      ids.length ? supabase.from('token_unlocks').select('coin_id,unlock30d_pct,next_unlock_at').in('coin_id', ids) : Promise.resolve({ data: [] }),
      supabase.from('coin_events').select('base_asset,event_date,event_type,value,detail').in('base_asset', syms).gte('event_date', since),
      supabase.from('market_cache').select('data').eq('cache_key', 'etf_flows_summary').maybeSingle(),
    ]);
    const delBy = new Map((del.data || []).map((r: any) => [r.base_asset, r.status]));
    const monSet = new Set((mon.data || []).map((r: any) => r.base_asset));
    const unlBy = new Map((unl.data || []).map((r: any) => [r.coin_id, r]));
    const evBy = new Map<string, any[]>();
    (evs.data || []).forEach((e: any) => { const a = evBy.get(e.base_asset) || []; a.push(e); evBy.set(e.base_asset, a); });
    const etf = (etfRow as any).data?.data || {};

    for (const s of subs!) {
      if (!proSet.has(s.rot_uid)) { report.notPro++; continue; }
      const L: Lang = s.lang === 'mk' ? 'mk' : 'en', t = W[L];
      const sent: Record<string, string> = { ...(s.sent || {}) };
      const alerts: Alert[] = [];
      for (const c of coinsOf(s)) {
        const sym = String(c.sym).toUpperCase(), role = c.role === 'watching' ? t.watching : t.held;
        const tag = `<b>${he(sym)}</b> <i>(${role})</i>`;
        const st = delBy.get(sym);
        if (st) {
          const x = st === 'DELIST_ANNOUNCED' ? t.delist : st === 'NOT_LISTED' ? t.notListed : t.notTrading;
          alerts.push({ key: `${sym}|exchange|${st}`, sym, sev: 3, line: `⚠ ${tag}: ${x}. ${t.checkBinance}` });
        }
        if (monSet.has(sym)) alerts.push({ key: `${sym}|exchange|MONITORING`, sym, sev: 2, line: `⚠ ${tag}: ${t.monitoring}` });
        const u: any = c.id ? unlBy.get(c.id) : null;
        const pct = u && u.unlock30d_pct != null ? Number(u.unlock30d_pct) : null;
        if (pct != null && pct > UNLOCK_LINE) {
          const when = u.next_unlock_at ? String(u.next_unlock_at).slice(0, 10) : '';
          alerts.push({ key: `${sym}|unlock|${when}`, sym, sev: 2, line: `🔓 ${tag}: ${t.unlock(pct.toFixed(1), when ? nice(when, L) : '')}` });
        }
        for (const e of evBy.get(sym) || []) {
          const E = eventLine(e, L);
          if (!E) continue;
          alerts.push({ key: `${sym}|event|${e.event_type}|${e.event_date}`, sym, sev: 1,
            line: `${E.icon} ${tag}: <b>${he(E.title)}</b> · ${nice(e.event_date, L)}${E.detail ? `. ${he(E.detail)}` : ''}${E.note ? ` <i>(${he(E.note)})</i>` : ''}` });
        }
        const a = c.id === 'bitcoin' ? 'BTC' : c.id === 'ethereum' ? 'ETH' : null;
        const f = a && etf[a];
        if (f && f.last && !f.error && /^(reversal|extreme|turned)_/.test(f.state || '')) {
          const head = L === 'mk' && f.headline_mk ? f.headline_mk : f.headline;
          alerts.push({ key: `${sym}|etf|${f.state}|${f.last.day}`, sym, sev: 1,
            line: `🏦 ${tag}: ${t.etf(he(head), he(fmtM(f.last.total)), nice(f.last.day, L), he(fmtM(f.sum5)))}` });
        }
      }
      const fresh = alerts.filter((x) => !sent[x.key]).sort((x, y) => y.sev - x.sev);
      if (!fresh.length) { report.quiet++; continue; }

      let body = t.header + '\n\n';
      const shown: Alert[] = [];
      for (const x of fresh) { if (body.length + x.line.length > 3400) break; body += x.line + '\n\n'; shown.push(x); }
      if (shown.length < fresh.length) body += t.more(fresh.length - shown.length) + '\n\n';
      body += t.footer;

      const status = await send(Number(s.chat_id), body);
      if (status === 200) {
        const now = new Date().toISOString();
        fresh.forEach((x) => { sent[x.key] = now; });   // the overflow counts as seen: it is on the site
        const cutoff = Date.now() - SENT_KEEP_DAYS * 86400000;
        for (const k of Object.keys(sent)) if (Date.parse(sent[k]) < cutoff) delete sent[k];
        await supabase.from('telegram_subscribers').update({ sent, last_dm_at: now }).eq('rot_uid', s.rot_uid);
        report.sent++;
      } else if (status === 403) {
        await supabase.from('telegram_subscribers').update({ active: false }).eq('rot_uid', s.rot_uid);
        report.blocked++;
      } else {
        report.failed++;
      }
    }
    return new Response(JSON.stringify({ ok: true, ...report }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[send-dm-alerts]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg, ...report }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
