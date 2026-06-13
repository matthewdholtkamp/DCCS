# DCCS Debug Plan 5 — Performance, Real-Time AI Awareness, Backend Lockdown, UI Clarity, Progress & Goals Page
## Agent Handoff (Antigravity / Codex) — findings verified against live code 2026-06-11

**Baseline:** Plans 1–4 deployed on `main` (current busters v8/v6). Five workstreams. One shared engine (Phase 2's `computeStatusRollup()`) powers three of them — build order matters.

## A. HOW TO WORK
1. `git pull origin main` → `git checkout -b fix/plan5`. One commit per phase: `Plan5 Phase N: <summary>`. Update `work_log.md`. Merge authorized after Phase 6. Bump busters (+1 from current) on changed files.
2. Backup before & after (`scripts/backup_firestore.mjs`). Constraints: C1 no data loss; C2 no loss of any existing functionality; C3 AI mapped everywhere. STOP CONDITIONS: acceptance fails twice → halt + log; the Phase 1 er-patients migration aborts on any count mismatch; Phase 5 rules deploy only after its checklist is fully green.
3. Two-browser harness: `cd ~/Desktop/"Research AI" && python3 -m http.server 8000` → `/DCCS/`.

## PHASE 1 — Load & runtime performance (verified hot spots)
**Findings:** (a) all 7 scripts are parse-blocking `<script src>` tags (2× Firebase compat from gstatic, chart.umd ~205KB, data/sync/app/ask). (b) `er-patients` (~1,700 rows, ~250–300KB) lives INSIDE the metric store, so `JSON.stringify(this.cache.metrics)` runs on EVERY metric save (sync.js ~L679, ~L1091) and EVERY metrics snapshot (~L351) — main-thread jank on each save/sync. (c) repeat loads re-download/parse everything on slow gov networks.
1. **Script loading:** add `defer` to all 7 script tags (defer preserves order; `Sync.init()`/`App.init()` already run at file end — verify nothing relies on inline execution before DOMContentLoaded; move any such call into a `DOMContentLoaded` handler). Add `<link rel="preconnect" href="https://www.gstatic.com">` and `https://firestore.googleapis.com`.
2. **Evict `er-patients` from the metric store** (guarded migration): new top-level doc `dccs_data/er_patients` `{rows:[...], _ts}` + new localStorage key `dccs-er-patients`. One-time guarded copy (`_meta.erPatientsMovedV5`), verify row count matches, then REMOVE `er-patients` from `metrics/series` reads/writes/union (Plan 4 composite-key union now targets the new doc; chart reads via a single `getERPatients()` accessor). NEVER delete the old `metrics/series/er-patients` doc this round (rollback safety). All `er-patients` special-casing in AI context stays (count+range only).
3. **Debounce the localStorage mirror:** wrap store mirrors (metrics/tasks/hedis/dialogue) in a 500ms trailing debounce per key (cold-start cache only — Firestore is the source of truth; verify recovery/migration paths read the freshest in-memory store, not the mirror).
4. **PWA app shell:** `manifest.json` (name, icon from the existing SVG favicon, standalone) + `sw.js`: cache-first for the busted assets (css/js/chart.umd — busters make them immutable), network-first-with-cache-fallback for `index.html` and `ER/data.json`. Bump a `SW_VERSION` alongside busters; on activate, purge old caches. CRITICAL: never cache Firestore/gstatic/identitytoolkit API calls.
**Accept:** Lighthouse (or simple stopwatch) shows faster first render; repeat load with DevTools "Slow 3G" is near-instant from SW cache; typing/saving a metric produces no >16ms long task from JSON serialization (Performance panel spot-check); er-patients row count identical pre/post migration; Unit Volume + ED charts unchanged; offline reload still renders with cached data.

## PHASE 2 — `computeStatusRollup()` + Ask Dr. Holtkamp real-time awareness with LESS lag
**Finding:** `data.js` tracked metrics already carry machine-readable `goal` and `direction` fields — no text parsing needed (HEDIS goals are simple "≥90%" strings; parse the number).
1. Build `App.computeStatusRollup()` (pure function over live stores, computed fresh on every call): per service line → per tracked metric: `{latest, latestDate, goal, direction, pctToGoal, trend4wk (avg of last 4 entries vs prior 4), status: on-track|behind|no-goal|stale(>14d no entry)}`; per phase: task status counts + KPI completion x/y; per service line: open dialogue/roadblock count (last 30d) and newest entry date; HEDIS: each measure latest vs goal. Cheap (<5ms) — memoize per route render, invalidate on `applyRemoteChange`.
2. **AI context diet with MORE intelligence:** in `buildDccsContext`, replace the 90-entries-per-series raw dumps with: the full rollup (every service line, every metric — complete situational map) + last 10 raw entries per metric for specifics + dialogue/HEDIS/task summaries as today. Context shrinks several-fold → faster first token. Because the rollup is computed from the live store at send time, the AI sees data added seconds earlier and can directly answer "what's going on right now / where should we put effort / how are our KPIs."
3. Add to `DCCS_CONTEXT_RULES`: when asked for priorities/effort, reason from `status`, `pctToGoal`, `trend4wk`, and stale flags; always name the service line and metric; recommend, don't fabricate.
4. Optional latency knob (flag only, do NOT change): note in work_log that the Cloudflare Worker's model choice is the other half of AI latency — Matt can A/B a faster model in the Worker config separately.
**Accept:** ask "where should we put our effort right now?" → answer cites concrete metrics with current values, goals, trends, staleness — and reflects a data point added 30 seconds earlier; measured time-to-first-token improves vs pre-change (log both); all Plan 3/4 AI behaviors (confirmation cards, deletes, clarifying questions, voice, persistence) regress-tested; AI still reachable in every view + both modes.

## PHASE 3 — Progress & Goals page (new functionality, explicitly authorized)
1. New route `#/goals` + sidebar tab **“Progress & Goals”** (placed right after the landing/overview link). Read-only v1 — displays, never edits (zero data risk).
2. Layout, powered ENTIRELY by `computeStatusRollup()`:
   - **Command Summary strip** (top): counts — metrics on-track / behind / stale, KPIs complete x/y overall, open roadblocks; “biggest mover” (largest |trend4wk|).
   - **Per service line section:** each tracked metric as a row — name, mini sparkline (reuse existing SVG sparkline helper), latest value + date, goal + direction, progress bar (% to goal; hide for no-goal metrics), trend arrow (▲▼—), status pill, stale ⚠ if >14d. HEDIS table vs ≥90% goals. Phase/KPI completion bar per phase.
   - Each row links to its service-line tab for data entry.
3. Print-friendly CSS (`@media print`) so the page doubles as the weekly goals one-pager. Presentation-mode inclusion NOT in scope this round.
**Accept:** page renders every tracked metric across all service lines with correct latest/goal/trend math (spot-check 5 against raw entries); empty/no-goal/stale metrics render gracefully; updates live (scoped patch) when another browser adds a point; loads in <100ms from cached stores; nothing else on the site changed.

## PHASE 4 — UI clarity: landing + tab headers (authorized additions, minimal visuals)
**Finding:** the landing page is static (mission, phase strip, leadership, motto) — no live status, no “what do I do.”
1. **Landing status cards:** below the phase strip, one card per service line (from the rollup): freshness (“Updated 2d ago” / “⚠ No entries in 16d”), metrics on-track x/y, open roadblocks count; click → that tab. Keep the existing header/mission/motto untouched above and below.
2. **Per-tab purpose header:** under each service-line tab title, one supplied line + a collapsed “How to use this page” disclosure (reuse `toggleDropdown`) with exactly: “① Enter this week's numbers in each metric card (date defaults to today). ② Log wins/roadblocks in the Weekly Dialogue. ③ Update task status and check off KPIs as they complete.” MSCoE/ED variant: “Charts update automatically from the ER feed — use the drill-down and date range to explore; no manual entry needed here.”
3. **Freshness chips on metric cards:** small “last entry: <date>” chip, amber ⚠ when >14 days. No other styling changes.
**Accept:** a first-time user can tell from the landing which service lines need attention and where to click; each tab states its purpose in one line; chips show correct dates; zero functional change elsewhere; both modes unaffected.

## PHASE 5 — Backend lockdown (invisible to users) — DO LAST
Goal: bots/scripts can no longer read or write the database; users notice nothing. Code is flag-gated from Plan 1 Phase 6 — verify it survived Plans 2–4 refactors.
1. **Backup interlock FIRST:** update `scripts/backup_firestore.mjs` + the nightly workflow to authenticate via anonymous sign-in over REST (POST `identitytoolkit.googleapis.com/v1/accounts:signUp?key=<public web key>` → `idToken` → `Authorization: Bearer` on Firestore REST). No secrets needed. Verify it works while rules are still open.
2. **MANUAL (Matt, ~2 min):** Firebase console → Authentication → Sign-in method → enable **Anonymous**. Agent STOPs and requests this in work_log if not done.
3. Set `DCCS_AUTH_ENABLED = true` (config.js), deploy, verify on the GOV laptop with rules still open: console shows anonymous sign-in success, badge Synced. If the gov network blocks `identitytoolkit.googleapis.com` → STOP, revert flag, log (site keeps working; lockdown deferred).
4. Deploy locked rules (replace `firestore.rules` with the verified `.proposed`: `match /dccs_data/{document=**} { allow read, write: if request.auth != null; }`) via `firebase deploy --only firestore:rules` (if CLI unauthenticated → hand command to Matt).
5. **Verify:** unauthenticated REST probe now 403 on read AND write; site reads/writes normally on two machines incl. gov laptop; AI commands work; nightly backup run (manual dispatch) succeeds with auth. **Rollback:** redeploy open rules (one command) — keep the old rules text in work_log.
**Accept:** all of step 5 green. Zero user-visible change: no login screen, no new clicks.

## PHASE 6 — Verification (log in work_log.md)
1. Full regression: metric/dialogue persistence, ER full-vs-30 charts, Unit Volume drill-down + dates, AI confirm/delete/voice/persistent panel, attribution + undo, Meeting + Presentation modes, badge Synced.
2. Performance evidence: before/after load timings (cold + repeat), serialization long-task check, AI time-to-first-token.
3. Two-machine live test incl. gov laptop post-lockdown.
4. Backups: nightly dispatch run post-lockdown; counts match a fresh manual export.

## DEFINITION OF DONE
Site loads near-instantly on repeat visits and saves without jank; Dr. Holtkamp answers “what's going on right now / where do we put effort / KPI status” from live data, faster than before, everywhere; database closed to anyone but the app with zero user friction; landing + tabs tell users what to do and what they're seeing; a standalone Progress & Goals page tracks every goal with live progress; nightly backups still running; all data intact (verified by count diffs).
