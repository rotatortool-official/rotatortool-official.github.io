// ============================================================
// sync-market-cycle — Supabase Edge Function
//
// Computes a REAL 200-day moving average + Mayer Multiple (price ÷ MA200)
// for 6 assets: bitcoin, ethereum, binancecoin, solana, ripple, pax-gold.
//
// WHY THIS EXISTS:
// The frontend's existing `btcMA200` was only ever an ESTIMATE — derived
// from BTC's 30-day % return (price / (1 + p30frac*0.5)) — because
// computing a real 200-day average would've needed a separate historical
// price call the client couldn't make without extra rate-limit exposure.
// This function does that call server-side, once a day, same pattern as
// sync-bstocks: heavy lifting happens here, the client only ever reads
// a small cached result.
//
// IMPORTANT — CALIBRATION HONESTY:
// The "Stretched / Neutral / Oversold" 2.4× / 0.8× Mayer Multiple bands
// are specifically calibrated to BITCOIN's own multi-year price history.
// They are NOT generic thresholds — applying them to ETH/BNB/SOL/XRP/
// PAXG would be presenting a guess as a validated fact. This function
// computes the real Mayer Multiple ratio for all 6 assets, but only
// bitcoin gets a qualitative label attached (done in the frontend/scoring
// layer, not here) — the other 5 are shown as raw ratios only. See
// data-loaders.js computeScores() for where BTC's value actually feeds
// the adaptive buy/sell thresholds, and where the other 5 stay
// informational-only.
//
// DEPLOY:
//   supabase functions deploy sync-market-cycle
//   supabase secrets set MARKET_CYCLE_SYNC_SECRET=<new value, own secret,
//     same reasoning as BSTOCKS_SYNC_SECRET — SYNC_SECRET is project-wide
//     and shared with sync-market-data; don't touch it>
//
// SCHEDULE: once daily is enough — a 200-day MA barely moves day to day.
// See sql/sync_market_cycle_cron.sql.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ASSETS: { symbol: string; coingeckoId: string; name: string }[] = [
  { symbol: 'BTC',  coingeckoId: 'bitcoin',     name: 'Bitcoin' },
  { symbol: 'ETH',  coingeckoId: 'ethereum',    name: 'Ethereum' },
  { symbol: 'BNB',  coingeckoId: 'binancecoin', name: 'BNB' },
  { symbol: 'SOL',  coingeckoId: 'solana',      name: 'Solana' },
  { symbol: 'XRP',  coingeckoId: 'ripple',      name: 'XRP' },
  { symbol: 'PAXG', coingeckoId: 'pax-gold',    name: 'PAX Gold' }
];

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY         = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MARKET_CYCLE_SYNC_SECRET = Deno.env.get('MARKET_CYCLE_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function fetchOne(asset: typeof ASSETS[number], attempt = 1): Promise<any> {
  // CoinGecko market_chart — free tier, daily interval, 200 days of history.
  const url = `https://api.coingecko.com/api/v3/coins/${asset.coingeckoId}/market_chart?vs_currency=usd&days=200&interval=daily`;
  const res = await fetch(url);

  if (res.status === 429 && attempt < 3) {
    // Free-tier rate limit — back off hard and retry. This function only
    // runs once a day, so there's no cost to taking it slow: better to
    // wait 20s and succeed than rush and silently skip an asset.
    console.warn(`[sync-market-cycle] ${asset.symbol} got 429, retrying in 20s (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, 20000));
    return fetchOne(asset, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`market_chart ${asset.coingeckoId} -> HTTP ${res.status}`);
  }
  const json = await res.json();
  const prices: [number, number][] = json.prices; // [timestamp, price][]

  if (!Array.isArray(prices) || prices.length < 50) {
    // Don't compute a "200-day average" off fewer than ~50 real points —
    // that's not what the number claims to be. Skip rather than fabricate.
    throw new Error(`${asset.coingeckoId}: only ${prices?.length ?? 0} price points, too few for a real MA200`);
  }

  const closes = prices.map((p) => p[1]);
  const currentPrice = closes[closes.length - 1];

  // Real average of whatever daily closes we actually have (up to 200).
  // If CoinGecko returns fewer than 200 (e.g. a newer listing), we're
  // honest about the shorter window via `sample_size` rather than padding.
  const sampleSize = closes.length;
  const ma200 = closes.reduce((sum, c) => sum + c, 0) / sampleSize;

  const mayerMultiple = ma200 > 0 ? currentPrice / ma200 : null;

  return {
    symbol: asset.symbol,
    name: asset.name,
    price: currentPrice,
    ma200: ma200,
    mayer_multiple: mayerMultiple,
    sample_size: sampleSize, // honest flag: true 200 only when this = 200
    computed_at: new Date().toISOString()
  };
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!MARKET_CYCLE_SYNC_SECRET || token !== MARKET_CYCLE_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const results: { symbol: string; ok: boolean; error?: string }[] = [];
  const rows: Record<string, unknown>[] = [];

  // Sequential with a real gap between calls — CoinGecko's free/anonymous
  // tier rate-limited this at just 500ms spacing (confirmed via 429s on
  // 3 of 6 assets on the first real run). This function runs once a day,
  // so there's no cost to being conservative here.
  for (const asset of ASSETS) {
    try {
      const row = await fetchOne(asset);
      rows.push(row);
      results.push({ symbol: asset.symbol, ok: true });
    } catch (e) {
      console.error(`[sync-market-cycle] ${asset.symbol} failed:`, e instanceof Error ? e.message : e);
      results.push({ symbol: asset.symbol, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (rows.length) {
    const { error } = await supabase
      .from('market_cycle')
      .upsert(rows, { onConflict: 'symbol' });

    if (error) {
      console.error('[sync-market-cycle] upsert failed:', error.message);
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
