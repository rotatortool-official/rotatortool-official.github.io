-- ============================================================
-- add_engine_version_to_snapshots.sql
--
-- ALREADY APPLIED live to wyvwycatgexpbugzkdfw via Supabase MCP on
-- 2026-09-05 (migration 20260905164833). This file did not exist in
-- the repo when the migration was applied directly — added afterward,
-- 2026-09-05, so version control matches the live schema. Running it
-- again is safe (idempotent adds; CREATE OR REPLACE functions).
--
-- Adds an `engine_version` column to signal_snapshots,
-- momentum_snapshots, and holdings_snapshots, and threads it through
-- all 3 write RPCs so every historical row can say which scoring
-- engine (rotator-engine's ENGINE_VERSION, e.g. "2.0.0") produced it.
--
-- NOTE: this migration adds new overloads (p_rows, ..., p_engine_
-- version) alongside the EXISTING 2-/1-arg overloads instead of
-- dropping them the way add_source_and_restore_mcap_signal_snapshots.
-- sql did for record_daily_snapshot's predecessor. Verified live
-- (2026-09-05) that PostgREST/Postgres correctly resolves to the new
-- overload whenever the caller's JSON body includes p_engine_version
-- (every current caller does), so this is not currently broken — but
-- it's the same stale-overload shape called out in that earlier
-- migration's own comments. See drop_stale_engine_version_overloads.
-- sql for the cleanup.
-- ============================================================

alter table signal_snapshots
  add column if not exists engine_version text null;

alter table momentum_snapshots
  add column if not exists engine_version text null;

alter table holdings_snapshots
  add column if not exists engine_version text null;

create or replace function record_daily_snapshot(
  p_rows jsonb,
  p_source text default 'dashboard',
  p_engine_version text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
  already_exists boolean;
begin
  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 then
    return json_build_object('ok', false, 'reason', 'invalid', 'count', 0);
  end if;

  select exists (
    select 1 from signal_snapshots
    where snap_date = current_date and source = p_source
  ) into already_exists;

  if already_exists then
    return json_build_object('ok', true, 'reason', 'already_recorded', 'count', 0);
  end if;

  insert into signal_snapshots
    (snap_date, coin_id, coin_sym, coin_name, signal_type, signal_label,
     extras, score, price, mcap, p24, p7, p30, vol_ratio, zone, source, engine_version)
  select
    current_date,
    r->>'coin_id',
    r->>'coin_sym',
    coalesce(r->>'coin_name', ''),
    r->>'signal_type',
    coalesce(r->>'signal_label', ''),
    case
      when jsonb_typeof(r->'extras') = 'array'
        then array(select jsonb_array_elements_text(r->'extras'))
      else array[]::text[]
    end,
    nullif(r->>'score','')::numeric,
    nullif(r->>'price','')::numeric,
    nullif(r->>'mcap','')::numeric,
    nullif(r->>'p24','')::numeric,
    nullif(r->>'p7','')::numeric,
    nullif(r->>'p30','')::numeric,
    nullif(r->>'vol_ratio','')::numeric,
    nullif(r->>'zone',''),
    p_source,
    p_engine_version
  from jsonb_array_elements(p_rows) as r
  where r->>'coin_id'     is not null
    and length(r->>'coin_id') > 0
    and r->>'signal_type' in ('bullish','lagging')
  on conflict (snap_date, coin_id, signal_type, source) do nothing;

  get diagnostics inserted_count = row_count;

  return json_build_object('ok', true, 'reason', 'recorded',
                           'count', inserted_count);
end;
$$;

create or replace function record_momentum_snapshot(
  p_rows jsonb,
  p_engine_version text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
  already_exists boolean;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return json_build_object('ok', false, 'reason', 'invalid', 'count', 0);
  end if;

  select exists (select 1 from momentum_snapshots where snap_date = current_date)
    into already_exists;
  if already_exists then
    return json_build_object('ok', true, 'reason', 'already_recorded', 'count', 0);
  end if;

  insert into momentum_snapshots (snap_date, coin_id, coin_sym, coin_name, score, price, vol_ratio, mcap, engine_version)
  select current_date, r->>'coin_id', r->>'coin_sym', coalesce(r->>'coin_name',''),
         nullif(r->>'score','')::numeric, nullif(r->>'price','')::numeric,
         nullif(r->>'vol_ratio','')::numeric, nullif(r->>'mcap','')::numeric,
         p_engine_version
  from jsonb_array_elements(p_rows) as r
  where r->>'coin_id' is not null and length(r->>'coin_id') > 0
  on conflict (snap_date, coin_id) do nothing;

  get diagnostics inserted_count = row_count;
  return json_build_object('ok', true, 'reason', 'recorded', 'count', inserted_count);
end;
$$;

create or replace function record_holdings_snapshot(
  p_rows jsonb,
  p_engine_version text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
  already_exists boolean;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return json_build_object('ok', false, 'reason', 'invalid', 'count', 0);
  end if;

  select exists (select 1 from holdings_snapshots where snap_date = current_date)
    into already_exists;
  if already_exists then
    return json_build_object('ok', true, 'reason', 'already_recorded', 'count', 0);
  end if;

  insert into holdings_snapshots (snap_date, sym, coin_id, score, price, engine_version)
  select current_date, upper(r->>'sym'), r->>'coin_id',
         nullif(r->>'score','')::numeric, nullif(r->>'price','')::numeric,
         p_engine_version
  from jsonb_array_elements(p_rows) as r
  where r->>'sym' is not null and length(r->>'sym') > 0
    and upper(r->>'sym') in (select upper(sym) from my_holdings)
  on conflict (snap_date, sym) do nothing;

  get diagnostics inserted_count = row_count;
  return json_build_object('ok', true, 'reason', 'recorded', 'count', inserted_count);
end;
$$;

grant execute on function record_daily_snapshot(jsonb, text, text) to anon, authenticated;
grant execute on function record_momentum_snapshot(jsonb, text) to anon, authenticated;
grant execute on function record_holdings_snapshot(jsonb, text) to anon, authenticated;
