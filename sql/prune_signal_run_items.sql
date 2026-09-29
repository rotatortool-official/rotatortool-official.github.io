-- Applied 2026-09-29 as migration prune_signal_run_items.
-- Retention for signal_run_items: keep every run from the last 7 days,
-- and before that one run per UTC day. The table was growing ~220 MB a
-- week and had pushed the project to 770 MB on the 500 MB free plan.
create or replace function public.prune_signal_run_items(keep_days int default 7)
returns bigint language plpgsql security definer set search_path = public as $$
declare deleted bigint;
begin
  with populated as (select distinct run_id from signal_run_items),
  daily as (
    select distinct on (date_trunc('day', r.as_of)) r.id
    from signal_runs r join populated p on p.run_id = r.id
    order by date_trunc('day', r.as_of), r.as_of asc
  ),
  doomed as (
    select r.id from signal_runs r join populated p on p.run_id = r.id
    where r.as_of < now() - make_interval(days => keep_days)
      and r.id not in (select id from daily)
  )
  delete from signal_run_items i using doomed d where i.run_id = d.id;
  get diagnostics deleted = row_count;
  return deleted;
end; $$;
revoke all on function public.prune_signal_run_items(int) from public, anon, authenticated;
select cron.schedule('prune-signal-run-items-daily', '37 1 * * *',
  $$ select public.prune_signal_run_items(7); $$);
