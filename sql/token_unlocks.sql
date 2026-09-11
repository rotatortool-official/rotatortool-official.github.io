-- token_unlocks + sync-token-unlocks — applied 2026-09-11.
--
-- Closes the largest blind spot in the engine: it could give a good score
-- to a coin with a large unlock the next day.
--
-- The `unlock30d` field has existed in TOKENOMICS_DB since 2.0.0 with a
-- real penalty behind it (`unlock30d > 5` costs 15 points). It was set
-- for ZERO of 250 coins, because the comment beside it says no live
-- vesting feed exists in this project and it must be filled by hand.
--
-- SOURCE. DefiLlama's emissions API returns 402 (paid). The dataset
-- bucket their own front end reads is open and returns 200:
--     https://defillama-datasets.llama.fi/emissions/<slug>
-- Each file carries labelled tranches of timestamped CUMULATIVE
-- `unlocked` amounts, past and future.
--
-- THE MAPPING IS VERIFIED, NOT TRUSTED. Slugs come from DefiLlama's free
-- /protocols index joined on `gecko_id`, so no symbol guessing. But
-- several matches land on a BRIDGE or CHAIN rather than the token
-- (polygon-bridge, starknet-bridge, ronin-bridge, binance-smart-chain).
-- Every payload carries its own gecko_id, so the function re-checks it
-- and refuses the row on a mismatch. That check is the difference
-- between a feed and a plausible-looking feed.
--
-- COVERAGE IS ~30%: 76 of 250 coins have a schedule. NULL therefore means
-- "no schedule available" and must never read as "no unlock due". A coin
-- WITH a schedule showing 0 gets a real 0. Both mean no penalty today,
-- but only one is a measurement -- params.unlocks on each run records
-- how many were covered and how many were over threshold.
--
-- BATCHED: payloads are 0.5-5.6MB each and 76 will not fit in one
-- invocation. Six stalest rows per run, every 30 min, so the full set
-- refreshes about 4x a day -- ample for published vesting plans, and it
-- keeps the pull off a free CDN modest.
--
-- checked_at is stamped even on failure, so one broken slug cannot wedge
-- the rotation by staying permanently stalest.
--
-- VERIFIED LIVE on run 562:
--   FF     6.47% due 2026-09-30  -> unlockPts -20, layer3 -35  (penalised)
--   EIGEN  4.27% due 2026-10-02  -> unlockPts  -5             (under threshold)
--   W      2.25% due 2026-09-12  -> unlockPts  -5
--   LDO / POL / RPL  0%          -> unlockPts  -5

create table if not exists public.token_unlocks (
  coin_id            text primary key,
  slug               text not null,
  unlock30d_pct      numeric,
  next_unlock_at     timestamptz,
  next_unlock_pct    numeric,
  unlocked_now       numeric,
  schedule_checked_at timestamptz,
  last_error         text,
  updated_at         timestamptz not null default now()
);

create index if not exists token_unlocks_stalest
  on public.token_unlocks (schedule_checked_at nulls first);

alter table public.token_unlocks enable row level security;
drop policy if exists token_unlocks_read on public.token_unlocks;
create policy token_unlocks_read on public.token_unlocks for select using (true);

-- The trigger was built by copying trigger_binance_spot_sync's definition
-- and swapping the slug, so the shared secret was never selected out, then
-- revoked from public/anon/authenticated.
select cron.schedule('sync-token-unlocks', '9,39 * * * *',
                     ' select public.trigger_sync_token_unlocks(); ');
