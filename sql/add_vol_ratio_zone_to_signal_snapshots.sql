-- ============================================================
-- add_vol_ratio_zone_to_signal_snapshots.sql
--
-- Adds vol_ratio and zone to signal_snapshots so the new
-- send-telegram-alerts Edge Function can filter on them without
-- recomputing the score engine server-side. Populated by the client
-- as of the js/signal-history.js + js/data-loaders.js changes that
-- ship alongside this migration (see js/data-loaders.js's _volRatio()
-- and js/signals.js's c._zone from _classifyZones()).
--
-- Existing rows will have NULL vol_ratio/zone — harmless, the alert
-- function only reads TODAY's rows, which will always have both once
-- this ships.
--
-- Run this in Supabase SQL Editor AFTER deploying the updated
-- js/signal-history.js (order doesn't strictly matter — old rows just
-- won't have the new fields until the JS ships too).
-- ============================================================

alter table signal_snapshots
  add column if not exists vol_ratio numeric,
  add column if not exists zone text;

-- ── Replace record_daily_snapshot to also store the two new fields ──
create or replace function record_daily_snapshot(p_rows jsonb)
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
    select 1 from signal_snapshots where snap_date = current_date
  ) into already_exists;

  if already_exists then
    return json_build_object('ok', true, 'reason', 'already_recorded', 'count', 0);
  end if;

  insert into signal_snapshots
    (snap_date, coin_id, coin_sym, coin_name, signal_type, signal_label,
     extras, score, price, p24, p7, p30, vol_ratio, zone)
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
    nullif(r->>'p24','')::numeric,
    nullif(r->>'p7','')::numeric,
    nullif(r->>'p30','')::numeric,
    nullif(r->>'vol_ratio','')::numeric,
    nullif(r->>'zone','')
  from jsonb_array_elements(p_rows) as r
  where r->>'coin_id'     is not null
    and length(r->>'coin_id') > 0
    and r->>'signal_type' in ('bullish','lagging')
  on conflict (snap_date, coin_id, signal_type) do nothing;

  get diagnostics inserted_count = row_count;

  return json_build_object('ok', true, 'reason', 'recorded',
                           'count', inserted_count);
end;
$$;

grant execute on function record_daily_snapshot(jsonb) to anon, authenticated;

-- ── Verify ──────────────────────────────────────────────────────
-- select coin_sym, score, vol_ratio, zone, signal_type
--   from signal_snapshots
--  where snap_date = current_date
--  order by score desc;
