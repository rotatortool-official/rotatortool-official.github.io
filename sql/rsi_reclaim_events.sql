-- rsi_reclaim_events.sql — applied 2026-09-23 (promptove/59).
--
-- WHAT. A new coin_events type, 'rsi_reclaim': daily RSI(14) closes back
-- at or above 30 after one or more closes below it. Detected every day at
-- 00:45 UTC as part of detect_coin_events(), shown in the coin modal.
--
-- WHY THIS SIGNAL. promptove/53, Part 2. Over three years of daily
-- candles (112 tradable symbols) the reclaim split cleanly by how long the
-- coin had been below 30, 7-day excess over the market median:
--
--     days below     n     beat market    vs baseline 49.8%
--       1-2        1083       53.2%          +3.4   (z 2.25)
--       3-5         303       51.2%          +1.4
--       6-10        168       45.2%          -4.5
--       11+          58       31.0%         -18.7   (z -2.85)
--
-- In-sample, and the duration buckets were cut after the fact, so this is
-- a hypothesis with evidence, not a result. Every reclaim is recorded,
-- whatever its duration, so the live record can test the WHOLE pattern
-- (fast helps, slow hurts) and not only the flattering bucket.
--
-- FIDELITY. The RSI is recomputed here from CLOSED daily candles in
-- binance_daily_klines, with the same Wilder recursion as
-- rotator-backtest/rsi-oversold.js (checked: identical to 2 decimals on
-- BTC, SOL, MINA and UNI, 2026-09-19..22). It deliberately does NOT use
-- coin_indicator_daily.rsi14_daily: that snapshot is taken at 00:45 from
-- coin_technicals, which already includes the new day's forming candle,
-- and differs from the closed-candle RSI by 0.1-1.6 points. Near a
-- threshold that is the difference between a crossing and none.
-- Definition, as in the backtest: below means RSI < 30; the reclaim is the
-- first close with RSI >= 30; days_below counts the closes under 30
-- immediately before it.
--
-- REPAIR MARGIN. Like the crosses, the last 3 closed days are scanned, so
-- a missed run is caught the next morning with its true event_date. The
-- primary key makes a re-scan idempotent. No cooldown: the backtest had
-- none, and two reclaims in a week are two episodes.
--
-- DRY RUN before applying, 2026-06-01..09-22: 339 reclaims, 187 of them
-- fast (1-2 days), on 175 symbols, with no gaps in any symbol's candles.

alter table public.coin_events drop constraint coin_events_type_chk;
alter table public.coin_events add constraint coin_events_type_chk check (event_type = any (array[
  'golden_cross', 'death_cross', 'rsi_overbought', 'rsi_oversold',
  'futures_long_crowded', 'futures_short_crowded', 'rsi_reclaim']));

create or replace function public.detect_rsi_reclaims(p_close_date date)
returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  RSI_PERIOD  constant integer := 14;
  THRESHOLD   constant numeric := 30;
  REPAIR_DAYS constant integer := 3;
  FAST_MAX    constant integer := 2;     -- the 1-2 day bucket from promptove/53
  v_n integer;
begin
  with recursive k as (
    select base_asset, open_time::date d, close::float8 c,
           row_number() over (partition by base_asset order by open_time) n
      from public.binance_daily_klines
     where open_time::date <= p_close_date
  ),
  diffs as (
    select base_asset, n, d, c - lag(c) over (partition by base_asset order by n) ch from k
  ),
  seed as (   -- simple average of the first 14 changes, as the backtest seeds it
    select base_asset, (RSI_PERIOD + 1)::bigint n,
           avg(greatest(ch, 0)) g, avg(greatest(-ch, 0)) l
      from diffs where n between 2 and RSI_PERIOD + 1
     group by base_asset having count(*) = RSI_PERIOD
  ),
  rec(base_asset, n, g, l) as (   -- Wilder smoothing
    select * from seed
    union all
    select r.base_asset, r.n + 1,
           (r.g * (RSI_PERIOD - 1) + greatest(x.ch, 0)) / RSI_PERIOD,
           (r.l * (RSI_PERIOD - 1) + greatest(-x.ch, 0)) / RSI_PERIOD
      from rec r join diffs x on x.base_asset = r.base_asset and x.n = r.n + 1
  ),
  rsi as (
    select r.base_asset, r.n, x.d,
           case when r.l = 0 then 100 else 100 - 100 / (1 + r.g / r.l) end v
      from rec r join diffs x using (base_asset, n)
  ),
  flagged as (
    select *,
           lag(v) over w pv,
           -- closes under the line since the last close at/above it
           n - 1 - coalesce(max(case when v >= THRESHOLD then n end)
                              over (partition by base_asset order by n
                                    rows between unbounded preceding and 1 preceding),
                            RSI_PERIOD) days_below,
           -- true when the streak runs back to the start of the series, so
           -- the count is a floor rather than the real length
           max(case when v >= THRESHOLD then n end)
             over (partition by base_asset order by n
                   rows between unbounded preceding and 1 preceding) is null streak_open
      from rsi window w as (partition by base_asset order by n)
  ),
  ev as (
    select f.*,
           (select min(r2.v) from rsi r2
             where r2.base_asset = f.base_asset and r2.n between f.n - f.days_below and f.n - 1) min_rsi
      from flagged f
     where f.v >= THRESHOLD and f.pv < THRESHOLD
       and f.d between p_close_date - (REPAIR_DAYS - 1) and p_close_date
  )
  insert into public.coin_events (base_asset, event_date, event_type, value, prev_value, detail)
  select base_asset, d, 'rsi_reclaim', v, pv,
         jsonb_build_object(
           'threshold',   THRESHOLD,
           'period',      RSI_PERIOD,
           'series',      'daily, closed candles',
           'days_below',  days_below,
           'days_below_is_floor', streak_open,
           'min_rsi',     round(min_rsi::numeric, 2),
           'fast',        days_below <= FAST_MAX and not streak_open,
           'evidence',    'promptove/53: 1-2 days below beat the market over 7d 53.2% of 1,083 times; 11+ days 31.0% of 58 (in-sample, 2023-12..2026-09)')
    from ev
  on conflict (base_asset, event_date, event_type) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.detect_rsi_reclaims(date) from public, anon, authenticated;

-- Wire it into the daily detector as section 3b, without retyping the
-- rest of detect_coin_events(): its current definition is patched in
-- place, and the patch refuses to run twice or against a shape it does
-- not recognise.
do $$
declare
  src text := pg_get_functiondef('public.detect_coin_events'::regproc);
  anchor text := '  -- 4. Extreme futures positioning.';
begin
  if position('detect_rsi_reclaims' in src) > 0 then
    raise notice 'detect_coin_events already calls detect_rsi_reclaims; nothing to do';
    return;
  end if;
  if position(anchor in src) = 0 then
    raise exception 'anchor not found in detect_coin_events; patch by hand';
  end if;
  src := replace(src, anchor,
    '  -- 3b. RSI reclaim (rsi_reclaim_events.sql, promptove/59): back at or above' || chr(10) ||
    '  -- 30 after closes below it, on closed-candle RSI. Scans the last 3 days.' || chr(10) ||
    '  v_events := v_events + public.detect_rsi_reclaims(v_close_date);' || chr(10) || chr(10) ||
    anchor);
  execute src;
end $$;
