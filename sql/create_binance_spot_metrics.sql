-- ============================================================
-- create_binance_spot_metrics.sql
--
-- Binance SPOT price / 24h change / 24h volume, cached server-side so
-- the website stops calling api.binance.com from the browser.
--
-- WHY: js/data-loaders.js used to download the FULL ticker payload
-- (~500KB, every USDT pair on Binance) on every page load, per visitor,
-- to use three fields per coin. sync-binance-spot now does that once
-- for everyone on a 5-minute cron. It also fixes visitors in regions
-- where Binance answers HTTP 451 — they previously got no Binance
-- prices at all, with nothing indicating why.
--
-- SEPARATE TABLE FROM binance_futures_metrics on purpose: many coins
-- have a spot pair but no perpetual (59 of the site's 177 at the time
-- of writing), so the symbol sets differ and merging them would force
-- one table to carry nulls for the other's rows.
--
-- WHAT BINANCE CONTRIBUTES, AND WHAT IT CANNOT:
--   price, 24h change, 24h quote volume        <- Binance (fresher)
--   market cap                                  <- CoinGecko ONLY
--   7d / 14d / 30d change (what L1 ranks on)    <- CoinGecko ONLY
--   circulating/max supply, ATH                 <- CoinGecko ONLY
-- Binance has no concept of market cap (it needs circulating supply)
-- and its ticker is 24h-only. So the two sources COMPLEMENT each other
-- and neither is a fallback for the other — making CoinGecko
-- "fallback only" would strip L1 of the inputs it ranks on.
--
-- DEGRADATION: if this table is empty or unreachable,
-- supaLoadBinanceSpot() returns {} and every coin simply keeps its
-- CoinGecko values, via the pre-existing
-- `bnb ? bnb.price : c.current_price` pattern. Same behaviour the old
-- direct-fetch path had when Binance was down.
-- ============================================================

create table if not exists binance_spot_metrics (
  symbol                text primary key,   -- 'BTCUSDT'
  base_asset            text not null,      -- 'BTC' -> joins to coin.sym
  last_price            numeric,
  price_change_pct_24h  numeric,
  volume_24h_quote      numeric,
  updated_at            timestamptz not null default now()
);

create index if not exists binance_spot_metrics_base_asset_idx
  on binance_spot_metrics (base_asset);

alter table binance_spot_metrics enable row level security;

drop policy if exists binance_spot_metrics_public_read on binance_spot_metrics;
create policy binance_spot_metrics_public_read
  on binance_spot_metrics for select to anon, authenticated using (true);

-- ── Verify ──────────────────────────────────────────────────────
-- select count(*) pairs, max(updated_at) fresh from binance_spot_metrics;
-- select * from binance_spot_metrics where base_asset in ('BTC','ETH');
