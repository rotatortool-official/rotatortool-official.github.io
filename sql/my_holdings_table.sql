-- ============================================================
-- my_holdings_table.sql
--
-- WHY THIS EXISTS: "holdings" in this project only ever live in each
-- visitor's own browser localStorage (js/holdings.js) — confirmed,
-- there is no server-side holdings table or sync anywhere in the
-- codebase. The Telegram SELL-alert rule ("only alert if the coin is
-- in holdings") needs a server that knows YOUR holdings specifically,
-- since this is your personal bot. Rather than build a full
-- multi-user holdings-sync feature, this is a tiny table you update
-- by hand whenever your positions change.
--
-- Run once in Supabase SQL Editor.
-- ============================================================

create table if not exists my_holdings (
  sym         text primary key,   -- e.g. 'RENDER', 'SOL' — must match coin_sym in signal_snapshots
  added_at    timestamptz not null default now()
);

alter table my_holdings enable row level security;

-- No public read/write needed — only the Edge Function (service role)
-- reads this. You maintain it directly via the SQL Editor.
revoke all on my_holdings from anon, authenticated;

-- ── How to use ──────────────────────────────────────────────────
-- Add a holding:
--   insert into my_holdings (sym) values ('RENDER') on conflict do nothing;
--
-- Remove a holding (sold it):
--   delete from my_holdings where sym = 'RENDER';
--
-- See current holdings:
--   select * from my_holdings order by added_at desc;
