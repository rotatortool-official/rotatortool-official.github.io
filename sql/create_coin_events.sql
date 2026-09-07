-- ============================================================
-- create_coin_events.sql
--
-- Daily indicator history + detected technical events, for the
-- Telegram "what crossed a threshold" report.
--
-- APPLIED 2026-09-07 via the Supabase connector (migration name: create_coin_events).
-- First run: 114 snapshotted, 6 cross events. Second run: 0 events (idempotent).
--
-- WHY TWO TABLES AND NOT ONE:
--   coin_indicator_daily is the RECORD  -- what each indicator read on
--                                          each completed UTC day.
--   coin_events          is the FINDING -- the crossings derived from it.
-- The record has to exist first, because coin_technicals holds ONE row
-- per coin and is overwritten every 3 hours. Today it is impossible to
-- answer "was RSI below 80 yesterday?" from anything in this database,
-- so "RSI crossed 80" is currently undetectable, not merely uncomputed.
-- Golden/death crosses are the exception: coin_technicals.cross_days_ago
-- is derived from the MA series itself and needs no history from us.
--
-- WHY THE UNIVERSE IS NOT FILTERED BY HOLDINGS:
-- An earlier draft gated this on my_holdings, the way send-telegram-alerts
-- gates its take-profit side. Dropped deliberately: a cross or an RSI
-- extreme is a fact about the coin, not about who owns it, and with more
-- than one visitor a per-user filter would emit contradictory reports
-- from identical market data. The Holdings panel stays what it always
-- was -- a private, in-browser comparison tool (localStorage 'rot_h5',
-- js/holdings.js). Nothing here reads it.
--
-- NO MATHS IS DUPLICATED HERE, ON PURPOSE.
-- RSI and the 60/125 MA cross are computed in exactly one place --
-- sync-binance-daily-klines, which already holds every close in memory.
-- This snapshot COPIES those values; it never recomputes them. The last
-- time two components derived the same number independently, the bot and
-- the website gave opposite advice on the same data (see the header of
-- supabase/functions/send-telegram-alerts/index.ts).
--
-- NULL MEANS "NOT COMPUTABLE", NEVER "ZERO" OR "NEUTRAL".
-- Inherited from coin_technicals and enforced below: every crossing rule
-- requires BOTH sides non-NULL. This is the easiest rule in the file to
-- break by accident, because `null < 80` is not false, it is unknown --
-- `where rsi < 80` silently drops those rows and `where not (rsi >= 80)`
-- silently keeps them. Neither is what we mean.
--
-- DATE SEMANTICS, one meaning throughout:
--   as_of_date  -- the completed UTC day the reading represents
--   event_date  -- the day the event actually HAPPENED
--   detected_at -- when we noticed
-- For RSI and futures the first two coincide. For crosses they do not:
-- a cross confirmed on the candle that closed at 00:00 UTC happened
-- YESTERDAY, and dating it today would leave the history quietly wrong
-- for any later analysis of whether these events predicted anything.
-- ============================================================

-- == The record ==================================================
create table if not exists public.coin_indicator_daily (
  base_asset            text        not null,
  as_of_date            date        not null,   -- completed UTC day
  rsi14_daily           numeric,
  rsi14_weekly          numeric,
  ma_fast               numeric,                -- 60-day
  ma_slow               numeric,                -- 125-day
  cross_state           text,                   -- 'golden' | 'death' | null
  cross_days_ago        integer,
  bars_used             integer,
  long_short_ratio      numeric,
  taker_buy_sell_ratio  numeric,

  -- TWO source timestamps, for the same reason binance_futures_metrics
  -- carries two: technicals refresh every 3h, futures rotate per symbol
  -- roughly hourly. A single captured_at would misrepresent one of them,
  -- and a row whose futures reading is six hours old must not be read as
  -- "the ratio at the close".
  technicals_updated_at timestamptz,
  futures_updated_at    timestamptz,
  captured_at           timestamptz not null default now(),

  primary key (base_asset, as_of_date),
  constraint coin_indicator_daily_cross_state_chk
    check (cross_state is null or cross_state in ('golden','death'))
);

create index if not exists coin_indicator_daily_as_of_date_idx
  on public.coin_indicator_daily (as_of_date);

-- == The finding =================================================
create table if not exists public.coin_events (
  base_asset   text        not null,
  event_date   date        not null,   -- when it HAPPENED
  event_type   text        not null,
  value        numeric,                -- reading that triggered it
  prev_value   numeric,                -- the reading before it
  -- Thresholds and periods AS THEY STOOD AT DETECTION, so a message can
  -- say "60/125 MA" or "threshold 80" without the reader having to trust
  -- that the constants were never retuned since.
  detail       jsonb,
  detected_at  timestamptz not null default now(),
  -- Exactly-once delivery. The sender stamps this only after Telegram
  -- accepted the message; a retry or a second cron tick then finds
  -- nothing left to resend.
  notified_at  timestamptz,

  primary key (base_asset, event_date, event_type),
  constraint coin_events_type_chk check (event_type in (
    'golden_cross','death_cross',
    'rsi_overbought','rsi_oversold',
    'futures_long_crowded','futures_short_crowded'
  ))
);

create index if not exists coin_events_unsent_idx
  on public.coin_events (event_date) where notified_at is null;

alter table public.coin_indicator_daily enable row level security;
alter table public.coin_events           enable row level security;

drop policy if exists coin_indicator_daily_public_read on public.coin_indicator_daily;
create policy coin_indicator_daily_public_read
  on public.coin_indicator_daily for select to anon, authenticated using (true);

drop policy if exists coin_events_public_read on public.coin_events;
create policy coin_events_public_read
  on public.coin_events for select to anon, authenticated using (true);


-- ============================================================
-- detect_coin_events -- snapshot the day, then derive the crossings.
--
-- Pure SQL rather than an Edge Function: there is nothing to fetch. Both
-- inputs are already in this database, and keeping it here means the RSI
-- and MA maths cannot drift into a second implementation.
--
-- Designed to run shortly after 00:00 UTC, once sync-binance-daily-klines
-- (23 */3 * * *) has refreshed against the just-closed candle. Running it
-- later in the day still targets the same as_of_date and simply
-- overwrites that row with values that include more of the current day --
-- harmless for a manual test, wrong as a schedule.
-- ============================================================
create or replace function public.detect_coin_events(p_now timestamptz default now())
returns table (snapshotted integer, events_inserted integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  -- RSI bands are deliberately ASYMMETRIC. The classic pairs are 70/30
  -- or 80/20; 80/30 is what was specified for this report. Named here so
  -- a later reader sees a decision rather than a typo to be "fixed".
  RSI_OVERBOUGHT    constant numeric  := 80;
  RSI_OVERSOLD      constant numeric  := 30;

  LS_LONG_CROWDED   constant numeric  := 3.0;          -- >= 3 : 1
  LS_SHORT_CROWDED  constant numeric  := 1.0 / 3.0;    -- <= 1 : 3

  -- Mirrors CROSS_FAST/CROSS_SLOW in sync-binance-daily-klines. Recorded
  -- into detail so the message can name the two lines that crossed --
  -- this is NOT the classic 50/200, and a reader who assumes it is will
  -- misread every cross report.
  CROSS_FAST        constant integer  := 60;
  CROSS_SLOW        constant integer  := 125;

  -- Crosses fire on the CONFIRMED close, not on today's forming candle.
  -- The window is 1..3 rather than exactly 1 so that a day the job fails
  -- to run does not lose the cross forever -- at =1 only, a missed run
  -- means the event sits at =2 the next morning and is never reported.
  -- The primary key and the cooldown make re-detection a no-op, so the
  -- wider window costs nothing. This is a repair margin, not a backfill:
  -- event_date still carries the true date, so nothing can claim to have
  -- "just happened" when it did not.
  CROSS_MIN_AGE     constant integer  := 1;
  CROSS_MAX_AGE     constant integer  := 3;

  -- Transition-only detection already stops a coin SITTING at RSI 85
  -- from being reported daily. It does nothing about a value oscillating
  -- across the line (79.8 -> 80.1 -> 79.7 -> 80.2), which is exactly what
  -- happens at a threshold. This is the layer that stops that.
  COOLDOWN_DAYS     constant integer  := 7;

  -- A failed sync must not be recorded as a measurement. Without this,
  -- yesterday's values get written under today's date and manufacture a
  -- "no change" that was never observed.
  STALE_AFTER       constant interval := interval '12 hours';

  -- If the previous snapshot is older than this, there is no comparison
  -- to make. Treating a three-week-old reading as "yesterday" would
  -- invent a crossing across a gap we never watched.
  PREV_MAX_GAP_DAYS constant integer  := 5;

  RETAIN_DAYS       constant integer  := 400;

  v_close_date date    := (p_now at time zone 'UTC')::date - 1;
  v_snap       integer := 0;
  v_events     integer := 0;
  v_n          integer := 0;
begin
  -- -- 1. Snapshot the completed day --------------------------------
  -- base_asset is unique in binance_futures_metrics (symbol is the PK,
  -- but the sync keeps one USDT pair per asset), so a plain left join
  -- cannot fan out. Verified against the live table before writing this.
  --
  -- The futures join carries its own freshness test: a stale ratio
  -- becomes NULL rather than being recorded as the day's reading, and
  -- NULL correctly yields no event. 10 of the 114 tracked coins have no
  -- futures listing at all and land here as NULL for the same reason.
  insert into public.coin_indicator_daily (
    base_asset, as_of_date,
    rsi14_daily, rsi14_weekly, ma_fast, ma_slow,
    cross_state, cross_days_ago, bars_used,
    long_short_ratio, taker_buy_sell_ratio,
    technicals_updated_at, futures_updated_at
  )
  select
    t.base_asset, v_close_date,
    t.rsi14_daily, t.rsi14_weekly, t.ma_fast, t.ma_slow,
    t.cross_state, t.cross_days_ago, t.bars_used,
    f.long_short_ratio, f.taker_buy_sell_ratio,
    t.updated_at, f.detail_updated_at
  from public.coin_technicals t
  left join public.binance_futures_metrics f
         on f.base_asset = t.base_asset
        and f.detail_updated_at >= p_now - STALE_AFTER
  where t.updated_at >= p_now - STALE_AFTER
  on conflict (base_asset, as_of_date) do update set
    rsi14_daily           = excluded.rsi14_daily,
    rsi14_weekly          = excluded.rsi14_weekly,
    ma_fast               = excluded.ma_fast,
    ma_slow               = excluded.ma_slow,
    cross_state           = excluded.cross_state,
    cross_days_ago        = excluded.cross_days_ago,
    bars_used             = excluded.bars_used,
    long_short_ratio      = excluded.long_short_ratio,
    taker_buy_sell_ratio  = excluded.taker_buy_sell_ratio,
    technicals_updated_at = excluded.technicals_updated_at,
    futures_updated_at    = excluded.futures_updated_at,
    captured_at           = now();
  get diagnostics v_snap = row_count;

  -- -- 2. Golden / death crosses ------------------------------------
  -- Dated from the technicals row's OWN refresh date, not from p_now, so
  -- the event lands on the right day even if this runs late.
  insert into public.coin_events
    (base_asset, event_date, event_type, value, prev_value, detail)
  select
    t.base_asset,
    (t.updated_at at time zone 'UTC')::date - t.cross_days_ago,
    case t.cross_state when 'golden' then 'golden_cross' else 'death_cross' end,
    null, null,   -- value/prev_value are for threshold crossings; the two
                  -- MAs live in detail, where they can be named.
    jsonb_build_object(
      'ma_fast',        t.ma_fast,
      'ma_slow',        t.ma_slow,
      'ma_fast_period', CROSS_FAST,
      'ma_slow_period', CROSS_SLOW,
      'cross_days_ago', t.cross_days_ago,
      'bars_used',      t.bars_used,
      'confirmed_on',   'completed daily candle'
    )
  from public.coin_technicals t
  where t.updated_at    >= p_now - STALE_AFTER
    and t.cross_state    is not null
    and t.cross_days_ago is not null
    and t.cross_days_ago between CROSS_MIN_AGE and CROSS_MAX_AGE
    and not exists (
      select 1 from public.coin_events e
       where e.base_asset = t.base_asset
         and e.event_type = case t.cross_state when 'golden' then 'golden_cross' else 'death_cross' end
         and e.event_date > ((t.updated_at at time zone 'UTC')::date - t.cross_days_ago) - COOLDOWN_DAYS
    )
  on conflict (base_asset, event_date, event_type) do nothing;
  get diagnostics v_n = row_count;
  v_events := v_events + v_n;

  -- -- 3. RSI(14) daily crossing 80 / 30 ----------------------------
  -- Weekly RSI is snapshotted too but not reported on: a weekly series
  -- crossing a band is a much rarer and slower event, and mixing the two
  -- in one report would make "RSI moved above 80" ambiguous about which
  -- series moved.
  with cur as (
    select d.base_asset, d.rsi14_daily
      from public.coin_indicator_daily d
     where d.as_of_date  = v_close_date
       and d.rsi14_daily is not null
  ),
  prev as (
    select distinct on (d.base_asset)
           d.base_asset, d.as_of_date, d.rsi14_daily
      from public.coin_indicator_daily d
     where d.as_of_date <  v_close_date
       and d.as_of_date >= v_close_date - PREV_MAX_GAP_DAYS
       and d.rsi14_daily is not null
     order by d.base_asset, d.as_of_date desc
  )
  insert into public.coin_events
    (base_asset, event_date, event_type, value, prev_value, detail)
  select
    c.base_asset, v_close_date,
    case when c.rsi14_daily >= RSI_OVERBOUGHT then 'rsi_overbought' else 'rsi_oversold' end,
    c.rsi14_daily, p.rsi14_daily,
    jsonb_build_object(
      'threshold', case when c.rsi14_daily >= RSI_OVERBOUGHT then RSI_OVERBOUGHT else RSI_OVERSOLD end,
      'period',    14,
      'series',    'daily',
      'prev_as_of_date', p.as_of_date
    )
  from cur c
  join prev p on p.base_asset = c.base_asset
  where (
          (p.rsi14_daily <  RSI_OVERBOUGHT and c.rsi14_daily >= RSI_OVERBOUGHT)
       or (p.rsi14_daily >  RSI_OVERSOLD   and c.rsi14_daily <= RSI_OVERSOLD)
        )
    and not exists (
      select 1 from public.coin_events e
       where e.base_asset = c.base_asset
         and e.event_type = case when c.rsi14_daily >= RSI_OVERBOUGHT then 'rsi_overbought' else 'rsi_oversold' end
         and e.event_date > v_close_date - COOLDOWN_DAYS
    )
  on conflict (base_asset, event_date, event_type) do nothing;
  get diagnostics v_n = row_count;
  v_events := v_events + v_n;

  -- -- 4. Extreme futures positioning -------------------------------
  -- globalLongShortAccountRatio, written by sync-binance-futures on a
  -- per-symbol staleness rotation. Crossing INTO the extreme is the
  -- event; sitting there is not.
  with cur as (
    select d.base_asset, d.long_short_ratio
      from public.coin_indicator_daily d
     where d.as_of_date       = v_close_date
       and d.long_short_ratio is not null
  ),
  prev as (
    select distinct on (d.base_asset)
           d.base_asset, d.as_of_date, d.long_short_ratio
      from public.coin_indicator_daily d
     where d.as_of_date       <  v_close_date
       and d.as_of_date       >= v_close_date - PREV_MAX_GAP_DAYS
       and d.long_short_ratio is not null
     order by d.base_asset, d.as_of_date desc
  )
  insert into public.coin_events
    (base_asset, event_date, event_type, value, prev_value, detail)
  select
    c.base_asset, v_close_date,
    case when c.long_short_ratio >= LS_LONG_CROWDED then 'futures_long_crowded' else 'futures_short_crowded' end,
    c.long_short_ratio, p.long_short_ratio,
    jsonb_build_object(
      'threshold', case when c.long_short_ratio >= LS_LONG_CROWDED then LS_LONG_CROWDED else LS_SHORT_CROWDED end,
      'source',    'binance globalLongShortAccountRatio',
      'prev_as_of_date', p.as_of_date
    )
  from cur c
  join prev p on p.base_asset = c.base_asset
  where (
          (p.long_short_ratio <  LS_LONG_CROWDED  and c.long_short_ratio >= LS_LONG_CROWDED)
       or (p.long_short_ratio >  LS_SHORT_CROWDED and c.long_short_ratio <= LS_SHORT_CROWDED)
        )
    and not exists (
      select 1 from public.coin_events e
       where e.base_asset = c.base_asset
         and e.event_type = case when c.long_short_ratio >= LS_LONG_CROWDED then 'futures_long_crowded' else 'futures_short_crowded' end
         and e.event_date > v_close_date - COOLDOWN_DAYS
    )
  on conflict (base_asset, event_date, event_type) do nothing;
  get diagnostics v_n = row_count;
  v_events := v_events + v_n;

  -- -- 5. Bound the history -----------------------------------------
  -- 114 rows/day is ~42k a year. 400 days keeps a full year of
  -- comparisons available with margin, which is what a later "did these
  -- events predict anything?" pass would need. coin_events is never
  -- pruned -- it is tiny, and it is the audit trail.
  delete from public.coin_indicator_daily
   where as_of_date < v_close_date - RETAIN_DAYS;

  return query select v_snap, v_events;
end;
$fn$;

revoke all on function public.detect_coin_events(timestamptz) from public, anon, authenticated;

-- == Verify ======================================================
-- -- Dry run for the last completed day. Safe to repeat: every write
-- -- either upserts or does nothing on conflict.
-- select * from public.detect_coin_events();
--
-- -- DAY 1 EXPECTATION: ~114 snapshotted, and ZERO rsi_/futures_ events,
-- -- because those need a previous day's row that does not exist yet.
-- -- Cross events CAN appear on day 1 -- cross_days_ago comes from the MA
-- -- series, not from our history. A first run reporting no RSI events is
-- -- the design working, not a failure.
--
-- select event_type, count(*) from public.coin_events group by 1 order by 2 desc;
--
-- select base_asset, event_date, event_type, value, prev_value, detail
--   from public.coin_events order by detected_at desc limit 20;
--
-- -- Coverage of the record, and how much of it can support futures events
-- select as_of_date, count(*) coins,
--        count(rsi14_daily)      with_rsi,
--        count(long_short_ratio) with_ls
--   from public.coin_indicator_daily group by 1 order by 1 desc limit 10;
