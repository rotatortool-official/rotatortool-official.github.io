-- Per-coin technical indicators, computed server-side.
-- Applied 2026-09-06 via the Supabase connector. This file is the record.
--
-- Computed inside sync-binance-daily-klines because that function already
-- holds every close in memory when it runs. Deriving these in the browser
-- would mean shipping ~140 candles x ~114 coins to every visitor and
-- recomputing them per tab; instead the ~16,000 candle rows never leave
-- Supabase and the page reads one small row per coin.
--
-- NULL MEANS "NOT COMPUTABLE", NEVER "ZERO" OR "NEUTRAL".
-- A coin with 40 bars has no 125-day MA and no weekly RSI. The UI must
-- render that as absent, not as a low value -- a heatmap that paints
-- missing data as cold invents a signal that was never measured.
--
-- cross_state is a 60/125 MA cross, NOT the classic 50/200:
--   'golden' -- fast MA above slow MA
--   'death'  -- fast MA below slow MA
--   null     -- fewer than 125 bars, so neither can be said
--
-- 50/200 would need 200 candles just to state which side a coin is on.
-- 60/125 is a recognised shorter-horizon variant (roughly 3-month vs
-- 6-month in trading days) and fits the 140-candle window. The periods
-- live in CROSS_FAST/CROSS_SLOW in the function and are surfaced in the
-- UI label, so nobody has to guess which two lines crossed.
--
-- cross_days_ago is how long ago the last flip happened, and is null when
-- the flip predates the stored window. With 140 bars and a 125-bar MA
-- there are only ~15 days on which the slow MA exists at all, so an older
-- cross is real but not datable from what we keep. Reporting the state
-- while admitting the date is unknown beats inventing a date.
--
-- First run: 114 rows, 24 golden / 90 death, weekly RSI on all 114.

create table if not exists public.coin_technicals (
  base_asset     text        not null primary key,
  rsi14_daily    numeric,
  rsi14_weekly   numeric,
  ma_fast        numeric,
  ma_slow        numeric,
  cross_state    text,
  cross_days_ago integer,
  bars_used      integer     not null default 0,
  updated_at     timestamptz not null default now(),
  constraint coin_technicals_cross_state_chk
    check (cross_state is null or cross_state in ('golden','death'))
);

alter table public.coin_technicals enable row level security;

drop policy if exists "public read" on public.coin_technicals;
create policy "public read"
  on public.coin_technicals for select to public using (true);

-- ma_fast/ma_slow were first created as ma50/ma200, named for the classic
-- golden-cross periods. The cross actually computed is 60/125, so those
-- names would have claimed periods the numbers were never calculated
-- from. Renamed in the same session; the generic names also stay correct
-- if the periods are retuned again.
--   alter table public.coin_technicals rename column ma50  to ma_fast;
--   alter table public.coin_technicals rename column ma200 to ma_slow;
