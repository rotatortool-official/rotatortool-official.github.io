-- turn_signs_since(p_days) — how every recent turn sign has done since it
-- appeared (promptove/76). Daniel, 2026-09-27: "what if I had bought
-- when the signal fired".
--
-- Same measure as the live tests (rotator-backtest/turn-live-verdict.js):
--   entry  = the close of the event day
--   exit   = the latest COMPLETED daily close (today's forming candle is
--            never used, as entry or exit)
--   ret    = the coin's return between them, %
--   mkt    = the median return of every coin in binance_daily_klines over
--            the same two closes, %
--   excess = ret - mkt
-- Every event is returned, winners and losers alike. An event on the
-- latest completed day has no result yet (days = 0) and is returned with
-- nulls, so the page can say "too early".
--
-- Read-only, public: coin_events and binance_daily_klines are already
-- readable by anon; this only saves the page from downloading them.

create or replace function public.turn_signs_since(p_days int default 30)
returns table (
  base_asset text, event_type text, event_date date,
  entry numeric, last_close numeric, last_date date, days int,
  ret numeric, mkt numeric, excess numeric
)
language sql stable security definer set search_path = public as $$
  with last_day as (
    select max(open_time::date) d from binance_daily_klines
    where open_time < date_trunc('day', now() at time zone 'utc')
  ),
  closes as (
    select k.base_asset, k.open_time::date d, k.close
    from binance_daily_klines k, last_day l
    where k.open_time::date >= l.d - (least(greatest(p_days, 1), 60) + 1) and k.open_time::date <= l.d
  ),
  ev as (
    select e.base_asset, e.event_type, e.event_date
    from coin_events e, last_day l
    where e.event_date >= l.d - least(greatest(p_days, 1), 60) and e.event_date <= l.d
  ),
  latest as (
    select c.base_asset, c.close from closes c, last_day l where c.d = l.d
  ),
  mkt as (
    select x.event_date,
           percentile_cont(0.5) within group (order by (lt.close / nullif(st.close, 0) - 1) * 100) as med
    from (select distinct event_date from ev) x
    join closes st on st.d = x.event_date
    join latest lt on lt.base_asset = st.base_asset
    where st.close > 0
    group by x.event_date
  )
  select ev.base_asset, ev.event_type, ev.event_date,
         st.close, lt.close, l.d, (l.d - ev.event_date)::int,
         case when l.d > ev.event_date then round((lt.close / nullif(st.close, 0) - 1) * 100, 2) end,
         case when l.d > ev.event_date then round(m.med::numeric, 2) end,
         case when l.d > ev.event_date then round((lt.close / nullif(st.close, 0) - 1) * 100 - m.med::numeric, 2) end
  from ev
  cross join last_day l
  left join closes st on st.base_asset = ev.base_asset and st.d = ev.event_date
  left join latest lt on lt.base_asset = ev.base_asset
  left join mkt m on m.event_date = ev.event_date
  order by ev.event_date desc, ev.base_asset;
$$;

revoke all on function public.turn_signs_since(int) from public;
grant execute on function public.turn_signs_since(int) to anon, authenticated;
