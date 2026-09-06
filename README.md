# ROTATOR — File Structure & Developer Guide

## How to edit without breaking things

Each file has ONE job. Edit the right file for what you want to change.

---

## 🏗️ Architecture overview (read this first)

Rotator is a static frontend (GitHub Pages) backed by Supabase. There are
**three separate systems** that all produce "buy/sell this coin" signals —
knowing which is which prevents a lot of confusion:

| System | What | Audience | Where the code lives |
|---|---|---|---|
| **Dashboard** — "Rotation Opportunities" panel | Mean-reversion buy-zone, manual browsing | You, on-site | `js/signals.js`, `js/data-loaders.js` (this repo) |
| **Public Telegram bot** (`bot.js`) | Marketing content, its own scoring formula, "Rotate In/Out" picks | Public Telegram channel, 3x/day | separate `telegram-bot` repo |
| **Personal alerts** (`send-telegram-alerts`) | High-Momentum BUY + your-holdings SELL | Your private Telegram chat | `supabase/functions/send-telegram-alerts` (this repo) |

All three now write into the same server-authoritative tables so the
track record (`track-record.html`) can grade them together — see
**Backend / Supabase** below.

### The scoring engine (`rotator-engine/`)

The actual scoring math lives in **`rotator-engine/engine.js`** — one
canonical implementation shared by the site, the Supabase edge functions
(via `engine.mjs`), and the Telegram bot. It's versioned
(`ENGINE_VERSION`, currently `2.0.0`) so every stored signal can say
*which* algorithm produced it (`engine_version` column, see below).

- **v1** (`computeSignalRun`) — the mean-reversion buy-zone logic that's
  been live on the site since before the extraction. Byte-identical to
  what `js/data-loaders.js`/`js/signals.js` used to compute inline.
- **v2** (`computeSignalRunV2`) — an alternate model built during the
  extraction. Not the site's default yet; exists alongside v1 without
  changing default behavior. See `promptove/07-roadmap-2026-09-05.md`
  and `08-backtest-results-2026-09-05.md` (in the separate workbench,
  not this repo) for why.
- **`engine.js` is generated**, not hand-written — it's extracted
  verbatim from the site's own scoring functions by
  `rotator-engine/build.js`, so "the math didn't change" is provable,
  not just claimed. The template/build tooling/tests live in the
  `rotator-engine/` folder of the separate workbench (see **Repo
  layout & workflow** below) — this repo only carries the *built*
  `rotator-engine/engine.js`, because `index.html` loads it directly.
- **Do not hand-edit `rotator-engine/engine.js`** if you have access to
  the template — edit `engine.template.js` and rebuild. If you only
  have this repo, treat `engine.js` as generated output.

A server-side authoritative run (`signal_runs` / `signal_run_items`,
computed every 15 min by the `compute-signal-run` edge function) is the
one true source the site, the bot, and Signal Assistant all read from —
see `js/data-loaders.js`'s `runSignalEngine()` and
`js/supabase.js`'s `supaLoadZoneState()`.

---

## 🗄️ Backend / Supabase

Project: `wyvwycatgexpbugzkdfw` ("rotatortool-official's Project").

### Key tables

| Table | What it holds |
|---|---|
| `signal_runs` / `signal_run_items` | The one authoritative scoring run (server-computed every 15 min), `engine_version` + `scoring_model` (v1/v2) stamped on every row |
| `signal_zone_state` | Per-coin buy/sell/neutral zone with hysteresis — the site reads this, never computes zones from a cold localStorage cache |
| `signal_snapshots` | Daily track-record snapshots, `source` column distinguishes `dashboard` vs `bot` so both get graded together (see `sql/add_source_and_restore_mcap_signal_snapshots.sql`) |
| `momentum_snapshots` / `holdings_snapshots` | Feed the personal `send-telegram-alerts` BUY/SELL logic — separate from `signal_snapshots` because that table is mean-reversion-only and structurally excludes high-momentum coins |
| `rotation_snapshots` | "Rotation Opportunities" then-vs-now grading, written by `sync-rotation-snapshot` |
| `market_cache` | Cached Fear&Greed / DXY / Oil macro data, keyed by `cache_key` |
| `my_holdings` | Your tracked symbols, drives `holdings_snapshots` + the personal SELL alert |
| `unified_market_data` | Cross-asset (crypto/stock/forex) ticker data for the Market Ticker strip |
| `binance_futures_metrics` | Current USDⓈ-M futures data per symbol — funding, open interest + change, long/short ratio, taker flow, Binance's own category, listing date. **Two timestamps**: `bulk_updated_at` (all symbols each run) vs `detail_updated_at` (per-symbol, rotated) |
| `binance_futures_history` | Hourly buckets of OI/funding/price. Exists because Binance serves only ~30d of OI history and it cannot be rebuilt later — see `promptove/13-binance-futures-integration-2026-09-06.md` |
| `pro_users` / `pro_codes` / `pro_requests` / `referrals` | Pro tier state |

Every write-path table above that stores a *signal* (not just cache/config)
carries an `engine_version` column so historical rows can name the
algorithm that produced them. If you add a new signal-producing table,
add this column and thread it through from `window.ROTATOR_RUN.engineVersion`
(site) or `signal_runs.engine_version` (bot/edge functions) — see
`sql/add_engine_version_to_snapshots.sql` for the pattern.

**RPC overload trap:** several write RPCs (`record_daily_snapshot`,
`record_momentum_snapshot`, `record_holdings_snapshot`) have been
migrated more than once by adding a new parameter (`p_source`, then
`p_engine_version`). Each time, the **old overload must be dropped**
in the same migration, or you get two versions of the function
resolving ambiguously depending on which parameters a caller happens
to send. See `sql/drop_stale_engine_version_overloads.sql` for the
cleanup and don't repeat the omission next time a param gets added.

### Edge functions (`supabase/functions/`)

| Function | What it does |
|---|---|
| `compute-signal-run` | Computes the ONE authoritative signal run (cron, every 15 min) → `signal_runs`/`signal_run_items`/`signal_zone_state` |
| `send-telegram-alerts` | Personal BUY (momentum≥70, vol≥1.5x) / SELL (holdings≤40) alerts, macro-gated |
| `signal-assistant` | Pro chat feature — answers only from the live `signal_runs`/`signal_run_items` row, no separate scoring logic |
| `sync-rotation-snapshot` | Records daily Rotation Opportunities picks for track-record grading (reads the canonical `signal_runs` row — does not re-score) |
| `sync-market-data` | Syncs cross-asset ticker data into `unified_market_data`, every 12h |
| `sync-bstocks` | Syncs Binance tokenized-stock data into `unified_market_data` |
| `sync-binance-status` | Flags delisted/suspended Binance **spot** pairs so they stop being suggested |
| `sync-binance-futures` | Every 30 min → `binance_futures_metrics` / `_history`. 3 bulk calls cover all symbols; open interest, long/short and taker flow are per-symbol and rotate by staleness (75/run). **Feeds no score and no UI yet — data collection only** |
| `verify-tx` | Server-side crypto donation verification + Pro activation (replaces client-trusted tx-verify) |

### SQL migrations (`sql/`)

One file per applied migration, kept for history even after being
applied live via the Supabase MCP connector — **do not delete these**,
they're not loaded by the site (no bloat impact) and they're the only
record of *why* the schema looks the way it does. Read a file's header
comment before assuming it's redundant with a newer one.

---

## 📁 Frontend file map

| File | What it controls | Edit when you want to... |
|------|-----------------|--------------------------|
| `js/config.js` | Coin lists, forex pairs, stocks, donation goal, Pro tier plans | Add/remove assets, update donation target, change Pro pricing |
| `js/api-pool.js` | Fetch logic, proxy rotation, caching | Change cache times, add a new proxy |
| `js/pro-system.js` | Referral system, Pro modal, tier badge, Pro feature gates, Telegram Pro-gate | Change Pro modal wording, referral count, locked features, community links |
| `js/signals.js` | Rotation tiles, leaderboard, scoring engine glue, category locks | Change signal thresholds, scoring weights, free/pro category list |
| `js/holdings.js` | Holdings panels (crypto/forex/stocks) + portfolio signals | Change tile appearance, P&L display, holdings limits (5 free / unlimited Pro) |
| `js/tutorial.js` | Onboarding tutorial steps | Edit tutorial text, add/remove steps |
| `js/i18n.js` | Translations / language strings | Add or edit language support |
| `js/ratio.js` | Swap calculator, ratio tracker, coin picker panel | Edit swap tool logic, chart, saved pairs |
| `js/data-loaders.js` | Data fetching, mode switching, mobile nav, auto-refresh, engine wiring | Change refresh interval, add data sources |
| `js/supabase.js` | All Supabase REST calls — Pro sync, snapshot writes, zone-state read | Change Supabase URL/key, modify Pro persistence or snapshot write logic |
| `js/signal-history.js` | "Told You So" track record — daily localStorage snapshot + 7/14-day grading | Change snapshot count, grading window |
| `js/signal-assistant.js` | Pro "Signal Assistant" chat UI — talks to the `signal-assistant` edge function | Change chat UI; scoring logic itself lives server-side, not here |
| `js/global-movers.js` | Market Ticker strip (cross-asset gainers/losers), reads `unified_market_data` | Change ticker feed, refresh cadence |
| `js/tx-verify.js` | Thin client wrapper for the `verify-tx` edge function (donation verification) | Change client-side donation flow UI only — verification logic is server-side |
| `js/analytics.js` | Tiny Umami wrapper, no-ops safely if analytics fails to load | Add new `track(name, props)` call sites |
| `js/visuals.js` | Background canvas sparkle animation | Change animation timing/appearance |
| `rotator-engine/engine.js` | The versioned scoring engine (generated — see **Architecture overview**) | Don't hand-edit here if you have the template; otherwise treat as build output |
| `styles.css` | All CSS styles (dark + light theme) | Change colours, layout, animations, Pro plan cards, category buttons |
| `index.html` | HTML structure, modals (donate, pro, tip), inline JS | Change layout, modals, mobile nav, collapsible sections |
| `api.html` | Public read-only API documentation page | Update documented endpoints |
| `track-record.html` | Public signal track record page (standalone — has its own inline Supabase client, intentionally duplicated from `js/supabase.js`) | Change grading display, win-rate presentation |

---

## 🗂️ What's inside index.html

`index.html` is large (~200KB) and contains everything visual. Key sections:

| Section | What it is |
|---------|-----------|
| `:root { }` | All CSS colour variables (dark + light theme) |
| `.topbar` | Top navigation bar styles |
| `.asset-mode-bar` | CRYPTO / FOREX / STOCKS switcher buttons |
| `.mob-nav` | Mobile bottom navigation bar (FAB layout) |
| `.tile-detail` | Floating info card when you click a coin |
| `.collapse-*` | Collapsible sections on mobile |
| `initNavToggle()` | Bottom nav toggle logic (second press closes section) |
| `initCollapsible()` | Remembers open/closed state of sections in localStorage |
| `SWAP_TUT_STEPS` | Swap tool tutorial step content |
| `ahmFilter()` / `ahmSelect()` | Add Holdings modal search logic |

---

## 🔧 Most common edits

### Add a new Pro code
Codes live in Supabase, **not** in `config.js` (moved server-side so they
can't be extracted from page source). Open the Supabase SQL editor and run:
```sql
INSERT INTO pro_codes (code, note)
  VALUES ('ROT-2026-YOURNEWCODE', 'who you gave it to');
```
To revoke a code:
```sql
UPDATE pro_codes SET active = false WHERE code = 'ROT-2026-XXX';
```
First-time setup: run `sql/pro_codes_table.sql` once in the Supabase SQL editor.

### Update donation progress bar
Open `js/config.js`, change:
```js
var DONATION_CURRENT = 25;  // ← amount received this month
var DONATION_GOAL    = 50;  // ← monthly target
```

### Change Pro tier pricing
Open `js/config.js`, find `PRO_PLANS`:
```js
var PRO_PLANS = [
  { label: '1 Month',  price: 5,  months: 1,  badge: 'Starter' },
  { label: '3 Months', price: 10, months: 3,  badge: 'Supporter' },
  { label: '6 Months', price: 20, months: 6,  badge: 'Pro' }
];
```

### Change which categories are free
Open `js/signals.js`, find `FREE_CATEGORIES`:
```js
var FREE_CATEGORIES = ['all', 'l1', 'defi', 'meme', 'demo'];
```

### Change community channel links
Search for `t.me/rotatortool` in `index.html` and `js/pro-system.js` — replace with your own Telegram channel handle. The Discord button is a placeholder (Coming soon) — wire it up the same way once you have a server.

### Add a new coin
Open `js/config.js`, add to `FREE_COINS`:
```js
'bitcoin', 'ethereum', 'your-coingecko-id-here',
```

### Change auto-refresh interval
Open `js/data-loaders.js`, find `startAutoRefresh()`:
```js
}, 15*60*1000);  // 15 minutes — change to 5*60*1000 for 5 minutes
```

### Change rotation signal thresholds
Open `js/signals.js`, find `renderTopBars()`:
```js
c.score >= 62   // sells (rotate OUT of these) — lower = more signals
c.score <= 38   // buys  (rotate INTO these)   — raise = more signals
```

### Change the overlay darkness behind info card
In `index.html`, find `.tile-detail-overlay`:
```css
.tile-detail-overlay { background: rgba(0,0,0,.18); }
/* .18 = very light, .45 = dark, 0 = no overlay */
```

### Change bottom nav toggle behaviour
In `index.html`, find `initNavToggle()` in the inline `<script>` block.
The `NAV_MAP` object maps button IDs to section keys.

### Add engine_version to a new signal-producing table
Add an `engine_version text null` column, thread it through the write
RPC (`p_engine_version text default null` parameter), and **drop the
old overload of that RPC in the same migration** — see the "RPC
overload trap" note under **Backend / Supabase**.

---

## 🎨 Theme & Colour variables

All colours live in `:root { }` at the top of `index.html`.

| Variable | Used for |
|----------|---------|
| `--bg`, `--bg2`, `--bg3`, `--bg4` | Background layers dark to light |
| `--text`, `--muted` | Primary and secondary text |
| `--green`, `--gd` | Positive / bull signals |
| `--red`, `--rd` | Negative / bear signals |
| `--amber`, `--ad` | Warning / watch signals |
| `--bnb` | Gold accent (primary brand colour) |
| `--pro`, `--prod` | Purple Pro tier colour |

Light theme overrides are in `:root.light { }` just below.

---

## 📱 Mobile Layout

The mobile layout uses two separate systems:

### Bottom Navigation Bar (`mob-nav`)
- FAB 2-1-2 layout: SIGNAL · HOT · [SWAP FAB] · HOLD · MORE
- **Toggle behaviour:** pressing a button twice closes the section (added in session March 2026)
- Defined in `index.html` — the nav HTML is near the bottom, toggle JS is in the inline `<script>` block (`initNavToggle()`)

### Top Bar (mobile)
5 cells: BTC trend · PRO ⚡ · Logo · SUPPORT ☕ · GEAR ⚙
- Each cell has a distinct colour matching its function (purple/green/amber)
- Defined in `index.html` inside `@media(max-width:700px)` blocks

### Collapsible Sections
Sections (Holdings, What's Hot, Swap, Promo) collapse/expand on mobile.
State is saved in `localStorage` key `rot_collapse`.
Toggle function: `toggleCollapse(id)` in the inline `<script>` block.

---

## 🖥️ Desktop Layout

3-column grid: Left sidebar · Center leaderboard · Right swap panel

| Column | Contents |
|--------|---------|
| Left | Mode switcher (CRYPTO/FOREX/STOCKS) + Portfolio Signal + Holdings/Watchlist |
| Center | What's Hot signal tiles + Performance Leaderboard |
| Right | Swap Calculator + Ratio Tracker + Pro Promo |

---

## ✅ Feature history

### March 2026 session
- **Bottom nav toggle** — second press closes the open section
- **Top bar mobile buttons** — distinct colors per button (purple/green/amber) with bottom border accent
- **CRYPTO/FOREX/STOCKS buttons** — each has own color identity (gold/green/red) with glow on active
- **Leaderboard header** — "updated X min ago" now stacks below "CLICK COLUMN HEADERS TO SORT" to prevent overlap on mobile
- **Light mode info card** — fixed `position:relative` bug that was pushing the page down when card opened
- **Tile detail overlay** — blur removed, opacity reduced to `.18` for see-through feel
- **Typography pass** — increased font sizes across: mode labels, section headers, tabs, signal titles, leaderboard title, coin names, swap calculator labels

### April 2026 session — Pro Tier System (donation-based)
- **Crypto-only donations** — USDT (TRC20/BEP20/ERC20), BNB, ETH, Binance Pay; Pro auto-activates via TX-hash verification
- **Tip screen** appears after donation with thank-you message about future development
- **Pro codes** still work as alternative unlock method
- **Community channels** — Telegram signals channel (Pro-only access via `joinTelegram()` gate) and Discord placeholder
- **Referral system** still works (5 verified friends = free Pro, tracked via Supabase)
- **Category Button Redesign** — 3D shadow effect, glow on hover/active, more spacing, locked categories show 🔒
- **DEMO Category Tab** — pulsing green button showing curated top 10 coins for new users
- **Supabase Cloud Sync** — Pro status persists across devices, recovery key system, graceful localStorage fallback if offline

Feature gates (FREE vs PRO): Coins (Top 50 vs Top 200), Categories (5 vs
all 10 + DEMO), Holdings (5 max vs unlimited), Insight Engine / Best
Time to Swap / Stablecoin Yields / Score Breakdown (locked vs full).

### September 2026 session — versioned engine + server-authoritative signals
- **`rotator-engine/` extraction** — the scoring math moved to one
  canonical, versioned module (`ENGINE_VERSION`) shared by the site,
  Supabase edge functions, and the Telegram bot, instead of being
  duplicated inline in three places. Engine v2 exists alongside v1
  without changing default site behavior yet.
- **Server-authoritative signal runs** — `compute-signal-run` (cron,
  every 15 min) computes the one true run into `signal_runs` /
  `signal_run_items` / `signal_zone_state`; the site, bot, and Signal
  Assistant all read from it instead of each computing their own.
- **`engine_version` provenance** — every signal-producing table now
  stamps which engine version produced each row, so historical calls
  can be attributed to a specific algorithm.
- **Signal Assistant** — Pro chat feature answering only from the live
  authoritative signal data (no separate scoring logic client-side).
- **Track record unification** — the public Telegram bot's picks and
  the dashboard's picks now write into the same `signal_snapshots`
  table (`source` column), so one blended accuracy number covers both
  instead of only ever measuring the dashboard's buy-zone calls.
- **`sync-rotation-snapshot` retired its own scoring** — it now reads
  the canonical `signal_runs` row instead of re-implementing scoring,
  eliminating a third, independently-drifting formula.

---

## 📦 Repo layout & workflow

This repo (`rotatortool-official.github.io`) is the **deployed site** —
what GitHub Pages actually serves. It intentionally does **not**
contain everything related to the project:

- `rotator-engine/`'s template, build tooling, and test suite; the
  `rotator-fixture/` test data; the `promptove/` planning notes; and
  push-safety checklists live in a **separate local workbench folder**,
  not committed here. Only the *built* `rotator-engine/engine.js` is
  in this repo, because `index.html` loads it directly.
- If you're working from that workbench, treat it as the editing
  location and this repo as the copy that gets pushed — don't edit
  both independently or they'll drift.

**Line endings:** `.gitattributes` locks everything to LF
(`* text=auto eol=lf`). Without this, Windows tools (Explorer
copy/paste, some drag-and-drop uploads) introduce CRLF, and git then
reports nearly every file as "modified" even though nothing actually
changed — pure noise that buries real diffs. If you ever see that
happen again, don't commit through it — check `git diff
--ignore-space-at-eol --stat` first to find the *real* changes.

**Pushing:** use GitHub Desktop (or `git` directly) against a real
local clone, not the raw github.com drag-and-drop web uploader — the
web uploader ignores `.gitignore` entirely, which is how secrets or
stray files can leak. `.gitignore` here excludes `.env`,
`node_modules/`, OS/editor cruft, and local tool config.

**Deploying `compute-signal-run` needs a byte-exact path.** It ships a
~43KB vendored engine bundle (`_vendor/rotator-engine/engine.js`) full
of long runs of box-drawing and alignment characters. Any deploy route
that requires the file contents to be re-typed or re-emitted (including
the Supabase MCP connector) can silently miscount those runs and corrupt
the live engine. Deploy it only with a tool that reads bytes from disk:

```bash
supabase functions deploy compute-signal-run --project-ref wyvwycatgexpbugzkdfw --no-verify-jwt
```

`--no-verify-jwt` is required — the function does its own secret-based
auth, and enabling JWT verification breaks the cron. Also check the
local copy against what is actually deployed before pushing it up; it
has drifted before, and deploying a stale local copy silently reverts
production.

Because of this, **prefer changes that derive from already-stored data**
— SQL views and triggers need no deploy, carry no corruption risk, and
apply retroactively to existing rows. `signal_run_l2_parts` and the
`input_freshness` trigger both took that route deliberately.

---

## ⚠️ Things to not change without being told

- The tutorial system (`js/tutorial.js` + `SWAP_TUT_STEPS` in `index.html`)
- The Pro referral logic (`js/pro-system.js`)
- The yellow notepad card style in light mode (`:root.light .tile-detail`)
- The `initCollapsible()` function — it handles localStorage state
- The `initNavToggle()` function — handles second-press close behaviour
- The donation wallet address in the donate modal
- The Supabase URL/key in `js/supabase.js`
- The `PRO_PLANS` pricing without user approval
- The `FREE_CATEGORIES` list — controls what free users can access
- `rotator-engine/engine.js` — generated output; edit the template and
  rebuild if you have access to it, otherwise treat as read-only here
- Any RPC's parameter list without dropping the superseded overload in
  the same migration (see the "RPC overload trap" note above)

---

## 🚀 Deploying to GitHub Pages

1. Commit and push to `main` via GitHub Desktop (or `git push`)
2. `index.html` must stay at the repo root
3. The `js/` folder must stay next to `index.html`
4. GitHub Pages is already enabled (Settings → Pages → source: main branch)
5. Give it about a minute to rebuild, then check with a cache-buster:
   `https://rotatortool-official.github.io/js/data-loaders.js?x=1`
   (bump the number each time — browser and CDN both cache aggressively)

> ⚠️ GitHub Pages only works on **public repos** for free accounts.
> For a private repo use **Netlify** (free, connect to private GitHub repo).

---

## 🔒 License & Protection

- `LICENSE.txt` is in the root — All Rights Reserved
- Do not add DevTools/right-click blocking if you need F12 for debugging
- JS obfuscation recommended before major public releases
- DMCA takedowns can be filed at github.com/contact/dmca

---

*ROTATOR © 2026 — All Rights Reserved*
