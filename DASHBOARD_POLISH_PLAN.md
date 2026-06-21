# EXSUM Dashboard — Polish + Determinism Plan

**Surface:** Executive Summary one-slider at `#/dashboard` (`js/app-dashboard.js`; CSS is injected from that file's `injectDashboardStyles()`, not from `css/`).
**Target display (confirmed):** Large 4K display / TV. **Text bump (confirmed):** ~30%. **Campaign lanes (confirmed):** designer's-choice — boxed cards with clear separation.

**4K-specific note for the implementer:** on a 4K viewport the existing `clamp(min, vw, max)` font sizes are pinned to their **max (rem) ceiling** (the `vw` middle term resolves far above the ceiling). Therefore the size increase MUST come from raising the **rem ceilings** (and the `vw` middle term is nudged so smaller screens still scale). Bumping only the `vw` term would change nothing on 4K.

**Files touched:** `js/app-dashboard.js`, `js/app-sync-patches.js`, `index.html` (cache-busters).
**Cache-busters:** bump both touched JS files in `index.html` to `?v=20260620-exsum-polish`.
**Out of scope (do NOT change):** the eight `.exsum-card*` metric tiles keep their current size and layout.

---

## PART A — Fix the "numbers/graphs change on refresh" bug (determinism)

Two compounding root causes; fix both.

### A1 — "Latest" is order-dependent (primary cause)
`exCards()`'s single-value cards (PCSL Acute, PCSL Follow-up, Total Surgeries) and all sparklines read "latest" as the **last array element** (`exLatest`/`exPrev`/`exTailValues`). The Firebase metric store is not guaranteed date-sorted (service-line pages sort before display; the dashboard does not), so "last element" can be a different reading for identical data between loads.

**Edit (`js/app-dashboard.js`, in `exCards`):**
- OLD: `const get = id => app.getMetricEntries(id) || [];`
- NEW: `const get = id => (app.getMetricEntries(id) || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));`

This makes every card path chronological and deterministic without mutating the shared store.

### A2 — Cards never recompute when metric data syncs in (timing race)
The campaign brief has a live subscription and the KPI chart refreshes on task changes, but the eight metric cards render once during async hydration and are never recomputed when metric series arrive. A partial-load snapshot gets frozen; how much had loaded varies with network timing.

`Sync` already calls `App.applyRemoteChange('metrics', …)` on the initial metric snapshot (every series reads as "added" on first load), so a recompute hook placed on that path will fire after hydration and converge the dashboard.

**Edit 1 — add a recompute method (`js/app-dashboard.js`, in the `Object.assign(window.App, { … })` block, immediately after `refreshExsumKpiChart() { … },`):**
```js
    refreshExsumDashboard() {
      const root = this._exsumRoot;
      if (!root || !root.isConnected) return;
      const cards = exCards(this);
      const cardsWrap = root.querySelector('.exsum-cards');
      if (cardsWrap) cardsWrap.innerHTML = exGroupedCards(cards);
      const readout = root.querySelector('.exsum-readout p');
      if (readout) readout.textContent = exSummary(cards);
      this.refreshExsumKpiChart();
    },
```

**Edit 2 — call it from the metrics sync branch (`js/app-sync-patches.js`).** Anchor is unique:
- OLD:
```js
        });
      } else if (docId === 'hedis') {
```
- NEW:
```js
        });
        if (typeof this.refreshExsumDashboard === 'function') this.refreshExsumDashboard();
      } else if (docId === 'hedis') {
```

(The dashboard has no `metric-group-section-*` / `metric-display-*` elements, so the existing per-metric updates in that branch are harmless no-ops on this view.)

**Acceptance test:** hard-refresh directly on `#/dashboard` 3+ times → identical numbers and sparklines every time.

---

## PART B — Typography +30% (title, Desired State, Access-to-Care line, readout)

All edits in `injectDashboardStyles()` in `js/app-dashboard.js`. Replace each `font-size` value (everything else in the rule unchanged).

1. **Title** `.exsum-title`
   - `clamp(1.18rem,1.82vw,1.72rem)` → `clamp(1.5rem,2.3vw,2.25rem)`
2. **Desired State** `.exsum-desired`
   - `clamp(.72rem,.87vw,.94rem)` → `clamp(.92rem,1.12vw,1.22rem)`
   - (`.exsum-desired-tag` is `.84em` of the parent, so it scales automatically — no edit.)
3. **Access-to-Care · Primary Outcome** `.exsum-access-context`
   - `clamp(.52rem,.62vw,.67rem)` → `clamp(.66rem,.8vw,.87rem)`
4. **As-of date** `.exsum-asof` (so it doesn't look tiny beside a bigger title)
   - `clamp(.58rem,.72vw,.78rem)` → `clamp(.66rem,.82vw,.9rem)`
5. **Readout sentence** `.exsum-readout p` (the "Access to Care Readout" line under the chart)
   - `clamp(.68rem,.84vw,.9rem)` → `clamp(.82rem,1vw,1.12rem)`
6. **Readout label** `.exsum-readout>span`
   - `clamp(.49rem,.59vw,.62rem)` → `clamp(.6rem,.72vw,.78rem)`

Vertical budget: headers are `flex:none`; `.exsum-lower` (chart + campaign) is `flex:1 1 auto` and absorbs the added header height. On 4K there is ample vertical headroom — no scroll. (Existing `max-height:900px`/`720px` breakpoints already protect smaller screens and are left as-is.)

---

## PART C — Chart legend + on-graph readability

All in `js/app-dashboard.js`.

### C1 — Short legend names
Add a short-label map next to `SERVICE_COLORS` (top of the IIFE):
```js
  const SERVICE_SHORT = { pcsl: 'PCSL', surgery: 'Surgery', 'mental-health': 'MHSL', emergency: 'ER', mscoe: 'MSCoE Surgeon' };
```
In `exChartData`, change the per-line label:
- OLD: `label: serviceLine.name,`
- NEW: `label: SERVICE_SHORT[serviceLine.id] || serviceLine.name,`

The bold cumulative line stays `label: 'Total'` (6th legend entry). `refreshExsumKpiChart` rebuilds datasets from `exChartData`, so short names persist across refreshes.

### C2 — Bigger legend + axis text (4K room-readability)
- Legend block:
  - OLD: `labels: { color: '#41464d', boxWidth: 10, boxHeight: 2, padding: 10, font: { size: 10, weight: '600' } }`
  - NEW: `labels: { color: '#41464d', boxWidth: 14, boxHeight: 3, padding: 14, font: { size: 13, weight: '700' } }`
- X-axis ticks: `font: { size: 9 }` → `font: { size: 11 }` (the `x` scale ticks object).
- Y-axis ticks: `font: { size: 9 }` → `font: { size: 11 }` (the `y` scale ticks object).
- Phase-band labels (BUILD / IMPROVE / REFINE) in the `exsumPhaseBands` plugin `afterDatasetsDraw`:
  - `context.font = '700 9px system-ui, sans-serif';` → `context.font = '800 11px system-ui, sans-serif';`
  - `area.top + 13` → `area.top + 15`

---

## PART D — Access-to-Care Campaign lanes (boxed cards, filled, separated)

Goal: each of the four lanes becomes a distinct card that **fills** its space with a clear **gap** between them, tied into the service-line color system (matches the metric tiles' left-accent language). Designer's call per Matt.

### D1 — Per-lane accent color (`exCampaign`, `js/app-dashboard.js`)
- OLD: `<article class="exsum-campaign-lane">`
- NEW: `<article class="exsum-campaign-lane" style="--lane-accent:${SERVICE_COLORS[lane.id] || '#8a8f98'}">`
  (Lane ids pcsl / emergency / mental-health / surgery all resolve in `SERVICE_COLORS`.)

### D2 — Lane container: add a gap (`injectDashboardStyles()`)
- OLD: `.exsum-campaign-lanes{min-height:0;flex:1 1 auto;display:grid;grid-template-rows:repeat(4,minmax(0,1fr));padding-top:clamp(3px,.45vh,6px);overflow:hidden}`
- NEW: `.exsum-campaign-lanes{min-height:0;flex:1 1 auto;display:grid;grid-template-rows:repeat(4,minmax(0,1fr));gap:clamp(6px,.85vh,11px);padding-top:clamp(3px,.45vh,6px);overflow:hidden}`

### D3 — Lane as a filled card (`injectDashboardStyles()`)
- OLD: `.exsum-campaign-lane{min-height:0;display:flex;flex-direction:column;justify-content:flex-start;padding:clamp(3px,.42vh,6px) 0;border-top:1px solid rgba(29,31,35,.11);overflow:hidden}.exsum-campaign-lane:first-child{border-top:0}`
- NEW: `.exsum-campaign-lane{min-height:0;display:flex;flex-direction:column;justify-content:space-between;gap:2px;padding:clamp(6px,.8vh,10px) clamp(8px,.7vw,12px);background:#fafbfc;border:1px solid #e7eaed;border-left:3px solid var(--lane-accent,#8a8f98);border-radius:5px;overflow:hidden}`

`justify-content:space-between` distributes head → outcome/date → action → live-update top-to-bottom so each card fills; the gap + border + colored left edge give clear separation.

### D4 — Slightly larger lane head/outcome (room-readable; within budget)
- `.exsum-lane-head strong` font-size `clamp(.57rem,.69vw,.73rem)` → `clamp(.64rem,.76vw,.82rem)`
- `.exsum-lane-outcome` font-size `clamp(.58rem,.7vw,.75rem)` → `clamp(.64rem,.78vw,.84rem)`

(Keep the existing `-webkit-line-clamp` rules and the `max-width:1500px/900px/720px` overrides as-is; the `space-between` fill plus the gap is what removes the empty-box look.)

---

## VERIFY (before commit)
1. `node --check js/app-dashboard.js && node --check js/app-sync-patches.js` → both OK.
2. Bump cache-busters in `index.html`: `app-dashboard.js` and `app-sync-patches.js` → `?v=20260620-exsum-polish`.
3. Cold-reload determinism: hard-refresh on `#/dashboard` ×3 → identical numbers, sparklines, and chart.
4. 4K display: everything on one screen, no scroll; title/Desired State/Access line visibly ~30% larger; legend reads PCSL · Surgery · MHSL · ER · MSCoE Surgeon · Total at the larger size; four campaign cards are boxed, color-edged, gapped, and filled.
5. Sanity at 1080p height: still one screen, no scroll (the flex chart/campaign row absorbs the larger headers).

## ROLLBACK
Single-commit change set; `git revert <sha>` restores prior sizing/behavior. No data-model or Firestore changes.

## DECISIONS PRE-RESOLVED (no agent judgment needed)
- Legend keeps a 6th "Total" entry. Short names exactly: PCSL, Surgery, MHSL, ER, MSCoE Surgeon.
- Cards untouched. Readout sentence + as-of date are bumped (Matt asked for "text everywhere bigger"); easy to drop if undesired.
- Campaign lanes = boxed cards w/ service-color left edge + gap + `space-between` fill.
