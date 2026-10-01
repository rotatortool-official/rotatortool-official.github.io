# Handover for Claude Code

Written 2026-10-01. Read this first, then `PRODUCT-FLOW.md` (what the page is
for and the guardrails every change must respect). `PROJECT_STATUS.md` is an
older log from September; where it disagrees with this file, this file wins.

## The project in one paragraph

Rotator is a free, donation-funded market pulse for Binance: about 250 coins
plus tokenized stocks, rescored every 15 minutes, shown on a static site
(GitHub Pages, this repo, deploys from `main`) and posted by a Telegram bot
(repo `rotatortool-official/telegram-bot`, GitHub Actions). Data and scoring
live in Supabase project `wyvwycatgexpbugzkdfw` (edge functions + pg_cron).
Pro is optional and runs on an honor system (5 invites, a Pro code, or a
crypto contribution). No Stripe: the owner is in North Macedonia, crypto only.

## Working rules

- **Never print, commit or move the Supabase service role key or any API key.**
  Secrets live in GitHub Actions secrets and Supabase function secrets. The
  owner adds them himself.
- **CoinGecko blocks Supabase's egress IPs** (HTTP 403 since 2026-09-29). Any
  job that calls CoinGecko server-side runs in GitHub Actions
  (see `.github/workflows/sync-coin-universe.yml`), not in an edge function.
- **CoinGecko budget:** Demo plan, 10,000 calls/month, 100/minute. Current
  use is about 200/day (~6,200/month): the coin sync is 96 runs/day x 2
  requests. Anything that pushes past ~300/day needs a reason.
  Attribution "Powered by CoinGecko" must stay on the site. The data may be
  shown inside the product but not resold or redistributed as raw data.
- **Macedonian translation** (`js/i18n-mk-dict.js`) maps whole text nodes.
  Every new English UI string needs an MK entry, and keys must be whole
  phrases, never a short generic word like 'The'.
- **Wording rules** (from the owner, see PRODUCT-FLOW.md): "full features",
  never "lifetime"; "market pulse notifications", never "signals" in new copy;
  the Telegram channel is free for everyone, Pro adds personal alerts; results
  in the past tense; information, not buy/sell calls.
- **One market definition everywhere:** BTC above/below its 200-day average
  (`market_cycle` table). With no reading, show nothing. Never guess.
- **Colour follows what happened:** green up, red down. Never colour by list.

---

## Task 1 (do first): pick the coin list from the real market

### Status, 2026-10-01: built; see "Live" below for what is deployed

What was built, and where it differs from the plan below:

- **Weekly job:** `scripts/select-coin-universe.mjs` +
  `.github/workflows/select-coin-universe.yml` (Mondays 02:37 UTC). Rules in
  `scripts/lib/coin-universe.mjs`, 15 tests in `coin-universe.test.mjs`.
  `node scripts/select-coin-universe.mjs --dry-run` previews a run without
  writing (public key, keyless CoinGecko).
- **Not the top 300.** Measured today: of CoinGecko's top 300 only 123 have
  a Binance USDT pair and are not stablecoins. The job reads 250-coin pages
  until 300 coins pass the filters (top 1000 at most), about 8 calls a week.
- **Not "none under $5M".** Only 205 Binance-listed coins trade over
  $5M/day, even in the top 1000. Owner's choice: keep 250 with a **$2M**
  list floor; the ~60 coins between $2M and $5M are listed and scored but
  never put forward (engine rule below).
- **Extra filters** found by the dry run: tokenised stocks (`*-bstock`,
  `*-xstock`) and non-A-Z tickers (牛来), as in the 2026-09-25 batch.
- **Retired coins:** coins that leave stay fetchable for 12 weeks in
  `market_cache.cg_markets_retired` (hourly), never in `cg_markets_all`,
  so they never enter anyone's ranks. A holder sees the tile with
  "No longer in the top 250." `pruneStaleHoldings()` no longer deletes
  crypto holdings once the weekly list is live.
- **7-day volume:** the 15-minute sync stores each day's volume in
  `market_cache.coin_volume_days` (8 days). Until 7 days exist, 24h is used.
- **15-minute sync:** reads `coin_universe`, 2 calls a run plus 1 an hour
  for retired coins, about 216/day.
- **Engine 2.11.0:** `eligibility.extra`, filled by compute-signal-run with
  `thin_volume` (under $5M average) and `meme_filler`. Moves no score, rank
  or zone; `verify-eligibility.js` asserts it. The site's High Momentum and
  Turn-signs lists also skip them unless the visitor holds or tracks the coin.
- **Track record:** NOT reset, by the owner's choice (GUARDRAILS rule 5
  says reset). Labels moved to 2.11.0; STATS_FROM_DATE stays 2026-09-11.
- **Bot:** `fetchFreeCoins()` reads `coin_universe` (core + fillers).
- **Copies retired:** `sync-to-edge-function.js` lives in the workbench
  (`rotator-engine/`), not lost. The `_vendor` FREE_COINS copies are now
  only fallbacks.

### Why

Measured 2026-10-01 from `market_cache.cg_markets_all`:

- The list is a hand-written array of 250 CoinGecko ids (`FREE_COINS` in
  `js/config.js`). It is not "the top 250 by market cap". Only 123 of the 250
  are really in the top 250 today: 72 rank 251-500, 26 rank 501-1000,
  29 rank beyond 1000 or unranked.
- Dead or migrated ids are still on it: FTM (now Sonic), AGIX and OCEAN (ASI),
  MKR (SKY), EOS (Vaulta), KEEP and NU (Threshold), SRM, BRETT. The engine
  already drops them for incomplete data, but they waste a slot each.
- Liquidity: 118 of the 250 trade under $10M/day, 75 under $5M (all-exchange
  24h volume, one day). Of the 199 coins that passed the engine's checks, 82
  were under $10M/day and about 43 under $5M, including weak memes (PNUT,
  TURBO, BOME, NOT at $4-7M).

### What to build

A weekly job (GitHub Actions, because of the CoinGecko block) that writes the
list to Supabase, and every consumer reads it from there.

1. **Fetch:** `coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150`
   pages 1 and 2 (top 300). No `ids=` parameter, so the URL stays short (the
   long `ids=` URL is what CloudFront started rejecting).
2. **Exclude:**
   - stablecoins (keep them in the separate `STABLECOINS` map in config.js
     for the yield display);
   - wrapped / staked / bridged copies (WBTC, WETH, stETH, wstETH, weETH,
     cbBTC, and so on; CoinGecko categories `wrapped-tokens`,
     `liquid-staking-tokens` help, plus a small denylist);
   - coins with no active Binance USDT spot pair (`sync-binance-status`
     already reads Binance exchange info; reuse its table);
   - coins under **$5M average daily volume**. Use a 7-day average once the
     job has stored 7 days of volume; until then use the 24h figure.
3. **Core list:** the first 250 that survive, in market-cap order.
4. **Fillers:** one call to
   `coins/markets?category=meme-token&order=volume_desc&per_page=20`. Take the
   top 3 by 24h volume that have a Binance USDT pair and are not already in the
   250. Mark them `filler: 'meme'`. Large memes that made the top 250 on their
   own (DOGE, SHIB, PEPE, ...) stay in the core list with a `meme` tag.
5. **Hysteresis, so coins near #250 do not flicker:** a new coin joins when it
   ranks inside the filtered top 240. A listed coin leaves only after it
   ranks below 275 in two weekly runs in a row.
6. **Write** the result to `market_cache` key `coin_universe` as
   `{asOf, core:[ids], fillers:[ids], tags:{id:'meme'}, removed:[{id,reason}], added:[...]}`.
   Keep the previous version under `coin_universe_prev` so a bad run can be
   rolled back by hand.
7. **Fail safe:** if any step fails or the result has fewer than 200 coins,
   write nothing and exit non-zero. The last good list stays in use.

Cost: about 3 CoinGecko calls a week.

### Consumers to switch over

`FREE_COINS` is currently copied into several places. All of them must read
`market_cache.coin_universe`, with the current hard-coded array kept as the
fallback if the row is missing:

- `js/config.js` (`FREE_COINS`), used by `js/data-loaders.js`, `js/ratio.js`
  (swap dropdowns), `js/holdings.js`, `js/signals.js`.
- `scripts/sync-coin-universe.mjs` (the 15-minute GitHub Actions sync) and
  `supabase/functions/sync-coin-universe/_vendor/coin-universe.mjs`.
- `supabase/functions/compute-signal-run/_vendor/rotator-engine/site-tables.mjs`
  (the engine's copy).
- `supabase/functions/sync-binance-status/index.ts` only mentions FREE_COINS
  in a comment; it is the source for the Binance pair check, not a consumer.
- The Telegram bot reads FREE_COINS out of the deployed `config.js`
  (comment in `js/ratio.js`). Switch it to the Supabase row too.
- The `_vendor` copies say they are generated by
  `rotator-engine/sync-to-edge-function.js`. That script is **not in this
  repo**, so the copies have been edited by hand or by an untracked script.
  Reading from Supabase removes the need for it.
- `js/config.js` also has a category map (id -> l1/defi/meme/ai/...) used by
  the leaderboard filter tabs. New coins need a category: derive it from
  Binance's category (the `BINANCE_CAT_PRIORITY` mapping already exists) or
  CoinGecko categories, defaulting to none.

### Engine rule that goes with it

In the engine (and the site's leaders / "turning" lists and the bot), a coin
under $5M average daily volume, or any `filler: 'meme'` coin, is never put
forward as a leader or turning coin. It still appears in the coin list, and it
always stays visible to a user who holds or tracks it. If a held coin drops
off the list, keep showing it with a short note: "No longer in the top 250."

### Graded record

Readings already given are graded on their own stored data. A coin leaving
the list must not delete or skip its pending grades.

### Done when

- The weekly job ran once by hand (`workflow_dispatch`) and wrote a
  `coin_universe` row with 250 core + 3 fillers.
- The site, engine, coin sync and bot all show the same list.
- None of the dead ids above appear. No core coin is under $5M/day.
- CoinGecko usage stays about 200/day.
- MK translations exist for any new labels ("MEME", the "no longer in the
  top 250" note).

---

## Task 2: fewer, better Telegram posts

Agreed with the owner 2026-09-30: post less and only when it means something.
Do not post the daily leaders/laggards list (that is the site's job).

A post goes out only when a reading passes all five tests:

1. **Change, not state.** Something flipped since the last reading.
2. **Unusual for that coin.** Outside roughly the 10th-90th percentile of its
   own past year, not a fixed number.
3. **It held.** 2-3 consecutive readings; 3 days for the market direction.
4. **Separate measures agree.** Price strength plus at least one of volume,
   open interest or funding.
5. **Proven type.** After about 30 graded posts of a kind, keep only the kinds
   that beat the median coin (50%) by a clear margin.

Events that qualify:

- BTC crosses its 200-day average and stays across for 3 days, with a small
  buffer (rare, the biggest news).
- Breadth shift: the share of the 250 coins in an uptrend crosses a threshold
  (for example from under 30% to over 50%).
- Leadership rotation: which group leads (BTC, large caps, small caps) changes
  and stays changed.
- A coin passes every engine check and volume or OI confirms (at most 3 coins
  per post).

Rules: one weekly pulse on a fixed day even when quiet ("quiet week, nothing
crossed a threshold"); at most ~3 event posts a week (merge extras into one);
no coin repeated within 14 days unless its reading flipped; every post graded
and shown on the RECORD page.

Pick the thresholds once, write them into PRODUCT-FLOW.md, and change them
only when the grades give a reason. Before switching, replay the rules over
the stored history and report how often each would have fired.

---

## Watch list

- **Track record:** the current engine's first 30-day grades land from
  2026-10-11. Until then the site states the old engine's 76.2% with its
  caveats and makes no claim for the new one. Update the RECORD intro once
  grades exist.
- **Bot sparklines:** the bot's own CoinGecko fetch (for sparklines) probably
  fails (Actions run #477 had none) and it falls back to `cg_markets_all`,
  which has no sparkline. Images still render. Fix: request sparkline data in
  the 15-minute sync, or draw from Binance klines already in Supabase.
- **Bot schedule:** GitHub Actions cron runs up to ~5 hours late. If timing
  matters for Task 2, trigger the bot from Supabase pg_cron
  (`workflow_dispatch` via the GitHub API) instead.
- **Health:** `select * from pipeline_health();` should report every job OK.
  The database was 373MB on 2026-09-29, stable because `signal_run_items` keeps
  about 7 days.
- **Old Pro codes:** left active on purpose ("not a big deal").
- **Paid API for agents:** discussed (x402, crypto per-request payments).
  Decision: wait. The public API (`api.html`, `openapi.json`) stays free and
  read-only. CoinGecko terms do not allow reselling their raw data, so any
  paid tier must sell Rotator's own scores, not CoinGecko prices.
