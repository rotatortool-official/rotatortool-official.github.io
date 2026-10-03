-- ============================================================
-- funding_shadow_daily — the hidden live record of high funding
-- (promptove/81 follow-up (a), promptove/83). Added 2026-10-03.
--
-- The backtest (rotator-backtest/take-profit-followups.js) found that a
-- coin whose 7-day average funding was >= 0.03% per 8h fell 30%+ within
-- 90 days more often than other perpetuals on the same day (+6.1 pts,
-- +11.2 since late 2023), but the 2021-23 half missed the pre-registered
-- bar. Not a call, not a warning on the site. Daniel asked for it to be
-- recorded live so new data can settle it.
--
-- One row per perpetual per day, written by sync-rotation-snapshot at
-- 19:07 UTC (SHADOW 5). EVERY perpetual is recorded, hot or not: the
-- not-hot ones are the same-day control. Graded by
-- rotator-backtest/funding-verdict.js. Nothing on the site reads it.
-- ============================================================

create table if not exists public.funding_shadow_daily (
  snap_date        date        not null,
  base_asset       text        not null,
  symbol           text        not null,
  funding_7d_8h    numeric     not null,  -- mean funding over 7 days, per 8 hours (fraction, 0.0003 = 0.03%)
  funding_7d_raw   numeric     not null,  -- the same, per the symbol's own payment interval
  interval_hours   integer     not null,  -- Binance funding interval used to normalise (default 8)
  hours_seen       integer     not null,  -- hourly snapshots behind the mean (168 = a full week)
  ret_60d          numeric,               -- close / close 60 days earlier - 1, from binance_daily_klines (null if missing)
  long_short_ratio numeric,               -- at write time, for later reading only
  created_at       timestamptz not null default now(),
  primary key (snap_date, base_asset)
);

alter table public.funding_shadow_daily enable row level security;
drop policy if exists funding_shadow_daily_read on public.funding_shadow_daily;
create policy funding_shadow_daily_read on public.funding_shadow_daily for select using (true);

-- 7-day mean of the hourly funding snapshots, per symbol, in one call.
create or replace function public.funding_7d_means()
returns table(symbol text, mean_rate numeric, hours_seen integer)
language sql stable security definer set search_path = public as $$
  select h.symbol, avg(h.funding_rate)::numeric, count(*)::integer
    from public.binance_futures_history h
   where h.bucket > now() - interval '7 days'
     and h.funding_rate is not null
   group by h.symbol
$$;
revoke all on function public.funding_7d_means() from public, anon, authenticated;
grant execute on function public.funding_7d_means() to service_role;
