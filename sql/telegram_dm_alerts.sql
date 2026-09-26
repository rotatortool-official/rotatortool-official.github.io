-- Telegram DM alerts for Pro (promptove/71).
--
-- Rotator has no accounts. A browser is identified by its rot_uid (the
-- Pro recovery key). To get DMs, a Pro browser asks for a one-time link
-- code, opens t.me/<bot>?start=<code>, and the telegram-webhook edge
-- function ties that Telegram chat to the rot_uid. The browser then
-- keeps the subscriber's coin list current through alert_set_coins().
-- send-dm-alerts reads the list, works out what is new, and DMs it.
--
-- The trust model is the one Pro recovery already uses: whoever holds a
-- rot_uid is that browser. Both tables are closed to anon and
-- authenticated; the only way in is the functions below, and each one
-- checks pro_users first.

create table if not exists public.telegram_subscribers (
  rot_uid    text primary key,
  chat_id    bigint not null unique,
  coins      jsonb  not null default '[]'::jsonb,   -- [{ id, sym, role }]
  active     boolean not null default true,
  sent       jsonb  not null default '{}'::jsonb,   -- alert key -> first sent (ISO)
  linked_at  timestamptz not null default now(),
  coins_at   timestamptz,
  last_dm_at timestamptz
);
alter table public.telegram_subscribers enable row level security;

create table if not exists public.telegram_link_codes (
  code       text primary key,
  rot_uid    text not null,
  created_at timestamptz not null default now()
);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_subscribers from anon, authenticated;
revoke all on public.telegram_link_codes from anon, authenticated;

create or replace function public._rot_is_pro(p_uid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pro_users where rot_uid = p_uid and is_pro = true
                 and (expirres_at is null or expirres_at > now()));
$$;
revoke all on function public._rot_is_pro(text) from public, anon, authenticated;

-- One-time code for t.me/<bot>?start=<code>. Valid 30 minutes.
create or replace function public.alert_link_start(p_uid text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_code text;
begin
  if p_uid is null or length(p_uid) < 6 or not public._rot_is_pro(p_uid) then return null; end if;
  delete from telegram_link_codes where created_at < now() - interval '30 minutes' or rot_uid = p_uid;
  v_code := 'r' || substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 15);
  insert into telegram_link_codes (code, rot_uid) values (v_code, p_uid);
  return v_code;
end;
$$;

-- The browser's held and watched coins. Returns whether this browser is
-- linked, so the same call doubles as the status check.
create or replace function public.alert_set_coins(p_uid text, p_coins jsonb)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if p_uid is null or not public._rot_is_pro(p_uid) then return false; end if;
  if p_coins is not null and jsonb_typeof(p_coins) = 'array' and jsonb_array_length(p_coins) <= 60 then
    update telegram_subscribers set coins = p_coins, coins_at = now() where rot_uid = p_uid and active;
  end if;
  return exists (select 1 from telegram_subscribers where rot_uid = p_uid and active);
end;
$$;

create or replace function public.alert_unlink(p_uid text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  update telegram_subscribers set active = false where rot_uid = p_uid;
  return found;
end;
$$;

revoke all on function public.alert_link_start(text) from public;
revoke all on function public.alert_set_coins(text, jsonb) from public;
revoke all on function public.alert_unlink(text) from public;
grant execute on function public.alert_link_start(text) to anon, authenticated;
grant execute on function public.alert_set_coins(text, jsonb) to anon, authenticated;
grant execute on function public.alert_unlink(text) to anon, authenticated;

-- Triggers, token by Vault name (same pattern as trigger_sync_etf_flows).
create or replace function public.trigger_send_dm_alerts()
returns bigint language plpgsql security definer set search_path = public as $$
declare v_token text; v_req bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'compute_signal_run_token';
  select net.http_post(
    url := 'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/send-dm-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := '{}'::jsonb, timeout_milliseconds := 60000) into v_req;
  return v_req;
end;
$$;
revoke all on function public.trigger_send_dm_alerts() from public, anon, authenticated;

-- One-off: registers the webhook with Telegram (telegram-webhook ?setup=1).
create or replace function public.trigger_telegram_webhook_setup()
returns bigint language plpgsql security definer set search_path = public as $$
declare v_token text; v_req bigint;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'compute_signal_run_token';
  select net.http_post(
    url := 'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/telegram-webhook?setup=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := '{}'::jsonb, timeout_milliseconds := 30000) into v_req;
  return v_req;
end;
$$;
revoke all on function public.trigger_telegram_webhook_setup() from public, anon, authenticated;

-- Hourly at :50. The sources move daily (events 00:45, Binance status
-- 17:00, ETF 02:17/07:17, unlocks a few times a day), so an hour is
-- prompt without being chatty; each alert is sent once per subscriber.
select cron.unschedule('send-dm-alerts') where exists (select 1 from cron.job where jobname = 'send-dm-alerts');
select cron.schedule('send-dm-alerts', '50 * * * *', $$ select public.trigger_send_dm_alerts(); $$);

-- ── Language (promptove/73) ─────────────────────────────────────────
-- DMs and bot replies follow each subscriber's site language. The site
-- sends it with the link code and with every coin-list sync.
alter table public.telegram_subscribers add column if not exists lang text not null default 'en' check (lang in ('en','mk'));
alter table public.telegram_link_codes add column if not exists lang text not null default 'en' check (lang in ('en','mk'));

drop function if exists public.alert_link_start(text);
create or replace function public.alert_link_start(p_uid text, p_lang text default 'en')
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_code text;
begin
  if p_uid is null or length(p_uid) < 6 or not public._rot_is_pro(p_uid) then return null; end if;
  delete from telegram_link_codes where created_at < now() - interval '30 minutes' or rot_uid = p_uid;
  v_code := 'r' || substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 15);
  insert into telegram_link_codes (code, rot_uid, lang) values (v_code, p_uid, case when p_lang = 'mk' then 'mk' else 'en' end);
  return v_code;
end;
$$;

drop function if exists public.alert_set_coins(text, jsonb);
create or replace function public.alert_set_coins(p_uid text, p_coins jsonb, p_lang text default null)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if p_uid is null or not public._rot_is_pro(p_uid) then return false; end if;
  if p_coins is not null and jsonb_typeof(p_coins) = 'array' and jsonb_array_length(p_coins) <= 60 then
    update telegram_subscribers set coins = p_coins, coins_at = now() where rot_uid = p_uid and active;
  end if;
  if p_lang in ('en','mk') then
    update telegram_subscribers set lang = p_lang where rot_uid = p_uid and active;
  end if;
  return exists (select 1 from telegram_subscribers where rot_uid = p_uid and active);
end;
$$;

revoke all on function public.alert_link_start(text, text) from public;
revoke all on function public.alert_set_coins(text, jsonb, text) from public;
grant execute on function public.alert_link_start(text, text) to anon, authenticated;
grant execute on function public.alert_set_coins(text, jsonb, text) to anon, authenticated;
