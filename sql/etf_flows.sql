-- etf_flows — daily US spot BTC and ETH ETF net flows (US$m), from
-- Farside Investors, written by the sync-etf-flows edge function.
-- The interpreted summary lives in market_cache['etf_flows_summary'].
-- Public read (the site shows derived figures, with attribution);
-- only the service role writes. See promptove/68.

create table if not exists public.etf_flows (
  asset      text        not null check (asset in ('BTC', 'ETH')),
  day        date        not null,
  total      numeric     not null,
  funds      jsonb       not null default '{}'::jsonb,
  complete   boolean     not null default true,
  fetched_at timestamptz not null default now(),
  primary key (asset, day)
);

alter table public.etf_flows enable row level security;
drop policy if exists etf_flows_public_read on public.etf_flows;
create policy etf_flows_public_read on public.etf_flows for select using (true);

-- Trigger: same pattern as trigger_sync_token_unlocks (token by Vault name).
create or replace function public.trigger_sync_etf_flows()
returns bigint language plpgsql security definer set search_path = public as $$
declare v_token text; v_req bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'compute_signal_run_token';
  select net.http_post(
    url := 'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-etf-flows',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_req;
  return v_req;
end;
$$;
revoke all on function public.trigger_sync_etf_flows() from public, anon, authenticated;

-- Farside posts after the US close; the second run catches late funds.
select cron.unschedule('sync-etf-flows') where exists (select 1 from cron.job where jobname = 'sync-etf-flows');
select cron.schedule('sync-etf-flows', '17 2,7 * * *', $$ select public.trigger_sync_etf_flows(); $$);
