-- ============================================================
-- create_binance_futures_tables.sql
--
-- Storage for the Binance USDⓈ-M futures integration. Written ONLY by
-- the sync-binance-futures edge function (service_role); the website
-- reads these tables and never calls Binance itself.
--
-- WHY THE WEBSITE MUST NOT CALL BINANCE DIRECTLY: not CORS. That was
-- tested from the production origin and Binance answers browsers fine
-- (an earlier code comment claiming otherwise was wrong — the failures
-- were invalid symbols returning 400 without CORS headers). The real
-- reasons are that Binance geo-blocks some regions with HTTP 451, so
-- a visitor there silently gets nothing, and that every visitor would
-- otherwise re-fetch identical data.
--
-- TWO TIMESTAMPS ON binance_futures_metrics, on purpose:
--   bulk_updated_at   — 3 bulk calls refresh EVERY symbol each run
--   detail_updated_at — open interest is per-symbol, so it rotates
-- A single updated_at would misrepresent one of them. This lets a modal
-- honestly say "funding 2 min ago · OI 40 min ago".
--
-- WHY A HISTORY TABLE: Binance serves only ~30 days of open-interest
-- history and it cannot be reconstructed after the fact (unlike price,
-- which rotator-backtest rebuilds from klines over 771 days). Deciding
-- later whether OI/funding deserve a place in scoring requires
-- comparing them against forward returns, so this accumulates from day
-- one. The (symbol, bucket) primary key caps growth at 24 rows per
-- symbol per day regardless of cron frequency, because writes upsert
-- into the current hour bucket. 300 symbols ~= 7,200 rows/day.
-- ============================================================

create table if not exists binance_futures_metrics (
  symbol                text primary key,          -- 'BTCUSDT'
  base_asset            text not null,             -- 'BTC' -> joins to coin.sym
  binance_category      text,                      -- underlyingSubType, e.g. 'Layer-1'

  -- bulk fields: refreshed for every symbol on every run (3 calls total)
  last_price            numeric,
  price_change_pct_24h  numeric,
  volume_24h_quote      numeric,
  funding_rate          numeric,
  next_funding_time     timestamptz,
  mark_price            numeric,
  index_price           numeric,
  bulk_updated_at       timestamptz,

  -- per-symbol fields: refreshed on staleness rotation (1 call each)
  open_interest         numeric,
  open_interest_value   numeric,
  oi_change_1h_pct      numeric,
  oi_change_24h_pct     numeric,
  long_short_ratio      numeric,                   -- reserved for Step 6
  taker_buy_sell_ratio  numeric,                   -- reserved for Step 6
  detail_updated_at     timestamptz,

  updated_at            timestamptz not null default now()
);

create index if not exists binance_futures_metrics_base_asset_idx
  on binance_futures_metrics (base_asset);

-- Drives the rotation: each run picks the stalest symbols first.
create index if not exists binance_futures_metrics_detail_staleness_idx
  on binance_futures_metrics (detail_updated_at nulls first);

create table if not exists binance_futures_history (
  symbol              text        not null,
  bucket              timestamptz not null,
  open_interest_value numeric,
  funding_rate        numeric,
  last_price          numeric,
  primary key (symbol, bucket)
);

create index if not exists binance_futures_history_bucket_idx
  on binance_futures_history (bucket);

alter table binance_futures_metrics enable row level security;
alter table binance_futures_history enable row level security;

drop policy if exists binance_futures_metrics_public_read on binance_futures_metrics;
create policy binance_futures_metrics_public_read
  on binance_futures_metrics for select to anon, authenticated using (true);

drop policy if exists binance_futures_history_public_read on binance_futures_history;
create policy binance_futures_history_public_read
  on binance_futures_history for select to anon, authenticated using (true);

-- ── Verify ──────────────────────────────────────────────────────
-- select symbol, binance_category, funding_rate,
--        round(open_interest_value/1e6,1) oi_musd, oi_change_24h_pct
--   from binance_futures_metrics
--  where open_interest_value is not null
--  order by open_interest_value desc limit 10;
--
-- -- rotation health: how many symbols still awaiting an OI refresh
-- select count(*) filter (where detail_updated_at is null) pending,
--        min(detail_updated_at) stalest
--   from binance_futures_metrics;
