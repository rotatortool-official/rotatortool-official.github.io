// ============================================================
// Supabase Edge Function — sync-market-data
// Runtime: Deno (Supabase Edge Runtime)
//
// Deploy:
//   supabase functions deploy sync-market-data --no-verify-jwt
//
// Secrets (set once):
//   supabase secrets set SYNC_SECRET=<long-random-string>
//
// Invoke manually:
//   curl -X POST \
//     -H "Authorization: Bearer <SYNC_SECRET>" \
//     https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-market-data
//
// Scheduled by pg_cron — see 28mart/sql/unified_market_data_cron.sql
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─────────────── CONFIG (edit to add symbols) ───────────────
const CRYPTO_SYMBOLS = [
  { id: 'bitcoin',     binance: 'BTCUSDT', name: 'Bitcoin' },
  { id: 'ethereum',    binance: 'ETHUSDT', name: 'Ethereum' },
  { id: 'solana',      binance: 'SOLUSDT', name: 'Solana' },
  { id: 'binancecoin', binance: 'BNBUSDT', name: 'BNB' },
  { id: 'ripple',      binance: 'XRPUSDT', name: 'XRP' },
  { id: 'cardano',     binance: 'ADAUSDT', name: 'Cardano' },
  { id: 'dogecoin',    binance: 'DOGEUSDT', name: 'Dogecoin' },
  { id: 'avalanche-2', binance: 'AVAXUSDT', name: 'Avalanche' },
];

const US_STOCKS = [
  { symbol: 'AAPL', name: 'Apple',             sector: 'Tech' },
  { symbol: 'MSFT', name: 'Microsoft',         sector: 'Tech' },
  { symbol: 'NVDA', name: 'NVIDIA',            sector: 'Semis' },
  { symbol: 'TSLA', name: 'Tesla',             sector: 'Auto' },
  { symbol: 'AMZN', name: 'Amazon',            sector: 'Consumer' },
  { symbol: 'GOOGL', name: 'Alphabet',         sector: 'Tech' },
  { symbol: 'META', name: 'Meta Platforms',    sector: 'Tech' },
  { symbol: 'SPY',  name: 'S&P 500 ETF',       sector: 'Index' },
];

// Frankfurt (XETRA/XFRA) — Yahoo suffix .DE = XETRA, .F = Frankfurt floor
const FRA_STOCKS = [
  { symbol: 'SAP.DE', name: 'SAP SE',      sector: 'Tech' },
  { symbol: 'SIE.DE', name: 'Siemens',     sector: 'Industrial' },
  { symbol: 'ALV.DE', name: 'Allianz',     sector: 'Finance' },
  { symbol: 'BMW.DE', name: 'BMW',         sector: 'Auto' },
  { symbol: 'DTE.DE', name: 'Deutsche Telekom', sector: 'Telecom' },
  { symbol: 'BAS.DE', name: 'BASF',        sector: 'Chemicals' },
];

const FOREX_PAIRS = [
  { symbol: 'EURUSD=X', name: 'EUR/USD' },
  { symbol: 'GBPUSD=X', name: 'GBP/USD' },
  { symbol: 'USDJPY=X', name: 'USD/JPY' },
  { symbol: 'AUDUSD=X', name: 'AUD/USD' },
  { symbol: 'USDCHF=X', name: 'USD/CHF' },
  { symbol: 'USDCAD=X', name: 'USD/CAD' },
];

// ─────────────── TYPES ───────────────
type AssetType = 'crypto' | 'stock' | 'forex';

type Row = {
  asset_type: AssetType;
  symbol: string;
  name?: string | null;
  price: number | null;
  change_24h: number | null;
  source_name: string;
  last_updated: string;
  metadata: Record<string, unknown>;
};

// ─────────────── FETCH HELPERS ───────────────
const UA = {
  'User-Agent': 'Mozilla/5.0 (compatible; RotatorSync/1.0; +https://rotatortool-official.github.io)',
  'Accept': 'application/json',
};

async function safeJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { ...UA, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${url} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────── SOURCE: COINGECKO (crypto) ───────────────
async function fetchCoinGecko(): Promise<Row[]> {
  const ids = CRYPTO_SYMBOLS.map((c) => c.id).join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;
  /* 2026-09-29: keyless calls from Supabase started getting a CloudFront
     403 (see sync-coin-universe). Send the Demo key, and skip the shared
     bot-style User-Agent the other sources use. */
  const key = (Deno.env.get('COINGECKO_API_KEY') ?? '').trim();
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', ...(key ? { 'x-cg-demo-api-key': key } : {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — coins/markets — ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const now = new Date().toISOString();
  return data.map((d: any) => ({
    asset_type: 'crypto' as const,
    symbol: (d.symbol ?? d.id).toUpperCase(),
    name: d.name,
    price: d.current_price ?? null,
    change_24h: d.price_change_percentage_24h ?? null,
    source_name: 'coingecko',
    last_updated: now,
    metadata: {
      coingecko_id: d.id,
      market_cap: d.market_cap,
      market_cap_rank: d.market_cap_rank,
      volume_24h: d.total_volume,
      high_24h: d.high_24h,
      low_24h: d.low_24h,
      circulating_supply: d.circulating_supply,
      image: d.image,
    },
  }));
}

// ─────────────── SOURCE: BINANCE (exchange tickers) ───────────────
async function fetchBinance(): Promise<Row[]> {
  const symbolsJson = encodeURIComponent(
    JSON.stringify(CRYPTO_SYMBOLS.map((c) => c.binance)),
  );
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsJson}`;
  const data = await safeJson(url);
  const now = new Date().toISOString();
  const rows: Row[] = [];
  for (const t of data) {
    const cfg = CRYPTO_SYMBOLS.find((c) => c.binance === t.symbol);
    if (!cfg) continue;
    rows.push({
      asset_type: 'crypto',
      symbol: cfg.binance.replace('USDT', ''),
      name: cfg.name,
      price: parseFloat(t.lastPrice),
      change_24h: parseFloat(t.priceChangePercent),
      source_name: 'binance',
      last_updated: now,
      metadata: {
        pair: t.symbol,
        volume_base: parseFloat(t.volume),
        volume_quote: parseFloat(t.quoteVolume),
        high_24h: parseFloat(t.highPrice),
        low_24h: parseFloat(t.lowPrice),
        trade_count: t.count,
        weighted_avg_price: parseFloat(t.weightedAvgPrice),
      },
    });
  }
  return rows;
}

// ─────────────── SOURCE: YAHOO FINANCE (stocks + forex) ───────────────
// Uses /v8/finance/chart — still open to server-to-server traffic (v7/quote
// now requires a crumb cookie which Supabase Edge Runtime can't obtain).
async function fetchYahooBatch(
  symbols: { symbol: string; name?: string; sector?: string }[],
  assetType: 'stock' | 'forex',
  sourceTag: string,
): Promise<Row[]> {
  if (symbols.length === 0) return [];
  const now = new Date().toISOString();
  const rows: Row[] = [];

  for (const cfg of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cfg.symbol)}?interval=1d&range=5d`;
      const data = await safeJson(url);
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const meta = result.meta ?? {};
      const price = meta.regularMarketPrice ?? null;
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
      const change_24h = (price != null && prev)
        ? ((price - prev) / prev) * 100
        : null;
      rows.push({
        asset_type: assetType,
        symbol: cfg.symbol,
        name: cfg.name ?? cfg.symbol,
        price,
        change_24h,
        source_name: sourceTag,
        last_updated: now,
        metadata: {
          currency: meta.currency,
          exchange: meta.exchangeName ?? meta.fullExchangeName,
          sector: cfg.sector,
          previous_close: prev,
          regular_market_day_high: meta.regularMarketDayHigh,
          regular_market_day_low: meta.regularMarketDayLow,
          fifty_two_week_high: meta.fiftyTwoWeekHigh,
          fifty_two_week_low: meta.fiftyTwoWeekLow,
          market_state: meta.marketState,
          timezone: meta.timezone,
        },
      });
      await sleep(150); // polite per-symbol pacing
    } catch (e) {
      console.warn(`[yahoo ${sourceTag}] ${cfg.symbol} failed:`, (e as Error).message);
    }
  }
  return rows;
}

// ─────────────── UPSERT ───────────────
async function upsertRows(
  supabase: ReturnType<typeof createClient>,
  rows: Row[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { error, count } = await supabase
    .from('unified_market_data')
    .upsert(rows, {
      onConflict: 'asset_type,symbol,source_name',
      count: 'exact',
    });
  if (error) throw error;
  return count ?? rows.length;
}

// ─────────────── SOURCE: MACRO (gold / silver / oil / DXY) ───────────────
// Added 2026-09-06. These used to come from Alpha Vantage in the browser,
// with the free-tier key hard-coded in a public client file; it was scraped
// and rate-limited into 403/429 on nearly every call, and removed on
// 2026-09-05. The removal note said to revive it server-side and never
// ship a key again — this is that revival. Yahoo's /v8/finance/chart needs
// no key at all, and this function already uses it for stocks and FX.
//
// READ THIS BEFORE WIRING IT INTO SCORING: promptove/06 proved L2 expands
// to `0.90·p7 − K` where K is one scalar shared by every coin, so a macro
// value cannot rank anything — it shifts the whole distribution equally.
// These feeds are for REGIME EVIDENCE (what is the environment doing),
// for the bot to quote, and as the prerequisite for per-asset sensitivity
// later. They are not a scoring fix, and re-weighting them inside L2 was
// already considered and rejected.
const MACRO_SYMBOLS: { key: string; symbol: string; label: string }[] = [
  { key: 'goldP7',   symbol: 'GC=F',     label: 'Gold futures' },
  { key: 'silverP7', symbol: 'SI=F',     label: 'Silver futures' },
  { key: 'oilP7',    symbol: 'CL=F',     label: 'WTI crude futures' },
  { key: 'dxyP7',    symbol: 'DX-Y.NYB', label: 'US Dollar Index' },
];

// 7 CALENDAR days, matched by timestamp rather than by counting bars.
// Commodities and FX do not trade weekends, so "7 bars back" is about 9
// calendar days — which would silently compare a different window than
// the coins' own p7 and make every delta wrong in the same direction.
/* Returns the 7-day percentage AND the daily closes it was computed from.
   The series costs NOTHING extra: this call already downloads a month of
   daily bars and, until 2026-09-11, kept two of them and threw the rest
   away. The site renders it as a sparkline under each indicator. */
/* 2026-10-03: also the 30-day change, for the TODAY tiles' 7D/30D flip.
   The range moved from 1mo to 2mo so a close near the 30-day mark always
   exists (a 1mo range can start a day or two short of it). The series is
   now cut by TIMESTAMP to the last 30 calendar days, and `n7` says how
   many of its points fall inside the 7-day window, so the front of the
   tile draws the same 7 days its number describes. Before this the 7-day
   number sat over a ~30-day line. */
async function pct7dSeries(symbol: string): Promise<{ pct: number | null; pct30: number | null; series: number[]; n7: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2mo`;
  const data = await safeJson(url);
  const r = data?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  if (!ts.length || ts.length !== closes.length) return { pct: null, pct30: null, series: [], n7: 0 };

  let last = -1;
  for (let i = closes.length - 1; i >= 0; i--) { if (closes[i] != null) { last = i; break; } }
  if (last < 0) return { pct: null, pct30: null, series: [], n7: 0 };

  // Reject a match more than 3 days off the mark — a stale or gappy
  // series should report nothing rather than a number for a window nobody
  // asked for.
  const anchor = (days: number): number => {
    const target = ts[last] - days * 86400;
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i <= last; i++) {
      if (closes[i] == null) continue;
      const d = Math.abs(ts[i] - target);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return (bestIdx < 0 || bestIdx === last || bestDist > 3 * 86400) ? -1 : bestIdx;
  };
  const pctFrom = (i: number) => {
    if (i < 0) return null;
    const then = closes[i]!, now = closes[last]!;
    return then ? ((now - then) / then) * 100 : null;
  };
  const i7 = anchor(7), i30 = anchor(30);

  /* Rounded to 6 significant figures: a sparkline needs shape, not
     precision, and this keeps the stored row small. */
  const from = i30 >= 0 ? i30 : 0;
  const idx: number[] = [];
  for (let i = from; i <= last; i++) if (closes[i] != null && isFinite(closes[i]!)) idx.push(i);
  const series = idx.map((i) => Number(closes[i]!.toPrecision(6)));
  const n7 = i7 >= 0 ? idx.filter((i) => i >= i7).length : 0;
  return { pct: pctFrom(i7), pct30: pctFrom(i30), series, n7 };
}

async function fetchMacro(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {
    goldP7: null, silverP7: null, oilP7: null, dxyP7: null,
    total3P7: null, total3Mcap: null,
  };

  /* Series live under their own key so the shape of `macro_data`'s
     numeric fields is unchanged — every existing reader keeps working
     and simply ignores `series`. */
  const series: Record<string, number[]> = {};
  /* The 30-day figures and the 7-day point counts also live under their
     own keys (p30, n7), keyed like `series`, for the same reason. */
  const p30: Record<string, number | null> = {};
  const n7: Record<string, number> = {};
  for (const m of MACRO_SYMBOLS) {
    try {
      const r = await pct7dSeries(m.symbol);
      out[m.key] = r.pct;
      p30[m.key] = r.pct30;
      if (r.series.length > 1) { series[m.key] = r.series; n7[m.key] = r.n7; }
    } catch (e) {
      console.warn(`[macro] ${m.label} (${m.symbol}) failed:`, (e as Error).message);
    }
    await sleep(150);
  }

  // TOTAL3 = market cap excluding BTC and ETH.
  //
  // The client-side version took CoinGecko /global's 24h change and
  // multiplied it by 2.5 to "approximate 7D". That is a fabricated number
  // and it is not carried over. Derived here instead from data already
  // held: a coin's mcap and its own 7d change give its mcap 7 days ago.
  // The single assumption is constant supply over a week, which is small
  // and stated rather than hidden.
  try {
    const { data: mkt } = await supabase
      .from('market_cache').select('data').eq('cache_key', 'cg_markets_all').single();
    const rows = (mkt?.data ?? []) as {
      id: string; market_cap: number | null;
      price_change_percentage_7d_in_currency: number | null;
    }[];
    let now = 0, then = 0;
    for (const c of rows) {
      if (c.id === 'bitcoin' || c.id === 'ethereum') continue;
      const mc = c.market_cap ?? 0;
      const p7 = c.price_change_percentage_7d_in_currency;
      if (!mc || p7 == null) continue;
      const denom = 1 + p7 / 100;
      if (denom <= 0) continue;      // a −100% week would divide by zero
      now += mc;
      then += mc / denom;
    }
    if (now > 0 && then > 0) {
      out.total3Mcap = now;
      out.total3P7 = ((now - then) / then) * 100;
    }
  } catch (e) {
    console.warn('[macro] total3 derivation failed:', (e as Error).message);
  }

  // Only write if at least one value resolved. A row of all-nulls would
  // overwrite the last good reading with nothing, and compute-signal-run
  // would silently fall back to its constants.
  const got = Object.entries(out).filter(([, v]) => v != null).length;
  if (got === 0) throw new Error('every macro source returned null — nothing written');

  const { error } = await supabase.from('market_cache').upsert(
    { cache_key: 'macro_data',
      data: Object.assign({}, out, { series, p30, n7 }),
      updated_at: new Date().toISOString() },
    { onConflict: 'cache_key' },
  );
  if (error) throw error;
  return out;
}

// ─────────────── SOURCE: WORLD (TODAY's money, metals, energy) ───────────────
//
// OWNER      this function. Nothing else writes market_cache.world_data.
// INPUT      official or exchange sources, all free and keyless, probed
//            2026-10-03 (promptove/86):
//              U.S. Treasury daily par yield curve CSV  -> us3m, us2y, us10y
//              New York Fed EFFR API                    -> fed (+ target range)
//              ECB data portal, deposit facility rate   -> ecb
//              Bank of Japan time-series API, overnight
//                call rate (the rate BoJ policy steers) -> boj
//              Japan Ministry of Finance JGB yields CSV -> jgb10y
//              Yahoo Finance futures, 1 year            -> gold silver copper
//                                                          aluminum oil gas dxy
//              U.S. BLS average price, electricity/kWh  -> power (monthly)
//              DefiLlama daily fees / DEX volume         -> ethFees solFees solDex
//              Ethereum public node (publicnode.com)     -> ethFees.gwei (live)
//              Blockchain.com / DefiLlama, 1 year        -> hash addr tvl stable (1Y side only)
//            FRED was tried and returns nothing to us; do not switch to it.
// OUTPUT     market_cache.world_data — { items: { key: Item }, updatedAt }.
//            Item: v (latest), date (of v, YYYY-MM-DD), s (values, oldest
//            first, up to ~1 year), n7/n30 (points inside those windows),
//            c7/c30/c365 (change: PERCENT for prices, POINTS for rates),
//            c1m for the monthly electricity price, last (policy rates:
//            the last step, {date, from, to}), lo/hi (Fed target range).
// CONSUMERS  the site's TODAY section (renderBriefing in data-loaders.js).
//            Not the scoring engine: macro_data stays its input, unchanged.
// FAILURE    every source is fetched on its own; one that fails keeps its
//            previous item from the last good row, so a dead feed shows
//            yesterday's reading with yesterday's date, never a blank.

type WorldItem = {
  v: number; date: string; s: number[]; n7: number; n30: number;
  c7: number | null; c30: number | null; c365: number | null;
  c1m?: number | null; last?: { date: string; from: number; to: number } | null;
  lo?: number; hi?: number;
};
type Pt = [number, number];   // [unix seconds, value]

const DAY = 86400;
const isoDay = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const tsOf = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;

/* Shared shape for every daily series: the latest value, the change over
   7 / 30 / 365 calendar days (matched by date, not by counting rows, for
   the reason given at pct7dSeries), and the last year of values. A window
   whose anchor is more than `tol` days off the mark reports null. */
function worldBuild(pts: Pt[], mode: 'pct' | 'pts'): WorldItem | null {
  const p = pts.filter(([t, v]) => isFinite(t) && isFinite(v)).sort((a, b) => a[0] - b[0]);
  if (p.length < 2) return null;
  const [tl, vl] = p[p.length - 1];
  const yearAgo = tl - 366 * DAY;
  const kept = p.filter(([t]) => t >= yearAgo);
  const anchor = (days: number, tol: number) => {
    const target = tl - days * DAY;
    let best = -1, dist = Infinity;
    for (let i = 0; i < p.length - 1; i++) {
      const d = Math.abs(p[i][0] - target);
      if (d < dist) { dist = d; best = i; }
    }
    return best >= 0 && dist <= tol * DAY ? p[best][1] : null;
  };
  const ch = (then: number | null) => {
    if (then == null) return null;
    if (mode === 'pts') return Number((vl - then).toFixed(3));
    return then ? Number((((vl - then) / then) * 100).toFixed(2)) : null;
  };
  return {
    v: Number(vl.toPrecision(6)), date: isoDay(tl),
    s: kept.map(([, v]) => Number(v.toPrecision(6))),
    n7: kept.filter(([t]) => t >= tl - 7 * DAY).length,
    n30: kept.filter(([t]) => t >= tl - 30 * DAY).length,
    c7: ch(anchor(7, 4)), c30: ch(anchor(30, 5)), c365: ch(anchor(365, 10)),
  };
}

/* The last step of a policy rate: the newest day it moved by at least
   `min` from the day before. Daily noise in a market rate (the Fed's and
   the BoJ's overnight averages wobble by 0.01) stays below `min`. */
function lastStep(pts: Pt[], min: number) {
  const p = [...pts].sort((a, b) => a[0] - b[0]);
  for (let i = p.length - 1; i > 0; i--) {
    if (Math.abs(p[i][1] - p[i - 1][1]) >= min) {
      return { date: isoDay(p[i][0]), from: Number(p[i - 1][1].toFixed(3)), to: Number(p[i][1].toFixed(3)) };
    }
  }
  return null;
}

function csvRows(text: string): string[][] {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(','));
}

async function worldText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { ...UA, 'Accept': 'text/csv,application/json,*/*' } });
  if (!res.ok) throw new Error(`${res.status} — ${url}`);
  return await res.text();
}

/* U.S. Treasury: one CSV per year, newest first. This year and last
   year together always cover 12 months. */
async function worldTreasury(): Promise<Record<string, WorldItem | null>> {
  const y = new Date().getUTCFullYear();
  const cols: Record<string, string> = { us3m: '3 Mo', us2y: '2 Yr', us10y: '10 Yr' };
  const pts: Record<string, Pt[]> = { us3m: [], us2y: [], us10y: [] };
  for (const year of [y - 1, y]) {
    const text = await worldText('https://home.treasury.gov/resource-center/data-chart-center/interest-rates/'
      + `daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`);
    const rows = csvRows(text);
    const head = rows[0].map((h) => h.replace(/"/g, '').trim());
    for (const r of rows.slice(1)) {
      const m = r[0].match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) continue;
      const t = tsOf(+m[3], +m[1], +m[2]);
      for (const k of Object.keys(cols)) {
        const v = parseFloat(r[head.indexOf(cols[k])]);
        if (isFinite(v)) pts[k].push([t, v]);
      }
    }
    await sleep(200);
  }
  return { us3m: worldBuild(pts.us3m, 'pts'), us2y: worldBuild(pts.us2y, 'pts'), us10y: worldBuild(pts.us10y, 'pts') };
}

async function worldFed(): Promise<WorldItem | null> {
  const end = new Date(), start = new Date(Date.now() - 400 * DAY * 1000);
  const d = await safeJson('https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json'
    + `?startDate=${start.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}`);
  const rows = (d?.refRates ?? []) as { effectiveDate: string; percentRate: number; targetRateFrom?: number; targetRateTo?: number }[];
  const pts: Pt[] = [], top: Pt[] = [];
  for (const r of rows) {
    const [Y, M, D] = r.effectiveDate.split('-').map(Number);
    const t = tsOf(Y, M, D);
    if (isFinite(r.percentRate)) pts.push([t, r.percentRate]);
    if (r.targetRateTo != null) top.push([t, r.targetRateTo]);
  }
  const it = worldBuild(pts, 'pts');
  if (!it) return null;
  const newest = rows.reduce((a, b) => (a.effectiveDate > b.effectiveDate ? a : b));
  if (newest.targetRateFrom != null) it.lo = newest.targetRateFrom;
  if (newest.targetRateTo != null) it.hi = newest.targetRateTo;
  it.last = lastStep(top, 0.1);   // the TARGET moved, not the daily average
  return it;
}

async function worldEcb(): Promise<WorldItem | null> {
  const start = new Date(Date.now() - 400 * DAY * 1000).toISOString().slice(0, 10);
  const rows = csvRows(await worldText(
    `https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?startPeriod=${start}&format=csvdata`));
  const h = rows[0], iT = h.indexOf('TIME_PERIOD'), iV = h.indexOf('OBS_VALUE');
  const pts: Pt[] = [];
  for (const r of rows.slice(1)) {
    const [Y, M, D] = (r[iT] || '').split('-').map(Number);
    const v = parseFloat(r[iV]);
    if (Y && isFinite(v)) pts.push([tsOf(Y, M, D), v]);
  }
  const it = worldBuild(pts, 'pts');
  if (it) it.last = lastStep(pts, 0.05);
  return it;
}

async function worldBoj(): Promise<WorldItem | null> {
  const s = new Date(Date.now() - 400 * DAY * 1000);
  const ym = `${s.getUTCFullYear()}${String(s.getUTCMonth() + 1).padStart(2, '0')}`;
  const d = await safeJson('https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en'
    + `&db=FM01&code=STRDCLUCON&startDate=${ym}`);
  const vals = d?.RESULTSET?.[0]?.VALUES;
  const ds: number[] = vals?.SURVEY_DATES ?? [], vs: (number | null)[] = vals?.VALUES ?? [];
  const pts: Pt[] = [];
  ds.forEach((n, i) => {
    const v = vs[i];
    if (v == null || !isFinite(v)) return;
    const x = String(n);
    pts.push([tsOf(+x.slice(0, 4), +x.slice(4, 6), +x.slice(6, 8)), v]);
  });
  const it = worldBuild(pts, 'pts');
  if (it) it.last = lastStep(pts, 0.1);
  return it;
}

/* Japan MoF: the historical file runs to last month (1974 onward, so
   only its tail is read) and a small file holds this month. */
async function worldJgb(): Promise<WorldItem | null> {
  const base = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/';
  const pts: Pt[] = [];
  for (const url of [base + 'historical/jgbcme_all.csv', base + 'jgbcme.csv']) {
    const rows = csvRows(await worldText(url));
    const head = rows.find((r) => r[0] === 'Date');
    if (!head) continue;
    const i10 = head.indexOf('10Y');
    for (const r of rows.slice(-400)) {
      const m = (r[0] || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      const v = parseFloat(r[i10]);
      if (m && isFinite(v)) pts.push([tsOf(+m[1], +m[2], +m[3]), v]);
    }
    await sleep(200);
  }
  const seen = new Set<number>();   // the two files can share a day at a month turn
  return worldBuild(pts.filter(([t]) => (seen.has(t) ? false : (seen.add(t), true))), 'pts');
}

async function worldYahoo(symbol: string): Promise<WorldItem | null> {
  const d = await safeJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`);
  const r = d?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [], cl: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const pts: Pt[] = [];
  ts.forEach((t, i) => { const v = cl[i]; if (v != null && isFinite(v)) pts.push([t, v]); });
  return worldBuild(pts, 'pct');
}

/* BLS average price of electricity per kWh, U.S. city average. Monthly,
   about six weeks behind; a month the BLS did not publish comes as "-"
   (October 2025 is one) and is skipped, so the line bridges it. The
   public v1 API needs no key and allows 25 calls a day; this job makes
   three. */
async function worldPower(): Promise<WorldItem | null> {
  const d = await safeJson('https://api.bls.gov/publicAPI/v1/timeseries/data/APU000072610');
  const rows = (d?.Results?.series?.[0]?.data ?? []) as { year: string; period: string; value: string }[];
  const pts: Pt[] = [];
  for (const r of rows) {
    const m = r.period.match(/^M(\d{2})$/);
    const v = parseFloat(r.value);
    if (m && +m[1] <= 12 && isFinite(v)) pts.push([tsOf(+r.year, +m[1], 1), v]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  const it = worldBuild(pts.slice(-14), 'pct');
  if (!it) return null;
  /* Month on month: the previous PUBLISHED month. */
  const prev = pts.length > 1 ? pts[pts.length - 2][1] : null;
  it.c1m = prev ? Number((((it.v - prev) / prev) * 100).toFixed(2)) : null;
  it.s = pts.slice(-13).map(([, v]) => v);   // 12 months back plus this one
  return it;
}

/* DefiLlama daily totals (fees paid on a chain, DEX volume on a chain),
   in USD. The NEWEST point is today, still filling up, so it would always
   look like a collapse: every point from today's UTC date on is dropped
   and the tile reads the last complete day. */
async function worldLlama(url: string): Promise<WorldItem | null> {
  const d = await safeJson(url);
  const t = (d?.totalDataChart ?? []) as [number, number][];
  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const pts: Pt[] = t.filter(([ts, v]) => ts < today && isFinite(v)).slice(-400).map(([ts, v]) => [ts, v]);
  return worldBuild(pts, 'pct');
}
/* Ethereum's gas price right now, in gwei, from a public node. Live
   only (no history), so it rides on the fees tile as an extra. */
async function worldGasNow(): Promise<number | null> {
  const r = await fetch('https://ethereum-rpc.publicnode.com', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const wei = parseInt(j?.result, 16);
  return isFinite(wei) ? Number((wei / 1e9).toPrecision(3)) : null;
}

/* One year of the four on-chain readings TODAY already shows (hash
   rate, addresses, TVL, stablecoins), for the tiles' 1Y side. The 7/30-day
   numbers on those tiles still come from network_data (fetchNetwork);
   these only add the year. Blockchain.com's series come as 7-day
   averages, the same smoothing the tiles use. */
async function worldChain(chart: string, scale: number): Promise<WorldItem | null> {
  const d = await safeJson(`https://api.blockchain.info/charts/${chart}?timespan=1year&rollingAverage=7days&format=json&cors=true`);
  const pts: Pt[] = ((d?.values ?? []) as { x: number; y: number }[]).map((p) => [p.x, p.y / scale]);
  return worldBuild(pts, 'pct');
}
async function worldTvl(): Promise<WorldItem | null> {
  const d = (await safeJson('https://api.llama.fi/v2/historicalChainTvl')) as { date: number; tvl: number }[];
  return worldBuild((d ?? []).slice(-400).map((p) => [p.date, p.tvl] as Pt), 'pct');
}
async function worldStable(): Promise<WorldItem | null> {
  const d = (await safeJson('https://stablecoins.llama.fi/stablecoincharts/all')) as { date: string | number; totalCirculatingUSD: Record<string, number> }[];
  const pts: Pt[] = (d ?? []).slice(-400).map((p) => [
    Number(p.date),
    Object.values(p.totalCirculatingUSD ?? {}).reduce((a, b) => a + (isFinite(b) ? b : 0), 0),
  ] as Pt).filter(([, v]) => v > 0);
  return worldBuild(pts, 'pct');
}

async function fetchWorld(supabase: ReturnType<typeof createClient>): Promise<Record<string, boolean>> {
  const { data: prevRow } = await supabase
    .from('market_cache').select('data').eq('cache_key', 'world_data').maybeSingle();
  const items: Record<string, WorldItem> = { ...((prevRow?.data as any)?.items ?? {}) };
  const got: Record<string, boolean> = {};
  const put = (k: string, it: WorldItem | null | undefined) => { if (it) { items[k] = it; got[k] = true; } else got[k] = false; };

  const jobs: [string, () => Promise<void>][] = [
    ['treasury', async () => { const r = await worldTreasury(); for (const k of Object.keys(r)) put(k, r[k]); }],
    ['fed',      async () => put('fed', await worldFed())],
    ['ecb',      async () => put('ecb', await worldEcb())],
    ['boj',      async () => put('boj', await worldBoj())],
    ['jgb10y',   async () => put('jgb10y', await worldJgb())],
    ['gold',     async () => put('gold', await worldYahoo('GC=F'))],
    ['silver',   async () => put('silver', await worldYahoo('SI=F'))],
    ['copper',   async () => put('copper', await worldYahoo('HG=F'))],
    ['aluminum', async () => put('aluminum', await worldYahoo('ALI=F'))],
    ['oil',      async () => put('oil', await worldYahoo('CL=F'))],
    ['gas',      async () => put('gas', await worldYahoo('NG=F'))],
    ['dxy',      async () => put('dxy', await worldYahoo('DX-Y.NYB'))],
    ['power',    async () => put('power', await worldPower())],
    ['ethFees',  async () => {
      const it = await worldLlama('https://api.llama.fi/summary/fees/ethereum?dataType=dailyFees');
      if (it) { try { const g = await worldGasNow(); if (g != null) (it as any).gwei = g; } catch { /* live extra only */ } }
      put('ethFees', it);
    }],
    ['solFees',  async () => put('solFees', await worldLlama('https://api.llama.fi/summary/fees/solana?dataType=dailyFees'))],
    ['hash',     async () => put('hash', await worldChain('hash-rate', 1e6))],          // TH/s -> EH/s
    ['addr',     async () => put('addr', await worldChain('n-unique-addresses', 1))],
    ['tvl',      async () => put('tvl', await worldTvl())],
    ['stable',   async () => put('stable', await worldStable())],
    ['solDex',   async () => put('solDex', await worldLlama('https://api.llama.fi/overview/dexs/solana?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true'))],
  ];
  for (const [label, job] of jobs) {
    try { await job(); }
    catch (e) { got[label] = false; console.warn(`[world] ${label} failed:`, (e as Error).message); }
    await sleep(150);
  }

  if (!Object.values(got).some(Boolean)) throw new Error('every world source failed — previous row kept');
  const { error } = await supabase.from('market_cache').upsert(
    { cache_key: 'world_data', data: { items, updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() },
    { onConflict: 'cache_key' },
  );
  if (error) throw error;
  return got;
}

// ─────────────── SOURCE: FEAR & GREED ───────────────
//
// OWNER      this function. Nothing else writes market_cache.fear_greed.
// INPUT      alternative.me /fng — no key, no rate limit worth pacing for.
// OUTPUT     market_cache.fear_greed — { value, label, asOf, source }.
// CONSUMERS  compute-signal-run (pillar 6 of the insight score),
//            send-telegram-alerts. Both read `.value`; `label` is the
//            upstream wording and is displayed, never compared against.
//
// WHY THIS FUNCTION EXISTS AT ALL, added 2026-09-10.
//
// ARCHITECTURE-MAP.md has named sync-market-data the owner of this row
// since 2.3.0 wired the pillar. It was never true. No writer existed
// anywhere in the repo, in any function or client file. The row was
// written once, by hand, on 2026-09-03 at 22:27 UTC, and every insight
// score in every run since has consulted that one frozen number.
//
// It survived undetected for a week because of a coincidence: the value
// sat at exactly 65 and INSIGHT_RULES.fearGreed.greed is 65, and the
// rule fires on `fg > greed`. A stale reading parked one point below a
// band edge contributes nothing, so pillar 6 was silently inert rather
// than visibly wrong. The live reading on the day this was written was
// 69 — inside the greed band, -8 points to every coin.
//
// The lesson is not "add a writer". It is that a cache row with no owner
// reads exactly like a cache row with a healthy one, so the guard has to
// live at the READER: compute-signal-run now refuses a reading older
// than FEAR_GREED_MAX_AGE_H and records that it did.
async function fetchFearGreed(
  supabase: ReturnType<typeof createClient>,
): Promise<{ value: number; label: string }> {
  const data = await safeJson('https://api.alternative.me/fng/?limit=1');

  // The API reports its own failures in metadata.error while still
  // returning 200, so a non-null error there is not an exception the
  // fetch would have thrown.
  const apiErr = data?.metadata?.error;
  if (apiErr) throw new Error(`alternative.me reported: ${apiErr}`);

  const row = data?.data?.[0];
  // Everything upstream is a STRING, including the number.
  const value = Number(row?.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`unusable value: ${JSON.stringify(row?.value)}`);
  }
  const label = typeof row?.value_classification === 'string'
    ? row.value_classification : '';

  // The index's own timestamp for the reading, kept apart from
  // updated_at. updated_at says when WE last wrote; asOf says what day
  // the reading is for. The failure this function exists to fix is one
  // where those two diverge, so both are recorded.
  const ts = Number(row?.timestamp);
  const asOf = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null;

  const out = { value, label, asOf, source: 'alternative.me' };
  const { error } = await supabase.from('market_cache').upsert(
    { cache_key: 'fear_greed', data: out, updated_at: new Date().toISOString() },
    { onConflict: 'cache_key' },
  );
  if (error) throw error;
  return { value, label };
}

// ─────────────── SOURCE: ON-CHAIN NETWORK READINGS ───────────────
//
// OWNER      this function. Nothing else writes market_cache.network_data.
// INPUTS     blockchain.info charts (hash rate, unique addresses),
//            DefiLlama (total DeFi TVL, total stablecoin supply).
// OUTPUT     market_cache.network_data — one flat object, same shape
//            discipline as macro_data: a value and its 7-day percent.
// CONSUMERS  site/js/data-loaders.js loadNetworkData(), which READS ONLY.
//
// Every percent is derived here. The browser is handed finished numbers
// and formats them, exactly as with macro_data — for the reason written
// at loadMacroData(): a reading assembled in a visitor's tab is a reading
// nobody can reproduce.
//
// NOT INCLUDED — ETF flows. Farside Investors is the only free source for
// daily spot BTC/ETH ETF flow and it has no API; the page sits behind
// Cloudflare's interstitial, so any parser here would be a scraper that
// breaks silently and reports a stale number as today's. Left out on
// purpose rather than shipped as a guess.

/** Percent change between two readings, or null if either is unusable. */
function pctChange(now: number | null, then: number | null): number | null {
  if (now == null || then == null) return null;
  if (!isFinite(now) || !isFinite(then) || then <= 0) return null;
  return ((now - then) / then) * 100;
}

/**
 * blockchain.info daily chart → { level, p7, series }.
 *
 * WEEKLY AVERAGES, NOT TWO SINGLE DAYS. Changed 2026-09-11 after the
 * hash rate printed +19.05% one day and -15.16% the next.
 *
 * Both readings were correct arithmetic on the published data, and
 * neither was news. The daily hash rate is not measured — it is
 * INFERRED from how many blocks were found that day, and block
 * discovery is a Poisson process, so a single day carries about 7% of
 * pure estimator noise. Comparing one noisy day against the noisy day
 * seven earlier compounds it: both endpoints move, and a swing of ±19%
 * arrives on a network that did nothing. Measured on the same series
 * the two readings above came from, the honest week-over-week change
 * was +0.09%.
 *
 * Active addresses had a second version of the same problem — a
 * weekday cycle. Saturday and Sunday run 10-15% below Thursday, so the
 * old reading partly reported which day of the week it happened to be.
 *
 * Both are fixed by the same thing: average the last seven days and
 * compare to the seven before them. This is also what every serious
 * hash rate display does, and why blockchain.com's own front page
 * shows a smoothed line rather than the daily estimate.
 *
 * SELECTED BY TIMESTAMP, NOT BY INDEX. This series has holes — there
 * is a real 8-day gap at 2026-08-16, and a 30-day request currently
 * returns 23 points. Taking the last seven ENTRIES would quietly
 * average a fortnight and call it a week. Each bucket must also carry
 * MIN_BUCKET real days or the change is reported as null, because
 * "not enough data to say" and "no change" are different statements
 * (GUARDRAILS rule 4).
 *
 * `cors=true` is their documented parameter and is harmless server-side.
 */
const MIN_BUCKET = 5;

function meanOf(pts: { x: number; y: number }[]): number | null {
  if (pts.length < MIN_BUCKET) return null;
  return pts.reduce((a, p) => a + p.y, 0) / pts.length;
}

async function chainSeries(
  chart: string,
): Promise<{ level: number | null; p7: number | null; p30: number | null; series: number[]; n7: number }> {
  /* 40 days, so the week 30 days back (days 37..30) is complete for p30. */
  const url = `https://api.blockchain.info/charts/${chart}`
    + '?timespan=40days&format=json&cors=true';
  const data = await safeJson(url);
  const vals = (data?.values ?? []) as { x: number; y: number }[];
  const clean = vals.filter((v) => v && isFinite(v.y) && v.y > 0)
                    .sort((a, b) => a.x - b.x);
  /* The sparkline stays RAW daily. The headline is smoothed because a
     single day is a poor estimate; the chart underneath it should still
     show what the data actually looks like rather than hide the spread. */
  if (!clean.length) return { level: null, p7: null, p30: null, series: [], n7: 0 };
  const last = clean[clean.length - 1].x;
  const in30 = clean.filter((v) => v.x >= last - 30 * 86400);
  const series = in30.map((v) => Number(v.y.toPrecision(6)));
  const n7 = in30.filter((v) => v.x >= last - 7 * 86400).length;

  const wk = (from: number, to: number) =>
    clean.filter((v) => v.x > last - from * 86400 && v.x <= last - to * 86400);

  const recent = meanOf(wk(7, 0));
  const prior  = meanOf(wk(14, 7));
  /* 30d: this week's mean against the mean of the week 30 days earlier,
     the same smoothing as p7. */
  const month  = meanOf(wk(37, 30));

  /* Falls back to the latest single point rather than reporting
     nothing, so a short or gappy series still shows a level. */
  const level = recent != null ? recent : clean[clean.length - 1].y;
  return { level, p7: pctChange(recent, prior), p30: pctChange(recent, month), series, n7 };
}

async function fetchNetwork(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {
    hashrateEh: null, hashrateP7: null,
    addrCount: null,  addrP7: null,
    tvlUsd: null,     tvlP7: null,
    stableUsd: null,  stableP7: null,
  };
  /* Kept under their own key so every existing reader of the numeric
     fields is untouched. */
  const series: Record<string, number[]> = {};
  /* 30-day figures and 7-day point counts, under their own keys like
     `series` (2026-10-03, the TODAY tiles' 7D/30D flip). */
  const p30: Record<string, number | null> = {};
  const n7: Record<string, number> = {};

  // ── Bitcoin hash rate. Reported in TH/s; shown in EH/s. ──
  try {
    const r = await chainSeries('hash-rate');
    if (r.level != null) out.hashrateEh = r.level / 1e6;
    out.hashrateP7 = r.p7;
    p30.hashrateEh = r.p30;
    if (r.series.length > 1) {
      series.hashrateEh = r.series.map((v) => Number((v / 1e6).toPrecision(6)));
      n7.hashrateEh = r.n7;
    }
  } catch (e) {
    console.warn('[network] hash rate failed:', (e as Error).message);
  }
  await sleep(200);

  // ── Unique Bitcoin addresses used per day. ──
  try {
    const r = await chainSeries('n-unique-addresses');
    out.addrCount = r.level;
    out.addrP7 = r.p7;
    p30.addrCount = r.p30;
    if (r.series.length > 1) { series.addrCount = r.series; n7.addrCount = r.n7; }
  } catch (e) {
    console.warn('[network] addresses failed:', (e as Error).message);
  }
  await sleep(200);

  // ── Total DeFi TVL across every chain DefiLlama tracks. ──
  try {
    const rows = await safeJson('https://api.llama.fi/v2/historicalChainTvl') as
      { date: number; tvl: number }[];
    const clean = (rows ?? []).filter((r) => r && isFinite(r.tvl) && r.tvl > 0);
    if (clean.length >= 8) {
      const last = clean[clean.length - 1];
      const target = last.date - 7 * 86400;
      let best: { date: number; tvl: number } | null = null, bestDist = Infinity;
      for (const r of clean) {
        const d = Math.abs(r.date - target);
        if (d < bestDist) { bestDist = d; best = r; }
      }
      out.tvlUsd = last.tvl;
      if (best && best.date !== last.date && bestDist <= 36 * 3600) {
        out.tvlP7 = pctChange(last.tvl, best.tvl);
      }
      /* DefiLlama returns the FULL history on this endpoint and only the
         last two points were ever used. */
      const in30 = clean.filter((r) => r.date >= last.date - 30 * 86400);
      series.tvlUsd = in30.map((r) => Number(r.tvl.toPrecision(6)));
      n7.tvlUsd = in30.filter((r) => r.date >= last.date - 7 * 86400).length;
      const t30 = last.date - 30 * 86400;
      let m30: { date: number; tvl: number } | null = null, m30Dist = Infinity;
      for (const r of clean) {
        const d = Math.abs(r.date - t30);
        if (d < m30Dist) { m30Dist = d; m30 = r; }
      }
      p30.tvlUsd = (m30 && m30Dist <= 36 * 3600) ? pctChange(last.tvl, m30.tvl) : null;
    }
  } catch (e) {
    console.warn('[network] defi tvl failed:', (e as Error).message);
  }
  await sleep(200);

  // ── Total stablecoin supply. DefiLlama carries this week's figure and
  //    last week's on the same row, so the window is theirs, not ours. ──
  try {
    const data = await safeJson('https://stablecoins.llama.fi/stablecoins?includePrices=false');
    const assets = (data?.peggedAssets ?? []) as {
      circulating?: Record<string, number>;
      circulatingPrevWeek?: Record<string, number>;
      circulatingPrevMonth?: Record<string, number>;
    }[];
    let now = 0, then = 0, month = 0;
    for (const a of assets) {
      const c = Object.values(a?.circulating ?? {}).find((v) => isFinite(v));
      const p = Object.values(a?.circulatingPrevWeek ?? {}).find((v) => isFinite(v));
      if (c) now += c;
      if (p) then += p;
      const pm = Object.values(a?.circulatingPrevMonth ?? {}).find((v) => isFinite(v));
      if (pm) month += pm;
    }
    p30.stableUsd = (now > 0 && month > 0) ? pctChange(now, month) : null;
    if (now > 0) out.stableUsd = now;
    if (now > 0 && then > 0) out.stableP7 = pctChange(now, then);
  } catch (e) {
    console.warn('[network] stablecoins failed:', (e as Error).message);
  }

  // Same rule as macro: never overwrite a good reading with a row of
  // nulls. A partial row IS written — three working sources and one
  // broken one is still a briefing.
  const got = Object.values(out).filter((v) => v != null).length;
  if (got === 0) throw new Error('every network source returned null — nothing written');

  const { error } = await supabase.from('market_cache').upsert(
    { cache_key: 'network_data',
      data: Object.assign({}, out, { series, p30, n7 }),
      updated_at: new Date().toISOString() },
    { onConflict: 'cache_key' },
  );
  if (error) throw error;
  return out;
}

// ─────────────── MAIN HANDLER ───────────────
Deno.serve(async (req) => {
  // Auth: require Bearer SYNC_SECRET (or service role key as fallback)
  const authHeader = req.headers.get('authorization') ?? '';
  const syncSecret = Deno.env.get('SYNC_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const allowed = new Set<string>();
  if (syncSecret) allowed.add(`Bearer ${syncSecret}`);
  if (serviceKey) allowed.add(`Bearer ${serviceKey}`);
  if (!allowed.has(authHeader)) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const report: Record<string, { ok: boolean; count?: number; error?: string }> = {};

  // Each source is independent — a failure in one MUST NOT stop the others.
  const tasks: Array<[string, () => Promise<Row[]>]> = [
    ['coingecko', fetchCoinGecko],
    ['binance',   fetchBinance],
    ['yahoo_us',  () => fetchYahooBatch(US_STOCKS,   'stock', 'yahoo')],
    ['yahoo_fra', () => fetchYahooBatch(FRA_STOCKS,  'stock', 'xfra')],
    ['yahoo_fx',  () => fetchYahooBatch(FOREX_PAIRS, 'forex', 'yahoo')],
  ];

  for (const [label, fn] of tasks) {
    try {
      const rows = await fn();
      const count = await upsertRows(supabase, rows);
      report[label] = { ok: true, count };
      console.log(`[${label}] upserted ${count} rows`);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      report[label] = { ok: false, error: msg };
      console.error(`[${label}] failed:`, msg);
    }
    await sleep(350); // gentle pacing for free-tier APIs
  }

  // Macro writes market_cache, not unified_market_data, so it sits outside
  // the upsertRows loop above — but it is isolated the same way: it must
  // never be able to fail the price syncs that already succeeded.
  let macro: Record<string, number | null> | null = null;
  try {
    macro = await fetchMacro(supabase);
    report.macro = { ok: true, count: Object.values(macro).filter((v) => v != null).length };
    console.log('[macro] wrote market_cache.macro_data:', JSON.stringify(macro));
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    report.macro = { ok: false, error: msg };
    console.error('[macro] failed:', msg);
  }

  // On-chain readings for the daily briefing. Isolated for the same
  // reason macro is: it must never be able to fail a price sync that has
  // already succeeded, and a broken feed here is a missing card on the
  // page, not a broken page.
  let network: Record<string, number | null> | null = null;
  try {
    network = await fetchNetwork(supabase);
    report.network = { ok: true, count: Object.values(network).filter((v) => v != null).length };
    console.log('[network] wrote market_cache.network_data:', JSON.stringify(network));
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    report.network = { ok: false, error: msg };
    console.error('[network] failed:', msg);
  }

  // Isolated for the same reason macro and network are. A dead sentiment
  // feed must cost the run one pillar, never a price sync that already
  // succeeded — and it is now VISIBLE when it dies, both here in
  // `report.fear_greed` and at the reader, which ages the row out.
  let fearGreed: { value: number; label: string } | null = null;
  try {
    fearGreed = await fetchFearGreed(supabase);
    report.fear_greed = { ok: true, count: 1 };
    console.log('[fear_greed] wrote market_cache.fear_greed:', JSON.stringify(fearGreed));
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    report.fear_greed = { ok: false, error: msg };
    console.error('[fear_greed] failed:', msg);
  }

  // TODAY's money, metals and energy readings (promptove/86). Isolated
  // like macro and network: a dead source keeps its last good reading
  // and can never fail a price sync that already succeeded.
  let world: Record<string, boolean> | null = null;
  try {
    world = await fetchWorld(supabase);
    report.world = { ok: true, count: Object.values(world).filter(Boolean).length };
    console.log('[world] wrote market_cache.world_data:', JSON.stringify(world));
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    report.world = { ok: false, error: msg };
    console.error('[world] failed:', msg);
  }

  const anyOk = Object.values(report).some((r) => r.ok);
  return new Response(
    JSON.stringify({ ok: anyOk, report, macro, network, fearGreed, world, ts: new Date().toISOString() }, null, 2),
    {
      status: anyOk ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    },
  );
});
