# Rotator Tool enhancements — what's done vs. what you need to do

All code changes below are already applied to the files in this zip. Diff
against your live repo and push — nothing here needs you to write code,
only to configure/deploy a few things Claude can't do for you.

## ✅ Already applied, zero setup (A, B)
- `js/data-loaders.js` — volume-weighted L1 ranking + market-cap bracket
  multiplier, both inside `computeScores()`.
- Volume history builds itself in localStorage over ~1 week of normal
  visits. Nothing to configure.

## ✅ Already applied, zero setup (C)
- `js/signals.js` — `window.safeToBuy` macro gate computed at the top of
  `renderAll()`. Note: no absolute oil price feed exists in this project
  (only `_macroData.oilP7`, a % change), so the "Oil > $95" rule became a
  "% oil move > 5% in 7d" proxy. Swap it for a real threshold if you wire
  in an absolute oil price source later.

## ✅ Already applied via Supabase MCP, some setup left — D (Telegram bot)

**STATUS AS OF THIS BUILD:** the SQL migrations are already run and the
Edge Function is already deployed against your live project
(`wyvwycatgexpbugzkdfw`) — I did this directly via the Supabase
connector. What's left is Telegram-side config + verifying real data
flows through.

**Architecture note — this went through a revision.** The first version
read `signal_snapshots`, which only ever stores the mean-reversion "buy
zone" pool (gated to -3%..-40% 30D pullbacks) — the *opposite* of "High
Momentum." Two new tables now exist instead:
- `momentum_snapshots` — the actual score≥60 "High Momentum" tier
  (never existed anywhere before this)
- `holdings_snapshots` — daily score for symbols specifically in
  `my_holdings` (more precise than the old plan, which could miss a
  held coin if it wasn't in the day's bottom-10 globally)

Both are written once/day by `js/signals.js`'s `renderTopBars()` via new
functions in `js/supabase.js` (`supaRecordMomentumSnapshot`,
`supaRecordHoldingsSnapshot`) — that's the part that needs to reach your
live GitHub Pages site (this zip has it; push it).

Remaining steps:

1. **Create the bot** — message `@BotFather` on Telegram → `/newbot` →
   save the token.
2. **Get your chat ID** — message your new bot once, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read
   `chat.id` from the JSON.
3. **Set the 3 Edge Function secrets** (Dashboard → Edge Functions →
   `send-telegram-alerts` → Secrets, or `supabase secrets set`):
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_ALERTS_SECRET`
   (make up a long random string for the last one — it's what protects
   the endpoint from strangers triggering it).
4. **Push this zip's `js/` files to GitHub** and visit the live site
   once — that's what fires the first `momentum_snapshots`/
   `holdings_snapshots` write of the day.
5. **Add at least one symbol to `my_holdings`** if you want to test a
   SELL alert:
   ```sql
   insert into my_holdings (sym) values ('YOUR_SYMBOL') on conflict do nothing;
   delete from my_holdings where sym = 'YOUR_SYMBOL'; -- when you sell
   ```
6. **Wire the cron** — open `sql/send_telegram_alerts_cron.sql`, replace
   the two `⚠ replace with...` placeholders (your project URL + the same
   `TELEGRAM_ALERTS_SECRET` value from step 3), then run it.
7. **Test:**
   ```sql
   select public.trigger_telegram_alerts();
   ```
   (or ask me to — I can trigger it directly and check the response).
   Watch for a real Telegram message once momentum/holdings data exists;
   until then it correctly returns `{"ok":true,"sent":0,"reason":"no
   snapshots for today yet"}` rather than erroring.

Filter logic: BUY = "High Momentum" tier (score ≥ 70) + volume ≥1.5x 7d
avg, from `momentum_snapshots`; SELL = score ≤ 40 for a symbol in
`my_holdings`, from `holdings_snapshots`; either suppressed entirely if
the macro gate (C) is closed.

## ⚠️ Needs your action — E (tokenomics unlock data)

`js/config.js`'s `TOKENOMICS_DB` now supports an `unlock30d` field (>5%
triggers an extra -15 L3 penalty), but only 3 coins have it filled in
(`render-token`, `sui`, `aptos`) and **those 3 values are placeholders**,
marked `⚠ PLACEHOLDER` in the file — I made them up to show the shape,
not from real vesting data. For each coin you actually want this to
affect (start with the ones already tagged `unlockRisk:'high'`):
1. Look up the real next-30-day unlock % at
   [token.unlocks.app](https://token.unlocks.app) or Vestlab.
2. Add/replace `unlock30d: X` on that coin's line in `TOKENOMICS_DB`.
3. Remove coins that don't need it (fixed-supply/stablecoins can skip
   entirely — the field is optional).

## ✅ No setup — F (win-rate query)

`sql/track_record_win_rate_query.sql` — paste into Supabase SQL Editor,
run. Read the file's header comment: it's a rough approximation (compares
snapshot-to-snapshot closing price), not the same math as the site's
published accuracy stat, which uses intraday Binance kline highs/lows.
For the number you'd actually publish, use `track-record.html`.
