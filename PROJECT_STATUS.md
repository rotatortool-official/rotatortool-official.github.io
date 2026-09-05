# Rotator Tool — Enhancement Project Status

Last updated: 2026-09-04. Supabase project: `wyvwycatgexpbugzkdfw`
(rotatortool-official's Project). Keep this file updated as work
continues — paste it at the start of a new chat instead of re-explaining
from scratch.

## ✅ DONE — code applied, working

| Item | What | Where |
|---|---|---|
| A. Volume-weighted momentum | L1 ranking uses volume-adjusted p7 | `js/data-loaders.js` (`_volRatio`, `_trackVolumeHistory`, modified `computeScores()`) |
| B. Market-cap bracket penalty | 0.85x <$500M, 1.0x mid, 1.05x >$50B | `js/data-loaders.js` (`computeScores()`) |
| C. Macro risk gate | `window.safeToBuy` computed from Fear&Greed/DXY/Oil | `js/signals.js` (`renderAll()`) |
| F. Win-rate SQL query | Approximates win rate via signal_snapshots self-join | `sql/track_record_win_rate_query.sql` — just paste & run, no setup |
| Repo cleanup | Removed 4 dead duplicate files + 1 misplaced file | root `signals.js`/`data-loaders.js`/`holdings.js`/`ui.js` deleted; `supabase/functions/sync_rotation_snapshot_cron.sql` deleted (kept the `sql/` copy) |

## ✅ DONE — Supabase side (applied directly via MCP to project `wyvwycatgexpbugzkdfw`)

- Migration: `add_vol_ratio_zone_to_signal_snapshots.sql` — applied
- Migration: `create_momentum_and_holdings_snapshots.sql` (creates
  `momentum_snapshots` + `holdings_snapshots` tables/RPCs) — applied
- Migration: `my_holdings_table.sql` — applied, table exists, **currently empty**
- Edge Function `send-telegram-alerts` — deployed, currently **v8**,
  reads `momentum_snapshots` (BUY) + `holdings_snapshots` (SELL),
  macro-gate-aware, auth-protected
- Confirmed `market_cache` has real `fear_greed`/`macro_data` rows the
  function reads correctly
- Verified via direct SQL trigger (`net.http_post`): endpoint returns
  200 with correct auth, correctly reports "no snapshots for today yet"
  when tables are empty

## ⚠️ IN PROGRESS — D. Telegram bot

**Architecture note:** original plan read `signal_snapshots`, which
turned out to only ever contain the mean-reversion "buy zone" pool
(gated -3%..-40% 30D pullback) — structurally incompatible with "BUY on
High Momentum". Fixed by adding two new tables instead (see above). If
a new chat suggests going back to `signal_snapshots` for this, that's
regressing a fixed bug — don't.

**Confirmed working:**
- `TELEGRAM_ALERTS_SECRET` — set correctly, verified via live test
  (current value known to both you and Claude from this session;
  rotate again if this file or the chat is ever shared)
- Edge Function auth, macro gate logic, table reads — all verified live

**NOT yet confirmed / NOT yet done:**
- [ ] `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — secrets are set, but
      **never actually tested** — every test so far returned `sent: 0`
      because there's no data yet, so a real `sendTelegram()` call has
      never fired. Could still be wrong.
- [ ] Telegram bot itself — confirm you completed the BotFather steps
      (name, username, saved token)
- [ ] Push `js/signals.js` + `js/supabase.js` (this zip's versions) to
      GitHub — these contain the code that actually writes to
      `momentum_snapshots`/`holdings_snapshots`. **Without this push,
      those tables will stay empty forever and nothing will ever send.**
- [ ] Visit the live site once after deploying — first visitor of the
      day triggers the snapshot write (same pattern the site already
      used for `signal_snapshots`)
- [ ] Add at least one real symbol to `my_holdings` to ever test a SELL
      alert: `insert into my_holdings (sym) values ('XXX');`
- [ ] Wire the cron: fill in the two `⚠ replace with...` placeholders in
      `sql/send_telegram_alerts_cron.sql` (project URL + the
      `TELEGRAM_ALERTS_SECRET` value) and run it — **not run yet**,
      alerts currently only fire when manually triggered
- [ ] One full end-to-end test with real data flowing through, to
      confirm a message actually lands in Telegram

## ⚠️ PARTIALLY DONE — E. Tokenomics unlock schedule

- Code support done: `unlock30d` field + L3 -15pt penalty logic, in
  `js/config.js` / `js/data-loaders.js`
- Only 3 coins have values filled in (`render-token`, `sui`, `aptos`),
  and **those 3 are placeholders Claude invented to show the shape** —
  marked `⚠ PLACEHOLDER` in the file, not real data
- [ ] Look up real next-30-day unlock % at token.unlocks.app or Vestlab
      for coins you actually care about (start with ones already tagged
      `unlockRisk:'high'`) and replace the placeholders

## 🆕 Sept 5 — discovered a THIRD system + unified the track record

Turns out there's a separate `rotatortool-official/telegram-bot` repo
(not in the dashboard zip — a standalone `bot.js` + GitHub Actions cron)
that's been broadcasting to a **public** Telegram channel since April,
3x/day, with its own scoring formula, its own "Rotate In/Out" picks,
its own call-numbering/streak tracking. This is separate from BOTH the
dashboard's mean-reversion buy-zone panel AND the personal
`send-telegram-alerts` bot built earlier in this project. Three
systems total now:

| System | What | Audience | Tracked how |
|---|---|---|---|
| Dashboard "Rotation Opportunities" panel | Mean-reversion buy-zone, manual browsing | You, on-site | `signal_snapshots` (source=dashboard) → `track-record.html` |
| `rotatortool-official/telegram-bot` (`bot.js`) | Public marketing content, own scoring formula, Rotate In/Out | Public Telegram channel | own internal cache-based call tracking + **now also** `signal_snapshots` (source=bot) |
| `send-telegram-alerts` (Supabase Edge Function) | Personal High Momentum BUY + your-holdings SELL | Your private chat | not tracked/graded — just fires alerts |

**The "65%" figure you referenced comes from `track-record.html`,
which only ever measured the dashboard's own buy-zone calls — NOT the
`bot.js` calls you were actually acting on** (the ones that called
ONDO/INJ/RENDER/FIL as oversold). Different scoring formula, different
filters (bot.js has a GeckoTerminal DEX-liquidity gate the dashboard
doesn't), different thresholds. They can and do pick different coins on
the same day.

**Fixed:** `bot.js` now pushes its daily Rotate In/Out picks into the
same `signal_snapshots` table (tagged `source:'bot'`), so the
dashboard's existing peak-capture win/loss grading (Binance klines,
7-14 day window) scores both systems into one blended number going
forward. Required a real bug fix along the way: `signal_snapshots` had
a "first write of the day wins, everyone else no-ops" guard that was
GLOBAL, not per-source — would have silently blocked whichever of
{dashboard, bot} wrote second each day. Now scoped per-source.
Also fixed a real regression from earlier in this session: the
Sept 4 `vol_ratio`/`zone` migration had accidentally dropped `mcap`
from the insert — every row from Sept 4 until this fix has NULL mcap
(not retroactively fixable, correct going forward).

**Files:** `sql/add_source_and_restore_mcap_signal_snapshots.sql`
(dashboard repo, already applied live) + updated `bot.js` +
`README.md` (separate `telegram-bot-updated.zip` delivered — that repo
isn't part of this zip).

**Still open:** you explicitly said no to adding a dedicated
"buy-zone/oversold alert" push notification (declined when asked
2026-09-04) — the unification above only fixes *tracking/grading*, it
doesn't add a new alert type. If you want that later, it's a
contained addition (new snapshot table + one more Edge Function block,
same pattern as `momentum_snapshots`/`holdings_snapshots`).

**Not yet done:** breaking the blended accuracy number back out by
source (dashboard vs bot) — currently `getAccuracyStats()` just mixes
both together into one number, which is what you asked for ("both,
ideally unified into one number"), but a per-source breakdown would be
a small follow-up to that same function if useful later.

## Quick facts for next session
- Supabase project ref: `wyvwycatgexpbugzkdfw`
- Edge Function name: `send-telegram-alerts` (currently v8)
- Score direction: **LOW score = mean-reversion "buy zone"**, **HIGH
  score = "High Momentum" tier** — these are opposite ends, don't
  conflate them (this caused a real bug earlier in this project)
- BUY alert rule: `momentum_snapshots`, score ≥70, vol_ratio ≥1.5x
- SELL alert rule: `holdings_snapshots`, score ≤40, symbol in
  `my_holdings`
- Macro gate closes on: Fear&Greed >70, DXY 7d +2%, or Oil 7d +5%
  (Oil is a % proxy — no absolute price feed exists in this project)
