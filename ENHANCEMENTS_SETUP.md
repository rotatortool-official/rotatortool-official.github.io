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

## ⚠️ Needs your action — D (Telegram bot)

This didn't exist before, so there's real setup:

1. **Create the bot** — message `@BotFather` on Telegram → `/newbot` →
   save the token.
2. **Get your chat ID** — message your new bot once, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read
   `chat.id` from the JSON.
3. **Run the SQL migrations, in order:**
   - `sql/add_vol_ratio_zone_to_signal_snapshots.sql`
   - `sql/my_holdings_table.sql`
4. **Deploy the Edge Function:**
   ```
   supabase functions deploy send-telegram-alerts
   supabase secrets set TELEGRAM_BOT_TOKEN=<from step 1>
   supabase secrets set TELEGRAM_CHAT_ID=<from step 2>
   supabase secrets set TELEGRAM_ALERTS_SECRET=<make up a random string>
   ```
5. **Wire the cron** — open `sql/send_telegram_alerts_cron.sql`, replace
   the two `⚠ replace with...` placeholders (your project URL + the same
   `TELEGRAM_ALERTS_SECRET` value from step 4), then run it in the SQL
   Editor.
6. **Keep `my_holdings` current by hand** whenever you buy/sell, e.g.:
   ```sql
   insert into my_holdings (sym) values ('RENDER') on conflict do nothing;
   delete from my_holdings where sym = 'RENDER'; -- when you sell
   ```
   This exists because holdings have only ever lived in browser
   localStorage in this project — there's no sync to key off server-side.
7. **Test before trusting it:**
   ```sql
   select public.trigger_telegram_alerts();
   ```
   then check your Telegram + the Edge Function logs in the Supabase
   dashboard. Do this for a day or two before assuming it's reliably firing.

Filter logic implemented, per your answers: BUY = "High Momentum" tier
(score ≥ 70, your explicit choice) + volume ≥1.5x 7d avg; SELL = score
≤ 40 AND symbol in `my_holdings`; either suppressed entirely if the macro
gate (C) is closed.

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
