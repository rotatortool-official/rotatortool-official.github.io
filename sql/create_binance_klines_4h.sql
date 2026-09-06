-- ============================================================
-- create_binance_klines_4h.sql
--
-- Raw 4h candles powering the Pro Insight Engine's RSI / MACD /
-- Bollinger signals, cached server-side so js/signals.js stops calling
-- api.binance.com from the browser. This was the LAST of the four
-- direct Binance calls the website made.
--
-- RAW CANDLES, NOT COMPUTED INDICATORS — on purpose.
-- Storing rsi/macd/bb would mean reimplementing _calcRSI, _calcMACD and
-- _calcBollinger in TypeScript, creating a second copy of that maths to
-- drift out of sync with js/signals.js. This project has already been
-- bitten by exactly that failure mode — three separate scoring
-- implementations, which is what rotator-engine/ exists to undo (see
-- promptove/). Caching the INPUTS lets the client keep its existing
-- functions unchanged, so there is still one implementation.
--
-- float8 rather than numeric: PostgREST returns numeric as JSON STRINGS
-- to preserve precision, which would have forced a conversion layer on
-- the client. The client already did parseFloat on these values, so
-- float8 is both faithful and simpler — it comes back as JSON numbers
-- and the arrays drop straight into the existing indicator functions.
--
-- Verified end to end: BTC/ETH/SOL each return 100 closes + 100 volumes,
-- and feeding them to the page's own _calcRSI/_calcMACD/_calcBollinger
-- produced RSI 54 / 57.4 / 61.6 with correct MACD {line,signal,hist} and
-- Bollinger {upper,lower,mid,width,pctB} shapes.
--
-- UNIVERSE: the site's coins that Binance actually trades (117 of 177).
-- Holdings and watchlists are per-visitor and unknowable server-side, so
-- this covers everything a visitor could hold. Coins with no Binance
-- pair — including every bStock — simply have no row, and signals.js
-- falls back to its proxy RSI exactly as it did when a fetch failed.
-- ============================================================

create table if not exists binance_klines_4h (
  base_asset   text primary key,     -- 'BTC'
  closes       double precision[],   -- oldest -> newest, ~100 candles
  volumes      double precision[],   -- aligned with closes
  candle_count integer,
  updated_at   timestamptz not null default now()
);

alter table binance_klines_4h enable row level security;

drop policy if exists binance_klines_4h_public_read on binance_klines_4h;
create policy binance_klines_4h_public_read
  on binance_klines_4h for select to anon, authenticated using (true);

-- ── Verify ──────────────────────────────────────────────────────
-- select count(*) symbols, min(candle_count) shortest, max(updated_at) fresh
--   from binance_klines_4h;
--
-- select base_asset, candle_count, array_length(closes,1) closes_len
--   from binance_klines_4h where base_asset in ('BTC','ETH','SOL');
