-- ============================================================
-- create_binance_daily_klines.sql
--
-- Daily candles used to grade past calls (best high / worst low inside
-- the [snap+1d, snap+14d] window). Cached server-side so the browser
-- stops issuing one Binance request per graded symbol.
--
-- REPLACED TWO DUPLICATE CLIENT IMPLEMENTATIONS: js/signal-history.js
-- and track-record.html each carried their own copy of the same
-- fetch-per-symbol loop. Both now read this table.
--
-- Keyed on base_asset, not the pair symbol, because that is how the
-- client already works ('BTC', appending USDT itself).
--
-- WHY THE 60-DAY RETENTION MATTERS MORE THAN IT LOOKS:
-- Binance serves klines for DELISTED pairs indefinitely, frozen at
-- whenever trading stopped. Measured live: XMRUSDT returns 30 perfectly
-- valid candles from Jan-Feb 2024, FTMUSDT from Dec 2024, AGIXUSDT from
-- Jun 2024. Without the retention cutoff those ancient candles would sit
-- here looking authoritative and could be matched against a grading
-- window they have nothing to do with. The prune is what keeps this
-- table meaning "recent price action" rather than "whatever Binance
-- last had".
--
-- Coins with no Binance listing simply have no rows, and the client
-- falls back to the current-price comparison exactly as before - but
-- without a guaranteed-to-fail cross-origin request per coin. 35 of the
-- 105 symbols called in the last 45 days are in that category, and they
-- were the entire source of the console error noise.
-- ============================================================

create table if not exists binance_daily_klines (
  base_asset text        not null,   -- 'BTC'
  open_time  timestamptz not null,   -- candle open, UTC midnight
  high       numeric,
  low        numeric,
  close      numeric,
  updated_at timestamptz not null default now(),
  primary key (base_asset, open_time)
);

create index if not exists binance_daily_klines_open_time_idx
  on binance_daily_klines (open_time);

alter table binance_daily_klines enable row level security;

drop policy if exists binance_daily_klines_public_read on binance_daily_klines;
create policy binance_daily_klines_public_read
  on binance_daily_klines for select to anon, authenticated using (true);

-- ── Verify ──────────────────────────────────────────────────────
-- select count(*) candles, count(distinct base_asset) symbols,
--        min(open_time)::date oldest, max(open_time)::date newest
--   from binance_daily_klines;
--
-- -- symbols the track record wants but that have no candles
-- -- (expected: coins with no Binance listing, plus delisted pairs
-- --  whose candles were all older than the retention cutoff)
-- with called as (select distinct upper(coin_sym) sym from signal_snapshots
--                  where snap_date >= current_date - 45)
-- select c.sym from called c
--  where not exists (select 1 from binance_daily_klines k where k.base_asset = c.sym);
