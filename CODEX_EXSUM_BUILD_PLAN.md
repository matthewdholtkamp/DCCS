# CODEX BUILD PLAN — Executive Summary (EXSUM) Dashboard

**Owner:** LTC Holtkamp (DCCS). **Builder:** CODEX. **Status:** ready to execute.
**One-line intent:** Replace the current weak Dashboard with a single-screen, briefing-slide
Executive Summary of clinical operations across service lines — read-only, PowerBI-style.

---

## 0. GUARDRAILS (do not violate)

1. **Read-only.** This feature only *reads* existing data. Do **not** add, edit, migrate, or
   re-shape any stored data, and do **not** modify the data model in `js/data.js`.
2. **Do not touch** these — they are finished and in production:
   - `js/app-rollup.js` (Weekly Rollup)
   - `js/ask-dr-holtkamp-sitrep.js` and `js/ask-dr-holtkamp.js` (SITREP + assistant)
   - `js/app-service-collab.js` (dialogue threads) — read from it, never change it
   - `js/sync.js`, `js/data.js`
3. **Isolation / no bloat.** All new code goes in the **single existing file `js/app-dashboard.js`**,
   which you will **rewrite** as the EXSUM module. Do **not** spread logic into `app.js`,
   `app-core.js`, `app-metrics.js`, etc. Keep the entry point `App.renderDashboard(el)` and the
   self-injected nav style so **routing and `index.html` need ZERO changes** (the `#/dashboard`
   route and the "Dashboard" nav button already call `renderDashboard`).
4. **No new dependencies.** Chart.js is already loaded (`js/chart.umd.min.js`, global `Chart`).
   Use it for the line graph. Draw phase bands with a small inline custom plugin — do **not** add
   the annotation plugin or any other library.
5. **Fit-to-screen.** This is a true briefing slide: everything fits the white content area on one
   screen with **no scrolling**. Size regions with the available height; scale type/cards to fit.
6. Verify with `node --check js/app-dashboard.js` before finishing. Keep the file lean and commented.

---

## 1. ENTRY POINT & STRUCTURE

- Rewrite `js/app-dashboard.js`. Keep the IIFE + `Object.assign(window.App, { ... })` pattern.
- Keep/keep-working: `App.renderDashboard(el)` (entry), and the injected `.nav-dashboard` styles
  (so the existing nav button keeps its look). Everything else in the old file is replaced.
- Self-contained: the module injects its own `<style id="exsum-styles">` (guard against double-inject),
  builds all DOM via template strings, and instantiates one Chart.js chart.
- Destroy the chart instance on re-render (store it on `this._exsumChart` and `.destroy()` before
  re-creating) to avoid Chart.js canvas reuse errors.

## 2. DATA ACCESS (use existing App accessors — do not re-implement storage)

- Metric raw entries: `App.getMetricEntries(metricId)` → array of `{date:'YYYY-MM-DD', value, by}`,
  sorted ascending. (Use this, NOT `getMetricDisplayEntries`, so you control the math.)
- Task KPI state: `App.getTaskData(taskId)` → `{status, kpis:{}, kpiDates:{}, deletedKpis:{}, customKpis:[]}`.
  A KPI is **completed** iff `kpis[key] === true`; its completion date is `kpiDates[key]`
  (`'YYYY-MM-DD'`). Built-in keys are numeric indices; custom keys are `'custom-<i>'`.
  Exclude any built-in index present in `deletedKpis`.
- Framework constants from global `FRAMEWORK` (js/data.js): `FRAMEWORK.desiredState`,
  `FRAMEWORK.phases[]`, `FRAMEWORK.currentPhase`, `FRAMEWORK.serviceLines[]`, `FRAMEWORK.crossCuttingTasks[]`.

### Helper functions to implement INSIDE this module (small, pure):
- `exLatest(entries)` → last entry (most recent) or null.
- `exPrev(entries)` → second-to-last entry or null.
- `exWindow(entries, days, endISO)` → entries with date in `[endISO-(days-1), endISO]`.
  `endISO` defaults to the latest entry's date (NOT today — base "last 7 days" on the most recent
  data, so a quiet weekend doesn't blank the card). State this clearly in a comment.
- `exSum(entries)`, `exAvg(entries)` → sum / average of `.value` (avg over count of entries present).
- `exMonthBucket(entries, 'YYYY-MM')` → sum of values whose date starts with that month.
- `exDaysAgoISO(endISO, n)` for window math.

## 3. LAYOUT (true slide, fills `#app`, no scroll)

```
┌───────────────────────────────────────────────────────────────────────┐
│  DESIRED STATE  (thin full-width band, small italic text)               │  ~7% height
├───────────────────────────────────────────────────────────────────────┤
│  [C1][C2][C3][C4][C5][C6][C7][C8]   (8 equal cards, one fl: row)         │  ~26% height
├───────────────────────────────────────────┬───────────────────────────┤
│  LEFT  (~58% width)                        │  RIGHT (~42% width)        │
│  ┌─────────────────────────────────────┐  │  CAMPAIGN STRIP            │
│  │ Cumulative KPIs line chart (canvas) │  │  (full 3-phase vertical    │  remaining
│  │  fills the left column              │  │   timeline, current phase  │  height
│  └─────────────────────────────────────┘  │   dominant)                │
│  2-sentence main-effort summary           │                           │
└───────────────────────────────────────────┴───────────────────────────┘
```

- Outer container: `display:flex; flex-direction:column; height: calc(100vh - <topnav height>);`
  Use the actual content area — the page already has fixed top nav + left sidebar; `#app` is the
  white region. Set the EXSUM root to fill `#app` (height:100%, overflow:hidden).
- Card row: `display:flex; gap; ` each card `flex:1 1 0` so all 8 are equal width.
- Lower region: `display:flex` with left column `flex: 0 0 58%` and right `flex: 0 0 42%`.
- Scale fonts with `clamp()` and the card/strip paddings so nothing overflows at common laptop
  heights (~720–900px) or a conference display. Never introduce a scrollbar.

## 4. THE 8 CARDS (left→right order is fixed)

Each card: small label (top), **big current value** (color-coded by threshold), a small **arrow**
(▲/▼) vs the prior comparable timeframe with the delta, and a tiny caption of the timeframe.
Arrow tint: green if the movement is **favorable** for that metric's better-direction, red if
unfavorable, grey if flat/no prior. (Arrow = direction of raw change; tint = good/bad.)

> Color bands below set the **card value color**. Use these exact hexes:
> green `#3fa45b`, amber `#e0a23d`, red `#d2433a`, black `#1d1f23` (value on a light chip), grey `#8a8f98`.

| # | Card label | Metric ID(s) | Value shown | Color thresholds | Arrow vs |
|---|-----------|--------------|-------------|------------------|----------|
| 1 | PCSL Acute (hrs) | `pcsl-acute` | most-recent entry value | green <24, amber 24–48, red >48 | prior entry |
| 2 | PCSL Follow-up (days) | `pcsl-followup` | most-recent entry value | green <7, amber 7–10, red >10 | prior entry |
| 3 | Total Surgeries (wk) | `surgery-total` | most-recent weekly entry | green ≥40, amber 20–39, red 10–19, black <10 | prior entry (prior week) |
| 4 | MH Referrals Off-Post (mo) | `mh-active-duty-off-post` | current calendar-month sum | green <6, amber 6–15, red >15 | prior month sum |
| 5 | ER LWOBS % (7d) | `er-lwobs` ÷ `er-total-census` | sum(LWOBS,7d)/sum(census,7d)×100, 1 dp | green <1%, amber 1–2%, red >2% | prior 7d |
| 6 | ER Avg Census (7d) | `er-total-census` | avg/day over last 7d, 0 dp | informational (neutral grey), no threshold | prior 7d |
| 7 | Trainees/day in ER (7d) | `er-total-trainees` | avg/day over last 7d, 0 dp | green <10, amber 10–15, red >15 | prior 7d |
| 8 | Cat 4/5 Trainees/day (7d) | `er-esi-4-5` | avg/day over last 7d, 1 dp | green <4, amber 4–7, red >7 | prior 7d |

**CONFIRM (flagged for LTC Holtkamp):**
- **Cards 7 & 8 data source.** MSCoE has no tracked metrics of its own; the only captured daily
  trainee counts live in the ER's `er-trainee-acuity` group. So Card 7 = `er-total-trainees`
  (total trainees seen in the ER/day) and Card 8 = `er-esi-4-5` (low-acuity "Cat 4/5" trainees/day),
  both framed as the MSCoE trainee-care signal (fewer in the ER = better). Confirm this is the intent.
- **Card 3 surgery bands.** Boundaries set to green ≥40, amber 20–39, red 10–19, black <10
  (closing the gaps in the spoken thresholds). Confirm.
- **Card 6** has no stated threshold, so it renders neutral/informational (value + arrow only). Confirm.
- "Last 7 days" is anchored to the **most recent entry date** for that metric, not literally today,
  so the card never blanks on a reporting gap. Confirm acceptable.

## 5. LEFT COLUMN — Cumulative KPI line chart + summary

### Chart (Chart.js line)
- **Y axis:** cumulative count of completed task KPIs. **X axis:** time, **1 Aug 2025 → 1 Aug 2027.**
- **One line per service line** (`pcsl`, `surgery`, `mental-health`, `emergency`, `mscoe`) + **one
  "Total" line** (bold/thicker). Total = all service-line completions **plus** cross-cutting tasks.
- Build each series by: for every task in `sl.tasks` (and `FRAMEWORK.crossCuttingTasks` → Total only),
  read `getTaskData(task.id)`; for each completed KPI (`kpis[k]===true`, not in `deletedKpis`) take
  `kpiDates[k]`; ignore completions with no date. Sort all dates; produce a **monotonic step series**
  = cumulative count at month granularity across the Aug-25→Aug-27 axis.
- Recompute on every `renderDashboard` call so it reflects KPIs added/deleted live.
- Colors: PCSL `#5aa9e6`, Surgery `#7c3aed`, Mental Health `#46523f`, ED `#d2433a`,
  MSCoE `#ffb81c`, **Total** `#e8e8e8` (thicker, on top). Match the dark Army theme; legend on.
- **Phase bands (inline custom plugin, no extra lib):** shade 3 vertical background bands and label
  them on the x-axis from `FRAMEWORK.phases[].dateRange`:
  BUILD 1 Aug 2025–1 Mar 2026 · IMPROVE 1 Mar 2026–10 Aug 2026 · REFINE 10 Aug 2026–1 Jul 2027.
  Keep bands subtle (low-alpha fills) with a small uppercase label per band so it is not overwhelming.

### 2-sentence summary (deterministic — NO AI call)
Directly under the chart, ≤2 sentences, generated from data:
- Sentence 1: name the **current main effort** = the active phase
  (`FRAMEWORK.phases.find(p=>p.status==='active')`, currently Phase 2 "Improve", main effort
  **LOE 1 — Medically Ready Force**) and its thrust (drive DHA access/throughput).
- Sentence 2: state posture of the **main-effort metrics** using current card values —
  `pcsl-acute`, `pcsl-followup`, `surgery-total`, `er-lwobs` (e.g., "Acute access at Xh and follow-ups
  at Yd against the <24h/<7d standard, surgical volume Z/wk, ER LWOBS W%.").
- Keep it factual and accomplishment-framed. Hard cap 2 sentences. (Hook left open to swap for an
  AI-written version later; not in scope now.)

## 6. RIGHT COLUMN — Full campaign strip (Main Effort & Decisive Points)

- Vertical timeline of all 3 phases from `FRAMEWORK.phases[]`, top (Build) → bottom (Refine).
- For each phase show: name + `dateRange`, **main effort** (`mainEffort`), and its **decisive point**
  (`decisivePoint.name` + `date`). Use `phase.status` (`complete`/`active`/`upcoming`) for styling.
- **Current phase dominant:** the `active` phase (Phase 2) is visually largest/brightest (gold accent
  `#ffb81c`); `complete` phases muted/checked; `upcoming` phases dimmed. Mark decisive points as nodes
  on the spine; the next upcoming decisive point (Change of Command, 10 Aug 2026) emphasized.
- This is a static read of `FRAMEWORK.phases` — no metrics, no data writes.

## 7. THEME TOKENS (reuse existing CSS variables)

Use the app's existing variables so it matches: `--gold (#ffb81c-ish)`, `--gold-light`,
`--text-primary/secondary/muted`, `--border-subtle`, `--border-accent`, `--transition`.
Card surfaces `rgba(255,255,255,0.03)`, borders `var(--border-subtle)`. Status hexes per §4.

## 8. ACCEPTANCE CRITERIA

1. `node --check js/app-dashboard.js` passes.
2. `#/dashboard` renders the EXSUM; no console errors; chart draws; re-navigating to it twice does not
   throw a Chart canvas-reuse error (chart destroyed on re-render).
3. No scrollbar appears in `#app` at a 1366×768 and a 1920×1080 window.
4. Eight cards compute and color per §4 from live data; arrows reflect prior-period deltas.
5. Line chart shows 6 lines, Aug-25→Aug-27 axis, subtle phase bands, and updates if a KPI is
   toggled on a service-line page.
6. Right strip shows all 3 phases with Phase 2 dominant and the CoC decisive point emphasized.
7. `index.html`, `app-routing.js`, and all files in §0.2 are unchanged. Diff is limited to
   `js/app-dashboard.js`.
8. Bump the `app-dashboard.js` cache-buster in `index.html` ONLY if required to force reload
   (single-line change allowed: `?v=...`); otherwise leave index.html untouched.

## 9. COMMIT

Single commit, message:
`EXSUM Dashboard: single-screen clinical-ops briefing (8 status cards, cumulative KPI chart, campaign strip) — read-only rewrite of app-dashboard.js`
Then push to `origin/main`.
