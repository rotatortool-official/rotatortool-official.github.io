# Rotator Research

Research is a native board tab at `board.html#research`. Desktop uses the existing top navigation and rail. On phones it is in More. Previous `#today-research` and `#sec-research` links resolve to the research desk.

## User flow

1. Choose an asset or a preset: coin spotlight, ETF inflows, ETF outflows, sentiment, banking and rates, energy, or DeFi/TVL.
2. Create my edition loads existing feeds, captures an immutable reading, and prepares the article automatically. Evidence and editorial controls are collapsed and optional.
3. Read the preview and download the Substack edition ZIP. It includes the article, recorded-data charts, and dedicated Threads, Instagram, and Telegram components. No manual interpretation or review checkbox is required.

Publish the article yourself, then optionally paste its HTTPS article permalink and refresh captions. Channel links use the same article with separate attribution parameters; this is link tagging, not an analytics collector. Nothing posts or schedules content. Saved runs, comparisons, backups, and the old five-stage tracker remain available.

This is an incremental public release. The holdings-first entry point and server-enforced Pro news/graphic generation are future work. Current browser-generated articles and graphics are not a protected paid service. The existing paused AI assistant is unchanged.

## Data and ownership

`js/research-story.js` owns snapshot capture, source formatting and base graphs. `js/research-publication.js` owns preset composition, topic charts, social components, and local ZIP packaging. `js/research-workflow.js` owns records, UI, validation, sharing outputs and the same-page agent interface. `research-workflow.css` scopes research surfaces and improves board rail contrast. The existing board router owns navigation.

Captured inputs are `ROTATOR_RUN`, public asset readings in `coins`, `fearGreed`, `_worldData`, `_etfFlows`, `_tokenUnlocks`, and the existing `_tileNews` / `_tileWeekly` feeds. Market-event news uses the board's expiry date; weekly context is retained only within its existing 10-day freshness window. Headlines retain original sources and dates. No new external news service, AI provider, scoring model or database table is introduced.

The engine remains the only owner of market scoring. The feature displays captured engine scores and trailing price changes; it does not derive new scores, thresholds, eligibility rules or trading decisions. The article is a deterministic, editable educational draft. Headline context is not presented as verified causation. Rate levels are distinguished from dated policy decisions. Unlock coverage is partial; a missing schedule never means no future unlock.

Stocks mean Rotator's existing tokenized-stock universe. Forex context can be entered manually; no new forex feed is claimed. Missing feeds produce research gaps, not invented observations or chart values. Up to two graphs are suggested from the enabled sections: asset seven-day changes, completed ETF flow bars, then sentiment. All captions name the measurement, source and observation date where available. Incomplete ETF reports are excluded.

## Storage

Runs are stored in localStorage under `rot_research_runs_v1`, for the current browser/device/origin. This is not account synchronization. Other scripts on the same origin can access that store. Export backups before clearing browser data or moving devices. Competing tabs and storage failures are reported; a failed write never silently replaces saved state. Unsaved edits block switching runs and show a browser-leave warning.

Legacy runs remain readable and editable. Rebuild their article to create the new text/graph input fingerprint. A JSON backup includes the run and graph SVGs; an up-to-date article also includes its standalone HTML. The completed package requires all five workflow stages, source context, matching research links, the required article title and return findings.

## Developer and agent interface

`window.RotatorResearch.version === 3`. Methods return defensive copies. Updating a record requires its current revision; conflicting writes throw.

```js
const run = await RotatorResearch.captureReady(); // same source preparation as the UI
const manual = RotatorResearch.createManual();
RotatorResearch.list();
RotatorResearch.get(run.id);
const updated = RotatorResearch.update(run.id, {
  narrative: 'Evidence, competing explanations, and uncertainty.',
  workflow: { CONTENT: true }
}, run.revision);
const drafted = RotatorResearch.buildArticle(run.id, updated.revision);
RotatorResearch.exportPackage(run.id); // validates completion and draft consistency
```

`captureCurrent()` remains available for a synchronous capture of already-loaded data. Update fields: title, date, regime, fearGreed, strongest, weakest, changes, paths, sources, narrative, researchUrl, substack, telegram, returnDate, returnNotes, workflow, and story. Story accepts `{included: [topicIds], notes: {topicId: text}, affected: [capturedAssetIds], graphCount: 1|2}`. Topic IDs: market, rates, unlocks, etf, sentiment, news. Unsupported fields, invalid captured asset IDs, unsafe URLs and malformed records are rejected. Mutations stop while the UI has unsaved edits.

Successful saves and agent draft builds dispatch `rotator:research-saved` with `{id, revision}`. This API is local to the open page. It is not a background service or hosted MCP endpoint and cannot send messages or publish articles.

## Verification and deployment

The website deploys through the canonical GitHub Pages repository's main branch. No backend or engine deployment is needed. The existing service worker discovers new versioned scripts and CSS from the saved board automatically.

Checks: `node --check` on all changed JavaScript; `node --test tests/research-workflow.test.cjs tests/research-story.test.cjs` (12 tests); Rotator's canonical engine acceptance suite (17 checks); language scan (no Tier 1 or Tier 2 issues in new modules); secrets scan (only the two existing public anon-key files in js flagged).

Browser verification exercised the integrated Research tab, prepared-feed capture, automatic article/two-graph creation and stale-input export blocking. A native browser confirmation interrupted further automation. The release replaces that confirmation with an inline action, covered by a test of save → change evidence → blocked preview → inline rebuild → save. Final publication is verified from GitHub Pages build state and live versioned assets.

## Publication quality and validation

Article figures appear beside the evidence they explain. Sources use short clickable labels while preserving their destinations. News selection is relevance-filtered; unsupported causal claims are avoided. Supply schedules require explicit vesting classification and Bitcoin is never described as a vesting unlock. ETF direction presets require a matching completed report. Topic charts retain native units, source dates, and observation spacing. TVL value changes are not labeled net flows.

The automated suite passes 20 research checks, including the rendered quick path, immutable snapshots, stale-draft guards, topic units, supply exclusions, social link consistency, and ZIP structure. The canonical engine passes all 17 acceptance checks. Local browser preview was unavailable during preparation; production file and UI verification follow deployment.
