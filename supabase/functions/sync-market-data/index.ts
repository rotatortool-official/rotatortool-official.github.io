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

  const anyOk = Object.values(report).some((r) => r.ok);
  return new Response(
    JSON.stringify({ ok: anyOk, report, ts: new Date().toISOString() }, null, 2),
    {
      status: anyOk ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    },
  );
});
