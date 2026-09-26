-- feature_usage: how often each part of the site is used, per UTC day.
-- Added 2026-09-25 (promptove/64, audit item 4).
--
-- ALONGSIDE UMAMI, by Daniel's choice (2026-09-25). The site already
-- sends page views and ~14 named events to Umami Cloud (index.html,
-- js/analytics.js). The audit missed it. This table was kept anyway
-- because (a) Claude can read it, while Umami needs Daniel's login, and
-- (b) ad blockers commonly block cloud.umami.is but not the site's own
-- Supabase calls. THE TWO WILL NOT AGREE, and are not meant to: this one
-- should read higher wherever ad blockers are common. Compare trends, not
-- totals.
--
-- WHY. The audit read "nothing measured use". signal_assistant_usage had 0 rows ever,
-- pro_users 4, referrals 0, and no page or feature count existed, so no
-- feature could be judged worth keeping. GUARDRAILS rule 1 applies to the
-- product as much as to the score.
--
-- WHAT IS STORED: (day, feature, count). Nothing else. No user id, no IP,
-- no cookie, no rot_uid, no coin or holding. A count per feature per day
-- is enough to answer "does anyone use this", and it cannot identify
-- anybody.
--
-- WHO CAN WRITE: anyone with the site's publishable key, through
-- count_feature() only, and only for the features listed in it. The
-- table itself grants nothing to anon/authenticated. RLS is on with no
-- policies, so reads are service-role only. Counts can be inflated by a
-- deliberate caller; the allowlist bounds what, not how often. That is
-- accepted: these are a usage signal, not a security or billing record.

create table if not exists public.feature_usage (
  day      date   not null default (now() at time zone 'utc')::date,
  feature  text   not null,
  count    bigint not null default 0,
  primary key (day, feature)
);

alter table public.feature_usage enable row level security;
revoke all on public.feature_usage from anon, authenticated;

create or replace function public.count_feature(p_feature text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_feature not in (
    'page_view',          -- the dashboard loaded
    'coin_window',        -- a coin's detail window was opened
    'swap_tool',          -- the swap / ratio calculator was used
    'holdings_edit',      -- a holding was added or changed
    'track_record_view',  -- the track-record page loaded
    'assistant_open',     -- the Pro AI assistant was opened
    'telegram_click',     -- a link to the Telegram channel was clicked
    'etf_flows'           -- the ETF flows window was opened (promptove/68)
  ) then
    return;  -- unknown names are ignored, never stored
  end if;
  insert into public.feature_usage (day, feature, count)
  values ((now() at time zone 'utc')::date, p_feature, 1)
  on conflict (day, feature) do update set count = feature_usage.count + 1;
end;
$$;

revoke execute on function public.count_feature(text) from public;
grant  execute on function public.count_feature(text) to anon, authenticated;

-- Read it (service role / SQL editor):
--   select day, feature, count from feature_usage order by day desc, feature;
