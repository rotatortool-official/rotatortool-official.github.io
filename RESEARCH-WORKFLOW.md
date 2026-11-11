# Rotator Research

Research is a native board tab at `board.html#research`. Desktop uses the existing top navigation and rail. On phones it is in More. Previous `#today-research` and `#sec-research` links resolve to the research desk.

## User flow

1. Capture & build today’s map waits for existing Rotator feeds (up to 12 seconds), captures an immutable observation, and builds an editable article and Telegram draft.
2. Select affected assets and include or remove suggested evidence sections. Captured observations and missing research are visibly distinguished. Add interpretation and source links per section; the observation notebook holds the longer manual inputs.
3. Review Today’s Rotator Map and its available graphs. Edited article text is retained when saving. If evidence inputs change, preview and sharing exports require a rebuild, so text and graphs cannot silently describe different inputs. Rebuilding uses an inline confirmation and preserves the text until confirmed.
4. Download HTML or Markdown, copy the Telegram draft, and download graph PNG/SVG files. Exporting does not publish or send anything. The article, graph branding and Telegram draft point back to the chosen published Rotator page.
5. Save the run, revisit unfinished work, compare observations, record the five workflow stages and return-visit findings, and export the completed JSON package. Backups also work for unfinished runs; imported duplicates never overwrite existing runs.

## Data and ownership

`js/research-story.js` owns editorial composition, source formatting and graphs. `js/research-workflow.js` owns records, UI, validation, sharing outputs and the same-page agent interface. `research-workflow.css` scopes research surfaces and improves board rail contrast. The existing board router owns navigation.

Captured inputs are `ROTATOR_RUN`, public asset readings in `coins`, `fearGreed`, `_worldData`, `_etfFlows`, `_tokenUnlocks`, and the existing `_tileNews` / `_tileWeekly` feeds. Market-event news uses the board's expiry date; weekly context is retained only within its existing 10-day freshness window. Headlines retain original sources and dates. No new external news service, AI provider, scoring model or database table is introduced.

The engine remains the only owner of market scoring. The feature displays captured engine scores and trailing price changes; it does not derive new scores, thresholds, eligibility rules or trading decisions. The article is a deterministic, editable educational draft. Headline context is not presented as verified causation. Rate levels are distinguished from dated policy decisions. Unlock coverage is partial; a missing schedule never means no future unlock.

Stocks mean Rotator's existing tokenized-stock universe. Forex context can be entered manually; no new forex feed is claimed. Missing feeds produce research gaps, not invented observations or chart values. Up to two graphs are suggested from the enabled sections: asset seven-day changes, completed ETF flow bars, then sentiment. All captions name the measurement, source and observation date where available. Incomplete ETF reports are excluded.

## Storage

Runs are stored in localStorage under `rot_research_runs_v1`, for the current browser/device/origin. This is not account synchronization. Other scripts on the same origin can access that store. Export backups before clearing browser data or moving devices. Competing tabs and storage failures are reported; a failed write never silently replaces saved state. Unsaved edits block switching runs and show a browser-leave warning.

Legacy runs remain readable and editable. Rebuild their article to create the new text/graph input fingerprint. A JSON backup includes the run and graph SVGs; an up-to-date article also includes its standalone HTML. The completed package requires all five workflow stages, source context, matching research links, the required article title and return findings.

## Developer and agent interface

`window.RotatorResearch.version === 2`. Methods return defensive copies. Updating a record requires its current revision; conflicting writes throw.

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
