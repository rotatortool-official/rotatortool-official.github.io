// ============================================================
// sync-bstocks — Supabase Edge Function
//
// Server-side sync of Binance bStocks (tokenized equities) into
// `unified_market_data` (asset_type='stock', source_name='binance').
//
// WHY A SEPARATE FUNCTION FROM sync-market-data:
// The existing `sync-market-data` function (crypto + the X bot feed)
// isn't in this repo — it's only deployed to Supabase — so extending
// it in place risked breaking a function I can't see or test against.
// This ships as its own function with its own cron schedule instead.
// If you'd rather have ONE function, paste me sync-market-data's
// source and I'll fold this block into it and retire this file.
//
// WHY SERVER-SIDE, NOT CLIENT-SIDE:
// api.binance.com blocks direct browser calls via CORS (confirmed —
// see rotator-bstocks-migration-plan.md). This function fetches
// Binance server-to-server (no CORS involved) and writes the results
// to Supabase; the browser only ever reads unified_market_data.
//
// DEPLOY:
//   supabase functions deploy sync-bstocks
//   supabase secrets set SYNC_SECRET=<same value you use for sync-market-data>
//
// SCHEDULE: see sql/sync_bstocks_cron.sql — runs once daily, since
// klines (1d interval) only produce a new candle once a day anyway;
// there's no point calling this more often than that.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── bStock roster ──────────────────────────────────────────────
// Mirrors BSTOCK_LIST in js/config.js — keep these two in sync manually.
//
// Confirmed live tickers — sourced from Binance's own launch/expansion
// announcements and dividend notices (name+ticker explicitly paired in
// the source, not guessed from the company name). Binance's bStocks
// roster has grown to 46+ listings as of late Aug 2026 and keeps
// growing in batches — this covers every one confirmed by a direct
// source citation, NOT the full current roster.
//
// ⚠ VERIFY BEFORE DEPLOYING: check Binance's live bStocks markets page
// or exchangeInfo for the current full list before the first real
// deploy — this list will already be stale by some margin given how
// fast Binance is adding new bStocks (10+ per batch, multiple batches
// since June). Add missing ones the same way: sym / name / binance symbol.
//
// Deliberately excluded: sector/index ETFs and a leveraged inverse ETF
// that Binance also lists as bStocks (QQQB, SMHB, EWYB, SOXSB — the
// last one is a 3x SHORT semiconductor fund, not comparable to a single
// stock's momentum). The migration plan said single-name equities only;
// this list honors that. Also excluded: Coinbase/Alphabet/Nokia, named
// in coverage but without a confirmed exact ticker in my sources.
const BSTOCK_SYMBOLS: { sym: string; name: string; binance: string }[] = [
  { sym: 'AAPL',  name: 'Apple',                          binance: 'AAPLBUSDT' },
  { sym: 'MSFT',  name: 'Microsoft',                       binance: 'MSFTBUSDT' },
  { sym: 'NVDA',  name: 'NVIDIA',                          binance: 'NVDABUSDT' },
  { sym: 'TSLA',  name: 'Tesla',                           binance: 'TSLABUSDT' },
  { sym: 'AMZN',  name: 'Amazon',                          binance: 'AMZNBUSDT' },
  { sym: 'META',  name: 'Meta Platforms',                  binance: 'METABUSDT' },
  { sym: 'AMD',   name: 'AMD',                             binance: 'AMDBUSDT' },
  { sym: 'INTC',  name: 'Intel',                           binance: 'INTCBUSDT' },
  { sym: 'PLTR',  name: 'Palantir',                        binance: 'PLTRBUSDT' },
  { sym: 'MSTR',  name: 'Strategy',                        binance: 'MSTRBUSDT' }, // formerly MicroStrategy
  { sym: 'CRCL',  name: 'Circle Internet Group',           binance: 'CRCLBUSDT' },
  { sym: 'MU',    name: 'Micron Technology',                binance: 'MUBUSDT' },
  { sym: 'SNDK',  name: 'Sandisk',                          binance: 'SNDKBUSDT' },
  { sym: 'SPCX',  name: 'SpaceX',                           binance: 'SPCXBUSDT' },
  { sym: 'LITE',  name: 'Lumentum',                         binance: 'LITEBUSDT' },
  { sym: 'AMAT',  name: 'Applied Materials',                binance: 'AMATBUSDT' },
  { sym: 'DELL',  name: 'Dell',                             binance: 'DELLBUSDT' },
  { sym: 'BE',    name: 'Bloom Energy',                     binance: 'BEBUSDT' },
  { sym: 'FLNC',  name: 'Fluence Energy',                   binance: 'FLNCBUSDT' },
  { sym: 'GS',    name: 'Goldman Sachs',                    binance: 'GSBUSDT' },
  { sym: 'PYPL',  name: 'PayPal',                           binance: 'PYPLBUSDT' },
  { sym: 'IBM',   name: 'IBM',                              binance: 'IBMBUSDT' },
  { sym: 'HOOD',  name: 'Robinhood',                        binance: 'HOODBUSDT' },
  { sym: 'DJT',   name: 'Trump Media & Technology Group',   binance: 'DJTBUSDT' }
];

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET        = Deno.env.get('SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── % change from a klines close-price series ──────────────────
// klines[i] = [openTime, open, high, low, close, volume, ...]
// closes[closes.length-1] is "today" (most recent daily candle).
function pctChange(closes: number[], daysAgo: number): number | null {
  const n = closes.length;
  const idx = n - 1 - daysAgo;
  if (idx < 0 || closes[idx] == null || closes[idx] === 0) return null;
  const latest = closes[n - 1];
  return ((latest - closes[idx]) / closes[idx]) * 100;
}

async function fetchOne(entry: typeof BSTOCK_SYMBOLS[number]) {
  const symbol = entry.binance;

  // 24hr ticker — current price + 24h % change + quote volume
  const tickerRes = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
  );
  if (!tickerRes.ok) {
    throw new Error(`ticker/24hr ${symbol} -> HTTP ${tickerRes.status}`);
  }
  const ticker = await tickerRes.json();

  // Daily klines, last 31 candles — enough for 7D/14D/30D deltas
  const klinesRes = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=31`
  );
  if (!klinesRes.ok) {
    throw new Error(`klines ${symbol} -> HTTP ${klinesRes.status}`);
  }
  const klines: unknown[] = await klinesRes.json();
  const closes = (klines as any[]).map((k) => parseFloat(k[4]));

  const price     = parseFloat(ticker.lastPrice);
  const change24h = parseFloat(ticker.priceChangePercent);
  const volume24  = parseFloat(ticker.quoteVolume);

  const p7  = pctChange(closes, 7);
  const p14 = pctChange(closes, 14);
  const p30 = pctChange(closes, 30);

  return {
    asset_type:   'stock',
    symbol:       entry.sym,          // display ticker, e.g. 'AAPL' — matches BSTOCK_LIST in config.js
    name:         entry.name,
    price:        Number.isFinite(price) ? price : null,
    change_24h:   Number.isFinite(change24h) ? change24h : null,
    source_name:  'binance',
    last_updated: new Date().toISOString(),
    metadata: {
      p7, p14, p30,
      volume24: Number.isFinite(volume24) ? volume24 : null,
      binance_symbol: symbol
      // mcap intentionally omitted — Binance doesn't expose share-count
      // data for bStocks, and we don't want to fabricate one. Ship-first
      // scoring (see computeScores() in data-loaders.js) already treats
      // this as optional.
    }
  };
}

Deno.serve(async (req) => {
  // ── Auth: same shared-secret pattern as sync-market-data ──────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!SYNC_SECRET || token !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const results: { symbol: string; ok: boolean; error?: string }[] = [];
  const rows: Record<string, unknown>[] = [];

  // Sequential, not Promise.all — deliberately gentle on Binance's public
  // rate limits since this only needs to run once a day, not race to finish.
  for (const entry of BSTOCK_SYMBOLS) {
    try {
      const row = await fetchOne(entry);
      rows.push(row);
      results.push({ symbol: entry.sym, ok: true });
    } catch (e) {
      console.error(`[sync-bstocks] ${entry.sym} failed:`, e instanceof Error ? e.message : e);
      results.push({ symbol: entry.sym, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    // Small delay between symbols — polite to Binance's public endpoints.
    await new Promise((r) => setTimeout(r, 150));
  }

  if (rows.length) {
    const { error } = await supabase
      .from('unified_market_data')
      .upsert(rows, { onConflict: 'asset_type,symbol,source_name' });

    if (error) {
      console.error('[sync-bstocks] upsert failed:', error.message);
      return new Response(JSON.stringify({ error: error.message, results }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return new Response(
    JSON.stringify({ synced: rows.length, failed, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
