-- ============================================================
-- market_events.sql — "fewer, better posts" (HANDOVER.md Task 2)
--
-- The Telegram channel posts a market event only when one of these
-- changes happened and held (thresholds in PRODUCT-FLOW.md, measured
-- in promptove/78 over 91 weeks of history):
--
--   btc200      BTC closes more than 2% past its 200-day average, on the
--               other side from before, 3 days in a row.        (4 in 91 wk)
--   breadth     share of listed coins above their own 50-day average
--               goes from under 25% to over 50% and holds 5 days, or
--               from over 75% to under 50% and holds 5 days.     (10)
--   leadership  the group with the highest median 30-day return (BTC,
--               ranks 2-20, ranks 101-250 of the list) changes, leads
--               the next by 3 points or more, and holds 7 days.  (7)
--
-- Coin-level posts are held back: the quick RSI bounce showed no edge
-- on the live list (49.7% of 1,636 vs the median coin over 7 days).
-- Coin signs stay on the site and in Pro DMs.
--
-- market_daily     one row per closed UTC day: the readings the rules
--                  use. Backfilled from the replay; extended daily.
-- market_events    one row per event, posted_at set by the bot, graded
--                  after 7 and 30 days by grade_market_events().
--
-- Every rule is re-run over all of market_daily on each call, so the
-- state (which side BTC is on, whether breadth is armed, who leads)
-- is derived, never stored. Events are only written from GO_LIVE on;
-- the replayed history lives in promptove/78, not in this table.
-- ============================================================

create table if not exists public.market_daily (
  day          date primary key,
  btc_close    numeric,
  btc_ma200    numeric,
  breadth      numeric,          -- % of listed coins above their 50-day average
  breadth_n    integer,          -- coins counted
  ret30_btc    numeric,          -- 30-day return, %
  ret30_large  numeric,          -- median of ranks 2-20
  ret30_small  numeric,          -- median of ranks 101-250
  source       text not null default 'live',   -- 'replay' for the backfill
  computed_at  timestamptz not null default now()
);

create table if not exists public.market_events (
  id           bigserial primary key,
  kind         text not null check (kind in ('btc200', 'breadth', 'leadership')),
  event_date   date not null,    -- the closed day the rule completed on
  side         text not null,    -- above/below, up/down, or the new leader
  detail       jsonb not null default '{}'::jsonb,
  detected_at  timestamptz not null default now(),
  posted_at    timestamptz,      -- set by the bot when it goes out
  grade_7d     boolean,          -- did the described move hold?
  grade_30d    boolean,
  graded_at    timestamptz,
  unique (kind, event_date)
);

alter table public.market_daily  enable row level security;
alter table public.market_events enable row level security;
drop policy if exists "public read" on public.market_daily;
drop policy if exists "public read" on public.market_events;
create policy "public read" on public.market_daily  for select using (true);
create policy "public read" on public.market_events for select using (true);
revoke insert, update, delete, truncate on public.market_daily  from anon, authenticated;
revoke insert, update, delete, truncate on public.market_events from anon, authenticated;

-- ── Today's reading, from closed candles only ───────────────────
-- The klines table includes the candle still forming (open_time =
-- today); every query below stops at yesterday.
create or replace function public.compute_market_daily(p_day date default (now() at time zone 'utc')::date - 1)
returns void language plpgsql security definer set search_path = public as $$
declare
  listed  text[];
  large   text[];
  small   text[];
  v_btc   numeric;
  v_ma    numeric;
  v_br    numeric;
  v_n     integer;
begin
  -- The weekly list, as tickers, ordered by market cap (BTC and stables out).
  select array_agg(sym order by mcap desc) into listed from (
    select upper(m->>'symbol') sym, coalesce((m->>'market_cap')::numeric, 0) mcap
    from market_cache c, jsonb_array_elements(c.data) m
    where c.cache_key = 'cg_markets_all'
      and m->>'id' <> 'bitcoin'
      and m->>'id' not in (select jsonb_array_elements_text(data->'stables') from market_cache where cache_key = 'coin_universe')
  ) x;
  large := listed[1:19];
  small := listed[100:249];

  select close into v_btc from binance_daily_klines
   where base_asset = 'BTC' and open_time::date = p_day;
  select ma200 into v_ma from market_cycle where symbol = 'BTC';

  -- Breadth: coins with at least 50 closes up to p_day, close above their 50-day mean.
  with w as (
    select base_asset, open_time::date d, close,
           avg(close) over (partition by base_asset order by open_time rows between 49 preceding and current row) ma50,
           count(*)   over (partition by base_asset order by open_time rows between 49 preceding and current row) n50
    from binance_daily_klines
    where base_asset = any(listed) and open_time::date <= p_day and open_time::date > p_day - 80
  )
  select round(100.0 * count(*) filter (where close > ma50) / nullif(count(*), 0), 2), count(*)
    into v_br, v_n
  from w where d = p_day and n50 = 50;

  insert into market_daily (day, btc_close, btc_ma200, breadth, breadth_n, ret30_btc, ret30_large, ret30_small, source, computed_at)
  select p_day, v_btc, v_ma,
         case when v_n >= 50 then v_br end, v_n,
         (select round(100 * (a.close / b.close - 1), 3) from binance_daily_klines a, binance_daily_klines b
           where a.base_asset = 'BTC' and b.base_asset = 'BTC' and a.open_time::date = p_day and b.open_time::date = p_day - 30),
         (select round(percentile_cont(0.5) within group (order by 100 * (a.close / b.close - 1))::numeric, 3)
            from binance_daily_klines a join binance_daily_klines b using (base_asset)
           where a.base_asset = any(large) and a.open_time::date = p_day and b.open_time::date = p_day - 30),
         (select round(percentile_cont(0.5) within group (order by 100 * (a.close / b.close - 1))::numeric, 3)
            from binance_daily_klines a join binance_daily_klines b using (base_asset)
           where a.base_asset = any(small) and a.open_time::date = p_day and b.open_time::date = p_day - 30),
         'live', now()
  on conflict (day) do update set
    btc_close = excluded.btc_close, btc_ma200 = excluded.btc_ma200, breadth = excluded.breadth,
    breadth_n = excluded.breadth_n, ret30_btc = excluded.ret30_btc, ret30_large = excluded.ret30_large,
    ret30_small = excluded.ret30_small, source = 'live', computed_at = now();
end $$;

-- ── The rules, re-run over all of market_daily ──────────────────
create or replace function public.detect_market_events(p_go_live date default '2026-10-02')
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  -- btc200
  b_conf text; b_pend text; b_run int := 0; b_side text;
  -- breadth
  armed_up bool := false; armed_dn bool := false; run_u int := 0; run_d int := 0;
  -- leadership
  leader text; cand text; l_run int := 0; top text; first_v numeric; second_v numeric; best text;
  n_new int := 0;
begin
  for r in select * from market_daily order by day loop
    -- btc200: 2% buffer, 3 closes
    if r.btc_close is not null and r.btc_ma200 is not null then
      b_side := case when r.btc_close > r.btc_ma200 * 1.02 then 'above'
                     when r.btc_close < r.btc_ma200 * 0.98 then 'below' end;
      if b_side is null or b_side = b_conf then b_run := 0; b_pend := null;
      else
        if b_side = b_pend then b_run := b_run + 1; else b_pend := b_side; b_run := 1; end if;
        if b_run >= 3 then
          if b_conf is not null and r.day >= p_go_live then
            insert into market_events (kind, event_date, side, detail)
            values ('btc200', r.day, b_side, jsonb_build_object('close', r.btc_close, 'ma200', r.btc_ma200,
                    'pct', round(100 * (r.btc_close / r.btc_ma200 - 1), 2)))
            on conflict do nothing;
            if found then n_new := n_new + 1; end if;
          end if;
          b_conf := b_side; b_run := 0; b_pend := null;
        end if;
      end if;
    end if;

    -- breadth: 25 / 50 / 75, 5 days
    if r.breadth is not null then
      if r.breadth < 25 then armed_up := true; end if;
      if r.breadth > 75 then armed_dn := true; end if;
      run_u := case when armed_up and r.breadth > 50 then run_u + 1 else 0 end;
      run_d := case when armed_dn and r.breadth < 50 then run_d + 1 else 0 end;
      if run_u >= 5 then
        if r.day >= p_go_live then
          insert into market_events (kind, event_date, side, detail)
          values ('breadth', r.day, 'up', jsonb_build_object('breadth', r.breadth, 'coins', r.breadth_n))
          on conflict do nothing;
          if found then n_new := n_new + 1; end if;
        end if;
        armed_up := false; run_u := 0;
      end if;
      if run_d >= 5 then
        if r.day >= p_go_live then
          insert into market_events (kind, event_date, side, detail)
          values ('breadth', r.day, 'down', jsonb_build_object('breadth', r.breadth, 'coins', r.breadth_n))
          on conflict do nothing;
          if found then n_new := n_new + 1; end if;
        end if;
        armed_dn := false; run_d := 0;
      end if;
    end if;

    -- leadership: margin 3 points, 7 days
    if r.ret30_btc is not null and r.ret30_large is not null and r.ret30_small is not null then
      select g, v into best, first_v from (values ('btc', r.ret30_btc), ('large', r.ret30_large), ('small', r.ret30_small)) t(g, v)
        order by v desc limit 1;
      select v into second_v from (values ('btc', r.ret30_btc), ('large', r.ret30_large), ('small', r.ret30_small)) t(g, v)
        order by v desc offset 1 limit 1;
      top := case when first_v - second_v >= 3 then best end;
      if top is null or top = leader then cand := null; l_run := 0;
      else
        if top = cand then l_run := l_run + 1; else cand := top; l_run := 1; end if;
        if l_run >= 7 then
          if leader is not null and r.day >= p_go_live then
            insert into market_events (kind, event_date, side, detail)
            values ('leadership', r.day, top, jsonb_build_object('from', leader,
                    'ret30', jsonb_build_object('btc', r.ret30_btc, 'large', r.ret30_large, 'small', r.ret30_small)))
            on conflict do nothing;
            if found then n_new := n_new + 1; end if;
          end if;
          leader := top; cand := null; l_run := 0;
        end if;
      end if;
    end if;
  end loop;
  return n_new;
end $$;

-- ── Grades: did the described move hold after 7 and 30 days? ────
--   btc200      BTC is on the side it crossed to
--   breadth     the median listed coin moved the way breadth turned
--   leadership  the new leading group beat the one it replaced
create or replace function public.grade_market_events()
returns integer language plpgsql security definer set search_path = public as $$
declare e record; h int; ok boolean; n int := 0; a numeric; b numeric;
  listed text[]; large text[]; small text[];
begin
  select array_agg(sym order by mcap desc) into listed from (
    select upper(m->>'symbol') sym, coalesce((m->>'market_cap')::numeric, 0) mcap
    from market_cache c, jsonb_array_elements(c.data) m
    where c.cache_key = 'cg_markets_all' and m->>'id' <> 'bitcoin'
      and m->>'id' not in (select jsonb_array_elements_text(data->'stables') from market_cache where cache_key = 'coin_universe')
  ) x;
  large := listed[1:19]; small := listed[100:249];

  for e in select * from market_events where grade_30d is null and event_date <= (now() at time zone 'utc')::date - 8 loop
    foreach h in array array[7, 30] loop
      continue when e.event_date + h > (now() at time zone 'utc')::date - 1;
      continue when (h = 7 and e.grade_7d is not null);
      ok := null;
      if e.kind = 'btc200' then
        select (x.close > y.close) into ok from binance_daily_klines x, binance_daily_klines y
         where x.base_asset = 'BTC' and y.base_asset = 'BTC'
           and x.open_time::date = e.event_date + h and y.open_time::date = e.event_date;
        if e.side = 'below' then ok := not ok; end if;
      elsif e.kind = 'breadth' then
        select percentile_cont(0.5) within group (order by x.close / y.close - 1) into a
          from binance_daily_klines x join binance_daily_klines y using (base_asset)
         where x.base_asset = any(listed) and x.open_time::date = e.event_date + h and y.open_time::date = e.event_date;
        ok := case when a is null then null when e.side = 'up' then a > 0 else a < 0 end;
      else
        select percentile_cont(0.5) within group (order by x.close / y.close - 1) into a
          from binance_daily_klines x join binance_daily_klines y using (base_asset)
         where x.base_asset = any(case e.side when 'btc' then array['BTC'] when 'large' then large else small end)
           and x.open_time::date = e.event_date + h and y.open_time::date = e.event_date;
        select percentile_cont(0.5) within group (order by x.close / y.close - 1) into b
          from binance_daily_klines x join binance_daily_klines y using (base_asset)
         where x.base_asset = any(case e.detail->>'from' when 'btc' then array['BTC'] when 'large' then large else small end)
           and x.open_time::date = e.event_date + h and y.open_time::date = e.event_date;
        ok := case when a is null or b is null then null else a > b end;
      end if;
      continue when ok is null;
      if h = 7 then update market_events set grade_7d = ok, graded_at = now() where id = e.id;
      else update market_events set grade_30d = ok, graded_at = now() where id = e.id; end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- The daily job: yesterday's reading, the rules, the grades. 00:55 UTC,
-- after the 00:23 klines sync and the 00:45 coin-event detector.
create or replace function public.run_market_events_daily()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform compute_market_daily();
  perform detect_market_events();
  perform grade_market_events();
end $$;

revoke execute on function public.compute_market_daily(date) from public, anon, authenticated;
revoke execute on function public.detect_market_events(date) from public, anon, authenticated;
revoke execute on function public.grade_market_events() from public, anon, authenticated;
revoke execute on function public.run_market_events_daily() from public, anon, authenticated;

select cron.schedule('market-events-daily', '55 0 * * *', $cron$ select public.run_market_events_daily(); $cron$);
