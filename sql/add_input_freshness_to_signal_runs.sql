-- ============================================================
-- add_input_freshness_to_signal_runs.sql
--
-- Records how old compute-signal-run's INPUTS were at the moment a run
-- was produced.
--
-- WHY THIS EXISTS:
-- compute-signal-run makes no external API calls — it reads
-- market_cache['cg_markets_all'] and market_cache['macro_data'].
-- Those rows are populated by BROWSER VISITORS (js/data-loaders.js's
-- loadCoins -> supaCacheSet), not by a cron. So during any quiet
-- stretch with no site traffic, the 15-minute cron still computes and
-- persists a completely normal-looking signal_runs row — stamped with
-- a fresh as_of, full item count, no error — from prices that may be
-- hours old. Nothing recorded that, so it was undetectable.
--
-- WHY A TRIGGER RATHER THAN CODE IN THE EDGE FUNCTION:
-- The function ships with a ~43KB vendored engine bundle. Redeploying
-- it through any tool that requires the file contents to be re-emitted
-- risks silently corrupting that bundle (it is full of long runs of
-- box-drawing and alignment characters whose exact lengths cannot be
-- guaranteed when regenerated). Doing the measurement in Postgres needs
-- no redeploy at all, and has the side benefit of covering EVERY writer
-- of signal_runs rather than one specific function.
--
-- FLAG-ONLY: this never blocks or alters a run. It only makes a
-- stale-input run identifiable, live and retrospectively. The trigger
-- also swallows its own errors — telemetry must never be able to break
-- the authoritative signal pipeline.
--
-- FORWARD-COMPATIBLE: if a caller ever supplies input_freshness
-- explicitly (e.g. a future edge-function deploy), that value is kept
-- and the trigger leaves it alone.
--
-- Shape: {"cg_markets_all_ms": 240000, "macro_data_ms": 600000,
--         "stamped_by": "trigger"}
--
-- Example — find runs scored on inputs older than 15 minutes:
--   select id, as_of,
--          (input_freshness->>'cg_markets_all_ms')::bigint / 60000 as markets_age_min
--     from signal_runs
--    where (input_freshness->>'cg_markets_all_ms')::bigint > 15*60*1000
--    order by as_of desc;
-- ============================================================

alter table signal_runs
  add column if not exists input_freshness jsonb null;

comment on column signal_runs.input_freshness is
  'Age in ms of each market_cache input when this run was written. Flag-only: a large value means the run was scored on stale prices. NULL = not recorded.';

create or replace function signal_runs_stamp_input_freshness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  markets_ts timestamptz;
  macro_ts   timestamptz;
begin
  -- An explicit value from the caller always wins.
  if new.input_freshness is not null then
    return new;
  end if;

  select updated_at into markets_ts from market_cache where cache_key = 'cg_markets_all';
  select updated_at into macro_ts   from market_cache where cache_key = 'macro_data';

  new.input_freshness := jsonb_build_object(
    'cg_markets_all_ms',
      case when markets_ts is null then null
           else greatest(0, (extract(epoch from (now() - markets_ts)) * 1000)::bigint) end,
    'macro_data_ms',
      case when macro_ts is null then null
           else greatest(0, (extract(epoch from (now() - macro_ts)) * 1000)::bigint) end,
    'stamped_by', 'trigger'
  );

  return new;
exception when others then
  -- Never let telemetry block a signal run from being recorded.
  return new;
end;
$$;

drop trigger if exists signal_runs_input_freshness on signal_runs;

create trigger signal_runs_input_freshness
  before insert on signal_runs
  for each row
  execute function signal_runs_stamp_input_freshness();
