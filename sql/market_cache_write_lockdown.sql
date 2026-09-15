-- Applied 2026-09-15 through the Supabase connector (migration
-- market_cache_public_write_lockdown). Backlog item 1, promptove/37.
--
-- WHAT WAS OPEN. market_cache let anyone holding the publishable key (it
-- ships in every page load) insert or update any row except the bot's
-- snapshot keys. That included the rows the SERVER trusts:
--
--   cg_markets_all   the coin universe every 15-minute scoring run reads
--   fear_greed       insight pillar 6
--   macro_data       Layer 2, and the bot's macro section
--   network_data     the bot's on-chain section
--
-- and the browser-side mirrors that decide what a visitor is shown:
-- binance_delisted_symbols, binance_monitoring_symbols, binance_symbol_tags,
-- coin_technicals, market_cycle_rows, token_unlocks, bstock_rows. A
-- poisoned delisted list, for example, would put a delisted coin back on
-- every visitor's rotation panel for up to an hour.
--
-- WHO LEGITIMATELY WROTE WITH THE PUBLIC KEY, measured before changing it:
--
--   the site     a read-through cache: read the row, and if missing or
--                past its TTL, read the real table (or CoinGecko) and
--                write the result back. Every read already falls back
--                when the row is stale, and every write is caught, so a
--                refused write costs a few small extra reads, never a
--                broken page. site/js/supabase.js now skips the writes
--                the database would refuse, so no console noise.
--   the bot      cg_markets_with_sparkline and the GeckoTerminal caches.
--                It runs every six hours against 30-minute TTLs, so the
--                cache almost never hit; losing the write costs a few
--                GeckoTerminal lookups per run.
--   the servers  sync-market-data, sync-coin-universe, sync-binance-futures
--                all use the service role, which RLS does not restrict.
--
-- WHAT STAYS PUBLIC. ratio_price_* and ratio_chart_*: the swap panel's
-- chart series. Display-only, read by nothing on the server, and the
-- shared cache is what keeps visitors under CoinGecko's rate limit — the
-- 403s that broke the chart before promptove/14. Accepted residual risk:
-- someone can distort a swap chart for up to ten minutes.
--
-- NOT CHANGED, AND SEPARATELY BROKEN. bot_snapshot_* and
-- bot_free_coins_whitelist were already refused to the public key, and the
-- bot writes them WITH the public key, so the bot's daily snapshots have
-- failed silently since 2026-09-02 (newest row). Those snapshots feed its
-- streak tags and weekly summary. The fix is a service-role secret for the
-- bot, not reopening the keys.

drop policy if exists "public write except bot keys" on public.market_cache;
drop policy if exists "public update except bot keys" on public.market_cache;

create policy "public write ratio caches only" on public.market_cache
  for insert to public
  with check (cache_key like 'ratio\_price\_%' or cache_key like 'ratio\_chart\_%');

create policy "public update ratio caches only" on public.market_cache
  for update to public
  using      (cache_key like 'ratio\_price\_%' or cache_key like 'ratio\_chart\_%')
  with check (cache_key like 'ratio\_price\_%' or cache_key like 'ratio\_chart\_%');

-- TRUNCATE is not governed by row-level security. PostgREST cannot issue
-- one, but the grant has no legitimate use from a public role.
revoke delete, truncate, references, trigger on public.market_cache from anon, authenticated;

-- Only sync-binance-futures writes this table, with the service role. The
-- public grants were unused (no write policy existed, so RLS already
-- refused them); removed so a future policy cannot make them reachable.
revoke insert, update, delete, truncate, references, trigger on public.binance_futures_history from anon, authenticated;

-- Verify (all inside a transaction that is rolled back):
--   begin; set local role anon;
--   insert into market_cache (cache_key, data) values ('cg_markets_all_probe', '{}');  -- must fail
--   rollback;
