-- Binance's own tag vocabulary, for every tagged USDT pair.
-- Applied 2026-09-06 via the Supabase connector. This file is the record.
--
-- Supersedes the standalone binance_monitoring_symbols TABLE created
-- earlier the same day (see create_binance_monitoring_symbols.sql) --
-- that name still exists, but as a VIEW over this table. Run this file
-- after that one.
--
-- WHY GENERALISE:
-- Binance publishes ~27 tags on the same feed the Monitoring Tag comes
-- from (AI, defi, Layer1_Layer2, Meme, RWA, Gaming, Infrastructure,
-- stablecoin, Seed, Launchpool, Solana, NFT, Payments, ...). The site
-- hand-maintains 194 category assignments in config.js's COIN_CATEGORIES
-- that duplicate them and can silently drift from what the exchange
-- actually says. One ingest now serves three consumers:
--
--   1. category tabs on the leaderboard
--   2. the Monitoring buy-side exclusion (via the view below)
--   3. informational labels such as Seed
--
-- Seed is NOT an exclusion. It marks early-stage/innovative listings,
-- i.e. higher volatility -- which cuts both ways, greater downside and
-- greater upside. It is shown, not filtered. Only Monitoring gates
-- anything, because that tag specifically means the exchange is
-- reviewing the token for delisting.
--
-- Measured on first run: 477 tagged USDT pairs, 27 distinct tags,
-- 32 Monitoring, 179 Seed.

create table if not exists public.binance_symbol_tags (
  base_asset     text        not null primary key,
  binance_symbol text        not null,
  tags           text[]      not null default '{}',
  checked_at     timestamptz not null default now()
);

-- GIN index so `where 'AI' = any(tags)` stays cheap once the category
-- tabs query by tag.
create index if not exists binance_symbol_tags_tags_idx
  on public.binance_symbol_tags using gin (tags);

alter table public.binance_symbol_tags enable row level security;

drop policy if exists "public read" on public.binance_symbol_tags;
create policy "public read"
  on public.binance_symbol_tags
  for select
  to public
  using (true);

-- ── binance_monitoring_symbols: table -> view ───────────────────
-- Two tables written from the same feed in the same run could disagree
-- if one insert succeeded and the other did not. A view cannot.
--
-- Shape deliberately unchanged, so every consumer already shipped keeps
-- working untouched: the site's loadMonitoringSymbols(), the bot's
-- loadMonitoringSymbols(), and sync-rotation-snapshot all just select
-- base_asset from this name.

drop table if exists public.binance_monitoring_symbols;

create or replace view public.binance_monitoring_symbols
with (security_invoker = on) as
  select base_asset, binance_symbol, tags, checked_at
  from public.binance_symbol_tags
  where 'Monitoring' = any(tags);

-- security_invoker means the underlying table's RLS decides (the
-- "public read" policy above). Grants still have to be explicit for
-- PostgREST's roles.
grant select on public.binance_monitoring_symbols to anon, authenticated;
