# ROTATOR — File Structure Guide

## How to edit without breaking things

Each file has ONE job. Edit the right file for what you want to change.

---

## 📁 File Map

| File | What it controls | Edit when you want to... |
|------|-----------------|--------------------------|
| `js/config.js` | Coin lists, forex pairs, stocks, Pro codes, donation goal | Add/remove assets, add new Pro codes, update donation target |
| `js/api-pool.js` | Fetch logic, proxy rotation, caching, AV keys | Add API keys, change cache times, add a new proxy |
| `js/pro-system.js` | Referral system, Pro modal, tier badge | Change Pro modal wording, referral count needed |
| `js/signals.js` | Rotation tiles, leaderboard, scoring engine | Change signal thresholds, how many tiles show, scoring weights |
| `js/holdings.js` | Holdings panels (crypto/forex/stocks) + portfolio signals | Change tile appearance, how P&L is shown |
| `js/tutorial.js` | Onboarding tutorial steps | Edit tutorial text, add/remove steps |
| `js/data-loaders.js` | Data fetching, mode switching, mobile nav, auto-refresh | Change refresh interval, add data sources, language strings |
| `index.html` | All HTML structure + CSS | Change layout, colours, modals, add new HTML sections |

---

## 🔧 Most common edits

### Add a new Pro code
Open `js/config.js`, find `VALID_CODES`, add a string:
```js
var VALID_CODES = [
  'ROT-2026-ALPHA',
  'ROT-2026-YOURNEWCODE',  // ← add here
];
```

### Update donation progress bar
Open `js/config.js`, change:
```js
var DONATION_CURRENT = 25;  // ← amount received this month
var DONATION_GOAL    = 50;  // ← monthly target
```

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

---

## 🚀 Deploying to GitHub Pages

1. Upload this whole folder to your GitHub repo
2. Make sure `index.html` is at the root
3. The `js/` folder must be next to `index.html`
4. Enable GitHub Pages in repo Settings → Pages → source: main branch

