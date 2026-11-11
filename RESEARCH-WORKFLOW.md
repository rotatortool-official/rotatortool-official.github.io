# Rotator Research workspace

Native extension of `board.html`, reached through **Today → Research workspace** (`#today-research`). Desktop rail and mobile Today pills use the existing board router. The legacy `#sec-research` address also works.

## Ownership

`js/research-workflow.js` owns editorial research runs; `research-workflow.css` owns their scoped presentation. Inputs are a defensive copy of `window.ROTATOR_RUN`, optional `window.fearGreed`, and author-entered research. Outputs are browser-local run records and JSON packages. Consumers are the Research UI and the same-page agent interface. The scoring engine and existing `SignalHistory` remain separate owners; this feature never scores an asset or writes a market-data row.

## User workflow

Capture the loaded engine run, or create a manual run. Add regime, sentiment, market coverage, strongest/weakest assets, changes, paths, source timestamps and limitations, and a research narrative. Asset descriptions are manual editorial inputs. Forex has no added data feed.

Enter the existing published Rotator research-page URL and prepare drafts. Both use that URL; the Substack draft is titled “Today’s Rotator Map.” Drafts are deterministic templates from entered research, not automated news gathering or AI synthesis. Edit and save before leaving. Stage controls record CONTENT → WEBSITE → DEEP RESEARCH → TELEGRAM → RETURN VISIT; they do not send or publish.

Filter unfinished runs, revisit them, compare two saved runs, and export a completed package containing the snapshot, narrative, drafts, sources, timestamps and workflow. Completion requires all stages, core research fields, return findings, the Substack title and matching links. Backup works for unfinished runs; Import restores a non-duplicate package without replacing an existing run.

## Storage and limitations

Records live only in localStorage (`rot_research_runs_v1`) for the current origin/browser/device. This is not account-backed private storage or cloud synchronization. Other scripts on the same origin can access it. Export backups before clearing browser data. A localhost preview has a different store from production. Storage failure and competing-tab writes are reported instead of silently overwriting; unsaved edits trigger a navigation warning. Research pages must already exist: this feature does not publish a page per run.

## Same-page agent interface

`window.RotatorResearch.version === 1`

```js
const run = RotatorResearch.captureCurrent(); // requires loaded engine data
const manual = RotatorResearch.createManual();
RotatorResearch.list(); // defensive copies
RotatorResearch.get(run.id);
RotatorResearch.update(run.id, {
  narrative: 'Evidence, competing explanations, and uncertainty.',
  workflow: { CONTENT: true }
}, run.revision); // optimistic revision check; throws on conflict
RotatorResearch.exportPackage(run.id); // validated complete object
```

Supported update fields: title, date, regime, fearGreed, strongest, weakest, changes, paths, sources, narrative, researchUrl, substack, telegram, returnDate, returnNotes, workflow. Unsupported fields and non-text inputs are rejected. Agent mutations stop if the UI has unsaved edits. No agent method sends messages or publishes content. Successful saves dispatch `rotator:research-saved` with `{id, revision}`. This is a same-page JavaScript interface, not a hosted MCP service or background agent.

## Validation and rollout

Run `node --check js/research-workflow.js`, `node --check js/board-tabs.js`, and `node --test tests/research-workflow.test.cjs` from the site root. Browser QA used the complete existing board: run creation, capture, draft generation, save, validation, and a downloaded completed package. Existing PWA snapshot caching discovers the new script and stylesheet from board.html automatically.

Changes are on `codex/research-workflow`. Review the additive patch before merging into the GitHub Pages main branch. No live site deployment, database migration, posting, or scoring-engine change was performed.
