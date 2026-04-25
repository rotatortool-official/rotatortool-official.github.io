# ROTATOR — File Structure & Developer Guide

## How to edit without breaking things

Each file has ONE job. Edit the right file for what you want to change.

---

## 📁 File Map

| File | What it controls | Edit when you want to... |
|------|-----------------|--------------------------|
| `js/config.js` | Coin lists, forex pairs, stocks, donation goal, Pro tier plans | Add/remove assets, update donation target, change Pro pricing |
| `js/api-pool.js` | Fetch logic, proxy rotation, caching, AV keys | Add API keys, change cache times, add a new proxy |
| `js/pro-system.js` | Referral system, Pro modal, tier badge, Pro feature gates, Telegram Pro-gate | Change Pro modal wording, referral count, locked features, community links |
| `js/signals.js` | Rotation tiles, leaderboard, scoring engine, category locks | Change signal thresholds, scoring weights, free/pro category list |
| `js/holdings.js` | Holdings panels (crypto/forex/stocks) + portfolio signals | Change tile appearance, P&L display, holdings limits (5 free / unlimited Pro) |
| `js/tutorial.js` | Onboarding tutorial steps | Edit tutorial text, add/remove steps |
| `js/i18n.js` | Translations / language strings | Add or edit language support |
| `js/ratio.js` | Swap calculator, ratio tracker, coin picker panel | Edit swap tool logic, chart, saved pairs |
| `js/data-loaders.js` | Data fetching, mode switching, mobile nav, auto-refresh, Insight Engine gating | Change refresh interval, add data sources |
| `js/supabase.js` | Cloud sync for Pro status (Supabase REST API) | Change Supabase URL/key, modify Pro persistence logic |
| `styles.css` | All CSS styles (dark + light theme) | Change colours, layout, animations, Pro plan cards, category buttons |
| `index.html` | HTML structure, modals (donate, pro, tip), inline JS | Change layout, modals, mobile nav, collapsible sections |

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

### Add an Alpha Vantage key (so stocks don't fail)
Open `js/api-pool.js`, find `AV_KEYS`:
```js
var AV_KEYS = ['KEY1', 'KEY2', 'KEY3'];
```
Keys rotate automatically when one hits a rate limit.

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

## ✅ Features added (March 2026 session)

- **Bottom nav toggle** — second press closes the open section
- **Top bar mobile buttons** — distinct colors per button (purple/green/amber) with bottom border accent
- **CRYPTO/FOREX/STOCKS buttons** — each has own color identity (gold/green/red) with glow on active
- **Leaderboard header** — "updated X min ago" now stacks below "CLICK COLUMN HEADERS TO SORT" to prevent overlap on mobile
- **Light mode info card** — fixed `position:relative` bug that was pushing the page down when card opened
- **Tile detail overlay** — blur removed, opacity reduced to `.18` for see-through feel
- **Typography pass** — increased font sizes across: mode labels, section headers, tabs, signal titles, leaderboard title, coin names, swap calculator labels

## ✅ Features added (April 2026 session)

### Pro Tier System (donation-based)
- **Crypto-only donations** — USDT (TRC20/BEP20/ERC20), BNB, ETH, Binance Pay; Pro auto-activates via TX-hash verification
- **Tip screen** appears after donation with thank-you message about future development
- **Pro codes** still work as alternative unlock method
- **Community channels** — Telegram signals channel (Pro-only access via `joinTelegram()` gate) and Discord placeholder
- **Referral system** still works (5 verified friends = free Pro, tracked via Supabase)
- Plans configured in `config.js` → `PRO_PLANS` array

### Pro Feature Gates (FREE vs PRO)
| Feature | FREE | PRO |
|---------|------|-----|
| Coins | Top 50 | Top 200 |
| Categories | ALL, L1, DEFI, MEME, DEMO | All 10 + DEMO |
| Holdings | 5 max | Unlimited |
| Insight Engine | Locked | Full access |
| Best Time to Swap | Locked | Full access |
| Stablecoin Yields | Locked (STABLE category) | Full access |
| Score Breakdown | Basic | Full access |

### Category Button Redesign
- 3D shadow effect with inner highlight on buttons
- Subtle glow on hover and active state
- More spacing between buttons (8px gap)
- Locked categories show 🔒 icon and redirect to Pro modal

### DEMO Category Tab
- Pulsing green button showing curated top 10 coins (BTC, ETH, BNB, SOL, etc.)
- Helps new users see how the tool works without configuration

### Supabase Cloud Sync
- Pro status persists across devices via Supabase
- Recovery key system to restore Pro on new devices
- Referral tracking stored in cloud
- Graceful fallback to localStorage if offline

---

## ⚠️ Things Claude should NOT change without being told

- The tutorial system (`js/tutorial.js` + `SWAP_TUT_STEPS` in `index.html`)
- The Pro referral logic (`js/pro-system.js`)
- The yellow notepad card style in light mode (`:root.light .tile-detail`)
- The `initCollapsible()` function — it handles localStorage state
- The `initNavToggle()` function — handles second-press close behaviour
- The donation wallet address in the donate modal
- The Supabase URL/key in `js/supabase.js`
- The `PRO_PLANS` pricing without user approval
- The `FREE_CATEGORIES` list — controls what free users can access

---

## 🚀 Deploying to GitHub Pages

1. Upload this whole folder to your GitHub repo
2. Make sure `index.html` is at the root
3. The `js/` folder must be next to `index.html`
4. Enable GitHub Pages in repo Settings → Pages → source: main branch

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
