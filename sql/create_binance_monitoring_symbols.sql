-- Binance "Monitoring Tag" symbols.
-- Applied 2026-09-06 via the Supabase connector. This file is the record.
--
-- Binance applies this tag to tokens showing significantly higher
-- volatility/risk than listing standards require, and reviews them
-- periodically for possible delisting. Every one of them is still
-- status='TRADING' in exchangeInfo, so binance_delisted_symbols cannot
-- see them -- that table only catches pairs that have ALREADY stopped
-- trading. This is the gap in between: still tradable, but flagged by
-- the exchange as under review.
--
-- Reported directly: the rotation suggestions were surfacing SYN and
-- GLMR, both Monitoring-tagged. Measured on 2026-09-06: 32 USDT pairs
-- carry the tag and ALL 32 are status='TRADING', i.e. the existing
-- delisted check caught exactly none of them. Five are in the tracked
-- universe -- BLUR, WIF, SYN, GNS, GLMR.
--
-- Deliberately a SEPARATE table from binance_delisted_symbols rather
-- than a `reason` column on it. "Appears in binance_delisted_symbols"
-- currently means "this pair is broken"; folding a still-trading coin
-- into it would change the meaning of every existing row and of the
-- UI copy that reads it.
--
-- Populated wholesale each run by sync-binance-status, so a coin whose
-- tag is removed stops being flagged instead of lingering forever.

create table if not exists public.binance_monitoring_symbols (
  base_asset     text        not null primary key,
  binance_symbol text        not null,
  tags           text[]      not null default '{}',
  checked_at     timestamptz not null default now()
);

alter table public.binance_monitoring_symbols enable row level security;

-- Same posture as binance_delisted_symbols: world-readable, because the
-- site reads it anonymously on page load. Writes are service-role only
-- (no INSERT/UPDATE/DELETE policy exists, so RLS denies them to
-- anon/authenticated; the Edge Function uses the service-role key,
-- which bypasses RLS).
drop policy if exists "public read" on public.binance_monitoring_symbols;
create policy "public read"
  on public.binance_monitoring_symbols
  for select
  to public
  using (true);
