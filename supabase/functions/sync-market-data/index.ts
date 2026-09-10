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
  const data = await safeJson(url);
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
async function pct7d(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const data = await safeJson(url);
  const r = data?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  if (!ts.length || ts.length !== closes.length) return null;

  let last = -1;
  for (let i = closes.length - 1; i >= 0; i--) { if (closes[i] != null) { last = i; break; } }
  if (last < 0) return null;

  const target = ts[last] - 7 * 86400;
  let bestIdx = -1, bestDist = Infinity;
  for (let i = 0; i <= last; i++) {
    if (closes[i] == null) continue;
    const d = Math.abs(ts[i] - target);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  // Reject a match more than 3 days off the 7-day mark — a stale or gappy
  // series should report nothing rather than a number for a window nobody
  // asked for.
  if (bestIdx < 0 || bestIdx === last || bestDist > 3 * 86400) return null;

  const then = closes[bestIdx]!, now = closes[last]!;
  if (!then) return null;
  return ((now - then) / then) * 100;
}

async function fetchMacro(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {
    goldP7: null, silverP7: null, oilP7: null, dxyP7: null,
    total3P7: null, total3Mcap: null,
  };

  for (const m of MACRO_SYMBOLS) {
    try {
      out[m.key] = await pct7d(m.symbol);
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
    { cache_key: 'macro_data', data: out, updated_at: new Date().toISOString() },
    { onConflict: 'cache_key' },
  );
  if (error) throw error;
  return out;
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
 * blockchain.info daily chart → [latest, the reading 7 days before it].
 * `cors=true` is their documented parameter and is harmless server-side.
 */
async function chainSeries(chart: string): Promise<[number | null, number | null]> {
  const url = `https://api.blockchain.info/charts/${chart}`
    + '?timespan=9days&format=json&cors=true';
  const data = await safeJson(url);
  const vals = (data?.values ?? []) as { x: number; y: number }[];
  const clean = vals.filter((v) => v && isFinite(v.y) && v.y > 0);
  if (clean.length < 8) return [null, null];
  const last = clean[clean.length - 1];
  // Match on the timestamp rather than counting back 7 entries: the series
  // is daily but a missing day would otherwise quietly become a 6-day or
  // 8-day change reported as 7.
  const target = last.x - 7 * 86400;
  let best: { x: number; y: number } | null = null, bestDist = Infinity;
  for (const v of clean) {
    const d = Math.abs(v.x - target);
    if (d < bestDist) { bestDist = d; best = v; }
  }
  if (!best || best.x === last.x || bestDist > 36 * 3600) return [last.y, null];
  return [last.y, best.y];
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

  // ── Bitcoin hash rate. Reported in TH/s; shown in EH/s. ──
  try {
    const [now, then] = await chainSeries('hash-rate');
    if (now != null) out.hashrateEh = now / 1e6;
    out.hashrateP7 = pctChange(now, then);
  } catch (e) {
    console.warn('[network] hash rate failed:', (e as Error).message);
  }
  await sleep(200);

  // ── Unique Bitcoin addresses used per day. ──
  try {
    const [now, then] = await chainSeries('n-unique-addresses');
    out.addrCount = now;
    out.addrP7 = pctChange(now, then);
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
    }[];
    let now = 0, then = 0;
    for (const a of assets) {
      const c = Object.values(a?.circulating ?? {}).find((v) => isFinite(v));
      const p = Object.values(a?.circulatingPrevWeek ?? {}).find((v) => isFinite(v));
      if (c) now += c;
      if (p) then += p;
    }
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
    { cache_key: 'network_data', data: out, updated_at: new Date().toISOString() },
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

  const anyOk = Object.values(report).some((r) => r.ok);
  return new Response(
    JSON.stringify({ ok: anyOk, report, macro, network, fearGreed, ts: new Date().toISOString() }, null, 2),
    {
      status: anyOk ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    },
  );
});
