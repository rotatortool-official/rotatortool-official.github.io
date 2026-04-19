-- ============================================================
-- Unified multi-asset market data cache
-- Frontend reads from this table only; the Edge Function
-- `sync-market-data` is the sole writer (via service role key).
-- ============================================================

create table if not exists public.unified_market_data (
  id              bigserial primary key,
  asset_type      text not null check (asset_type in ('crypto','stock','forex')),
  symbol          text not null,
  name            text,
  price           numeric(20, 8),
  change_24h      numeric(10, 4),         -- percent, e.g. -2.3456
  source_name     text not null,          -- 'coingecko' | 'binance' | 'yahoo' | 'xfra' | 'twelvedata'
  last_updated    timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb,
  constraint unified_market_data_unique unique (asset_type, symbol, source_name)
);

create index if not exists uni_md_type_symbol_idx on public.unified_market_data (asset_type, symbol);
create index if not exists uni_md_change_idx     on public.unified_market_data (change_24h desc nulls last);
create index if not exists uni_md_updated_idx    on public.unified_market_data (last_updated desc);
create index if not exists uni_md_metadata_gin   on public.unified_market_data using gin (metadata);

-- ─── RLS: public read, writes only via service-role key ───
alter table public.unified_market_data enable row level security;

drop policy if exists uni_md_read on public.unified_market_data;
create policy uni_md_read on public.unified_market_data
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.unified_market_data from anon, authenticated;

-- ─── Convenience view: latest row per (asset_type, symbol) ───
create or replace view public.unified_market_data_latest as
  select distinct on (asset_type, symbol)
         asset_type, symbol, name, price, change_24h,
         source_name, last_updated, metadata
    from public.unified_market_data
   where last_updated > now() - interval '48 hours'
   order by asset_type, symbol, last_updated desc;

grant select on public.unified_market_data_latest to anon, authenticated;

-- ─── Example queries ───
-- Cross-asset top 25 gainers (last 26h):
-- select asset_type, symbol, name, price, change_24h, metadata
--   from unified_market_data_latest
--  order by change_24h desc nulls last
--  limit 25;

-- Latest crypto snapshot preferring Binance, falling back to CoinGecko:
-- select distinct on (symbol) symbol, price, change_24h, source_name
--   from unified_market_data
--  where asset_type = 'crypto'
--    and last_updated > now() - interval '26 hours'
--  order by symbol,
--           case source_name when 'binance' then 1 when 'coingecko' then 2 else 3 end,
--           last_updated desc;
