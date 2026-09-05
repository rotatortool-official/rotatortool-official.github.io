-- ============================================================
-- add_source_and_restore_mcap_signal_snapshots.sql
--
-- ALREADY APPLIED live to wyvwycatgexpbugzkdfw via Supabase MCP on
-- 2026-09-05. This file exists for your records / version control —
-- running it again is safe (idempotent) but not required.
--
-- Two things this does:
--
-- 1. Adds a `source` column to signal_snapshots and scopes the
--    "first write of the day wins, everyone else no-ops" guard PER
--    SOURCE instead of globally. Without this, whichever of
--    {dashboard, bot.js} writes first each day silently blocks the
--    other's snapshot from ever being recorded — a real conflict once
--    bot.js started pushing into this table too.
--
-- 2. RESTORES the `mcap` column handling in record_daily_snapshot that
--    the Sept 4 add_vol_ratio_zone_to_signal_snapshots.sql migration
--    accidentally dropped (a genuine regression — every row written
--    between Sept 4 and this fix has NULL mcap; not retroactively
--    fixable, but it's correct going forward).
--
-- Also drops the old 1-argument record_daily_snapshot(jsonb) overload
-- — leaving it in place alongside the new 2-arg version creates an
-- ambiguous-sounding but actually-resolved overload where callers
-- passing only p_rows silently keep hitting the OLD buggy function.
-- ============================================================

alter table signal_snapshots
  add column if not exists source text not null default 'dashboard';

alter table signal_snapshots
  drop constraint if exists signal_snapshots_snap_date_coin_id_signal_type_key;

alter table signal_snapshots
  add constraint signal_snapshots_snap_date_coin_id_signal_type_source_key
  unique (snap_date, coin_id, signal_type, source);

drop function if exists record_daily_snapshot(jsonb);

create or replace function record_daily_snapshot(p_rows jsonb, p_source text default 'dashboard')
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
     extras, score, price, mcap, p24, p7, p30, vol_ratio, zone, source)
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
    p_source
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

grant execute on function record_daily_snapshot(jsonb, text) to anon, authenticated;

-- ── Verify ──────────────────────────────────────────────────────
-- select coin_sym, source, score, mcap, signal_type
--   from signal_snapshots
--  where snap_date = current_date
--  order by source, score;
