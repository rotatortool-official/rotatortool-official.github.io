# sync-market-data Edge Function

Server-side data sync for Rotator's unified market cache. Fetches crypto, stock,
and forex prices from free-tier APIs and upserts them into
`public.unified_market_data`. Frontend never calls these APIs directly.

## Sources

| Source      | Asset class | Endpoint                                          |
|-------------|-------------|---------------------------------------------------|
| CoinGecko   | crypto      | `/api/v3/coins/markets` (batched)                 |
| Binance     | crypto      | `/api/v3/ticker/24hr?symbols=[...]` (batched)     |
| Yahoo (US)  | stock       | `/v7/finance/quote?symbols=...` (batched)         |
| Yahoo (XFRA)| stock       | Same endpoint, `.DE` / `.F` suffixes              |
| Yahoo (FX)  | forex       | Same endpoint, `=X` suffix                        |

Two runs/day → ~10 API calls/day total. Comfortably inside every free tier.

## Deploy

```bash
# 1. Apply the table + cron SQL in the Supabase SQL editor:
#    - 28mart/sql/unified_market_data_table.sql
#    - 28mart/sql/unified_market_data_cron.sql  (after step 3)

# 2. Deploy the function
supabase functions deploy sync-market-data --no-verify-jwt

# 3. Set the shared secret used by pg_cron to call this function
supabase secrets set SYNC_SECRET=$(openssl rand -hex 32)

# 4. Smoke test (use the same SYNC_SECRET as step 3)
curl -X POST \
  -H "Authorization: Bearer <SYNC_SECRET>" \
  https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-market-data

# 5. Verify rows landed
#    select source_name, count(*), max(last_updated)
#      from unified_market_data group by source_name;
```

## Adding symbols

Edit the `CRYPTO_SYMBOLS`, `US_STOCKS`, `FRA_STOCKS`, or `FOREX_PAIRS`
arrays at the top of `index.ts`, then redeploy. No schema changes needed.

## Error isolation

Each source is wrapped in its own `try/catch`. A Yahoo/Frankfurt failure
does not stop the CoinGecko or Binance sync. The function returns HTTP 200
if any source succeeded, 502 only if all failed.

## Frontend query pattern

```sql
-- Cross-asset top gainers (last 26h)
select asset_type, symbol, name, price, change_24h, metadata
  from unified_market_data_latest
 order by change_24h desc nulls last
 limit 25;
```

Prefer Binance over CoinGecko for the same coin:

```sql
select distinct on (symbol) symbol, price, change_24h, source_name
  from unified_market_data
 where asset_type = 'crypto'
   and last_updated > now() - interval '26 hours'
 order by symbol,
          case source_name
            when 'binance'   then 1
            when 'coingecko' then 2
            else 3
          end,
          last_updated desc;
```
