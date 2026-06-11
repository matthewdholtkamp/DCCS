# DCCS Portal — Multi-User Stability & Performance Fix (v2)
## Agent Implementation Handoff (Antigravity / Codex)

**Repo:** github.com/matthewdholtkamp/DCCS (GitHub Pages auto-deploys from `main`)
**Local:** ~/Desktop/Research AI/DCCS
**Stack:** Static SPA, hash routing, Firebase Firestore (compat 10.8.0), Chart.js, vanilla JS. No build step.

---

## A. HOW TO WORK (read before any code)

1. `git checkout -b fix/multiuser-perf`. **NEVER merge or push to `main`** — main auto-deploys the live site. Matt merges after review.
2. One commit per phase, message format: `Phase N: <summary>`.
3. Maintain `work_log.md` at repo root: per phase, write what changed, files touched, test results, anything deferred.
4. **STOP CONDITIONS — halt and write the blocker to work_log.md instead of improvising if:** (a) any step would delete/overwrite existing Firestore data without a verified backup; (b) a change cannot be made without altering visible UI/behavior beyond what Phase 5 explicitly authorizes; (c) Firestore rules deployment is required (NEVER run `firebase deploy` — Phase 6 is code-prep only); (d) a test in the phase's acceptance list fails twice.
5. All decisions are pre-made in section D. Do not ask; do not choose alternatives.
6. After editing any JS/CSS file, bump its cache-buster query string in `index.html` (e.g. `?v=20260610-v1`) — government browsers cache aggressively.
7. Local test harness (from README): `cd ~/Desktop/"Research AI" && python3 -m http.server 8000` → open `http://localhost:8000/DCCS/` in TWO browser windows (e.g. Chrome + Safari, or normal + incognito) for every concurrency test. Serving the parent folder is required so `../Bandaid6/` persona files resolve.

### Hard constraints (non-negotiable)
- **C1 — No data loss.** Firestore collection `dccs_data` (docs: `tasks`, `metrics`, `hedis`, `dialogue`, `er_data`) and localStorage keys (`dccs-task-data`, `dccs-metric-entries`, `dccs-hedis-data`, `dccs-dialogue-entries`, `dccs-er-data`) must remain readable. Schema changes backfill from legacy and never delete legacy docs.
- **C2 — No functional/visual change.** Every view, mode, button, chart, and interaction behaves and looks identical. Only exceptions: the explicitly authorized Phase 5 items.
- **C3 — Ask Dr. Holtkamp stays wired everywhere** (Phase 5 completes the mapping).

---

## B. ROOT-CAUSE DIAGNOSIS (verified against code, June 2026)

| Symptom | Cause | Where |
|---|---|---|
| Edits "jump back and forth" with 2 users | Whole-document writes with one `_lastUpdated` per doc → last-write-wins clobbering; every remote snapshot triggers `App.route()` = FULL page re-render, destroying DOM mid-edit | `js/sync.js` `subscribe()` ~L135–215; all `save*` methods |
| ER charts extremely jumpy | Every viewer's page load writes ER-derived series INTO shared `metrics` doc (`processERData → saveMetricStore`) → bumps timestamp → fires every client's snapshot → full re-render → Chart.js destroyed/recreated | `js/sync.js` `syncERMetrics()`/`processERData()`; `js/app.js` `drawEmergencyCharts()` ~L3936 |
| Typing lags, site slow | `enablePersistence()` is single-tab (fails with 2nd tab/computer open → all reads hit network); full re-renders interrupt input; 104KB `ER/data.json` refetched+parsed per load; whole-store serialization per write | `js/sync.js` ~L62; `js/app.js` route/render paths |
| AI not mapped everywhere | Button hidden in Presentation Mode; allowlist contains 3 nonexistent MSCoE metric IDs; status taxonomy mismatch (`not-started` vs `not-reviewed`); command block can execute multiple times during streaming | `css/styles.css` ~L2917; `js/ask-dr-holtkamp.js` `validateAndMapMetricId()`, `processIncomingText()` |
| Latent wipe risk | `allow read, write: if true` | `firestore.rules` |

**Design principle:** whole-doc last-write-wins + full re-render → **per-item merges + scoped DOM patching that never touches a focused element.**

---

## C. PHASES

### Phase 0 — Backup + instrumentation (no behavior change)
- Write `scripts/backup_firestore.mjs` (Node, uses the same public web config via `firebase` npm pkg or REST): read every doc in `dccs_data`, dump each to `_backup/<docid>.json` with a timestamped folder. Run it; verify each JSON is non-empty and parses. Commit the backup. Do NOT rely on `firebase firestore:export` (needs gcloud billing/IAM).
- Add debug counters gated behind `?debug=1`: count of `App.route()` calls, Firestore writes, `onSnapshot` fires; log a one-line summary every 30s to console. Leave gated (do not remove).
- Record baseline numbers from the two-browser test in work_log.md.
- **Accept:** backup files verified; counters print under `?debug=1`; zero UI change.

### Phase 1 — Scoped re-render + focus guard (kills the "jumpy") — SHIP THIS FIRST
- In `sync.js subscribe()`: remove the `App.route()` call on snapshot change. Instead call `App.applyRemoteChange(docId, newData, changedKeys)`.
- Implement in `app.js`:

```js
applyRemoteChange(docId, data, changedKeys = null) {
  // 1. Always update cache + localStorage mirror.
  // 2. If current view doesn't display this docId's data → return (no DOM work).
  // 3. Coalesce: push to this._pendingPatches, schedule one rAF flush.
  // 4. In flush, for each changed item use EXISTING surgical updaters:
  //    tasks    → refreshTaskCard(taskId) / updateTaskKpiRow(...)
  //    metrics  → refreshMetricDisplay(id) / refreshMetricGroupDisplay(groupId)
  //    dialogue → patch list via renderDialogueEntries(slId)
  //    hedis    → patch the HEDIS rows for that slId only
  // 5. FOCUS GUARD: before replacing any element, if document.activeElement is
  //    inside it (textarea/input/contenteditable), SKIP it; record in
  //    this._stalePatches keyed by element id; apply on that element's blur.
  // 6. Preserve scroll + open <details> + expandedMetricId state across patches
  //    (generalize the scroll-restore helper already in updateTaskKpiRow).
}
```
- `App.route()` remains ONLY for hashchange navigation and mode toggles.
- In `ask-dr-holtkamp.js executeCommands()`: replace trailing `App.route()` with targeted refresh calls per command type.
- **Accept (two-browser test):** B's edit patches only the affected card on A's screen, no page flash; A typing in notes is never interrupted (text+cursor intact); scroll and open sections hold; remote-edit route() count = 0.
- **Rollback:** revert commit; v1 behavior returns.

### Phase 2 — Granular writes (kills clobbering)
- **Tasks** (`dccs_data/tasks`): replace whole-store `.set()` in `saveTaskData` with deep-merge of only the changed task:
```js
await db.collection('dccs_data').doc('tasks').set(
  { [taskId]: { ...changedFieldsOnly, _ts: firebase.firestore.FieldValue.serverTimestamp() } },
  { merge: true }   // deep-merges maps; safe if doc missing (update() is NOT)
);
```
  Note: arrays merge by replacement — acceptable for `customKpis` since edits are per-task.
- **HEDIS** (`dccs_data/hedis`): same pattern, keyed by serviceLineId.
- **Metrics**: move to subcollection `dccs_data/metrics/series/{metricId}`, one doc per metric: `{ entries: [...], _ts }`. A PCSL edit can no longer collide with a Surgery edit. Reads assemble the store shape renderers expect.
- **Dialogue**: move to subcollection `dccs_data/dialogue/entries/{autoId}`: `{ serviceLineId, date, text, _ts }`. Appends via `.add()` (collision-proof). Edits/deletes per-entry doc. Assemble per-SL arrays on read, sorted reverse-chronologically as today.
- **Listeners:** the existing collection listener does NOT see subcollections. Add two listeners: `...doc('metrics').collection('series').onSnapshot(...)` and `...doc('dialogue').collection('entries').onSnapshot(...)`, both feeding `applyRemoteChange`. Keep the original `dccs_data` listener for `tasks`/`hedis`/`er_data`.
- **Conflict rule:** server wins per-item UNLESS that exact item path is in a local `pendingWrites` Set (add on write start, remove on ack/error). Delete the old global `_lastUpdated` ping-pong reconciliation.
- **Migration (one-time, guarded):** on init, read `dccs_data/_meta`; if `migratedV2 !== true` and legacy `metrics`/`dialogue` docs have data while subcollections are empty → copy legacy → subcollections, verify counts match, then set `migratedV2: true`. NEVER delete legacy docs (they are the rollback). If counts mismatch → STOP CONDITION.
- **Accept:** two browsers add dialogue to the same SL within 1s → both persist; A edits PCSL metric while B edits Surgery metric → both stick; legacy docs untouched; refresh shows identical data to pre-migration.
- **Rollback:** revert commit; clients read legacy docs again (still intact).

### Phase 3 — ER pipeline isolation (kills ER flash + write storm)
- `processERData`: compute `er-*` series **in memory only** for rendering. Remove the `saveMetricStore` call from the ER load path entirely. ER series are display-derived data, never user records.
- Viewers never write `er_data` to Firestore on load. If a Firestore copy is wanted later, it's an explicit publish action — out of scope; just remove the automatic write.
- Cache `ER/data.json`: store parsed result + a content hash in localStorage (`dccs-er-data`); on load, reuse cache and refresh in background only if hash differs (fetch, compare, patch). No 104KB parse on every navigation.
- ER charts (`drawEmergencyCharts`, `renderUnitVolumeChart`) redraw ONLY on: first render of the view, and the user's own filter/toggle/slider changes. Never from `applyRemoteChange`. Debounce slider-driven recompute ~150ms.
- Verify `_destroyErChart` runs for every chart id when navigating away (no Chart.js instance leaks).
- **Accept:** both browsers on ED page; A works sliders/ESI toggles while B edits a task elsewhere → A's charts never flash; network tab shows zero Firestore writes from loading the ED page; 2nd ED visit shows no data.json refetch.

### Phase 4 — Persistence + responsiveness (kills raw lag)
- Replace `this.db.enablePersistence()` with `this.db.enablePersistence({ synchronizeTabs: true })` (compat API). This is the multi-tab/multi-window fix; without it the 2nd open tab disables local cache and every read goes to network.
- Keep the existing 600ms notes debounce; apply the same debounce to any other rapid-entry write path found.
- Audit: confirm NO remaining code path serializes an entire store on a single edit (post-Phase-2 this should be true — verify with the `?debug=1` write counter).
- Wrap patch flushes in `requestAnimationFrame`; coalesce multiple snapshot deltas in the same tick into one pass (already specified in Phase 1 — verify).
- **Accept:** 3 tabs open → no `failed-precondition` persistence warning; typing latency imperceptible; debug counters show small per-item writes only.

### Phase 5 — Ask Dr. Holtkamp mapping (ONLY authorized behavior changes)
- **5a Presentation Mode access (Decision D1):** add a small fixed-position floating "Ask Dr. Holtkamp" launcher visible ONLY when `body.presentation-mode-active` (CSS hides the nav there, ~L2917). Clicking it opens the existing panel; ensure the panel + backdrop render above presentation content (z-index). No other visual change. Meeting Mode auto-brief stays untouched.
- **5b Metric ID source of truth (Decision D2):** delete the three phantom IDs (`mscoe-total-trainees`, `mscoe-self-care`, `mscoe-adtmc-medic-care`) from `validateAndMapMetricId()` AND from the `DCCS_CONTEXT_RULES` prompt text. Then make both lists generated at runtime from `FRAMEWORK` (walk `trackedMetrics` + `metricGroups[].series` of every service line) so prompt and validator can never drift from `data.js` again.
- **5c Status taxonomy (Decision D3):** canonical stored values = `not-reviewed | in-progress | complete`. UI "○ Not Started" button keeps its exact label/appearance but writes `not-reviewed`. On read, normalize legacy `not-started` → `not-reviewed`. `statusLabel()` keeps mapping both so nothing visible changes. AI command validator accepts the canonical three (plus maps `not-started` → `not-reviewed` for safety).
- **5d One-shot command execution:** `processIncomingText()` currently parses+executes `[DCCS_COMMAND:...]` on every streamed chunk → duplicate executions (esp. `add_dialogue` duplicates entries). Fix: during streaming, render cleaned text only; execute commands exactly once when the stream completes (in `callWorker` after the read loop, before returning `reply`), guarded by a per-message `commandsExecuted` flag.
- **5e** Re-point the four command actions (`update_metric`, `add_dialogue`, `update_task_status`, `update_task_kpi`) at the Phase-2 granular writers; confirm `add_dialogue` uses the subcollection `.add()`.
- **Accept:** AI launcher reachable in every view + Meeting + Presentation; each command type executes exactly once across all 5 service lines; invalid metric IDs rejected; AI-set vs button-set status indistinguishable.

### Phase 6 — Security prep (CODE ONLY — DO NOT DEPLOY)
- ⚠️ **Agent must not deploy rules or touch the Firebase console.** Deploying `request.auth != null` rules before Anonymous Auth is enabled in the console would break ALL writes on the live site.
- Add to `sync.js init()` a config-flagged auth step (default OFF): if `window.DCCS_AUTH_ENABLED === true`, load `firebase-auth-compat.js` and `await firebase.auth().signInAnonymously()` before subscribing; on failure, log + proceed (graceful).
- Write the hardened rules to a NEW file `firestore.rules.proposed`: `allow read, write: if request.auth != null;` for `dccs_data/{document=**}`. Leave `firestore.rules` untouched.
- Document in work_log.md the manual go-live sequence for Matt: (1) Firebase console → Authentication → enable Anonymous provider; (2) set `DCCS_AUTH_ENABLED = true`; (3) verify sign-in works on the live site; (4) replace rules with proposed + `firebase deploy --only firestore:rules`; (5) one-line rollback = redeploy old rules.
- **Accept:** with flag OFF, site behavior unchanged; with flag ON locally, anonymous sign-in succeeds and app works; live rules untouched.

### Phase 7 — Verification matrix (sign-off, log results in work_log.md)
- Concurrency: 2 browsers, same SL — simultaneous edits to different tasks/metrics/dialogue all persist, nothing reverts, no flash.
- Focus safety: A types notes while B saves → A uninterrupted.
- ER stress: both on ED page, A drives filters while B edits elsewhere → no chart flash; zero Firestore writes from ED page load.
- Multi-tab: 3 tabs, no persistence warning; offline edit → reconnect → clean sync.
- Data integrity: re-run backup script post-change; diff vs Phase 0 backup → no lost entries; legacy docs intact; `_meta.migratedV2 == true`.
- AI: all 4 command types × all 5 service lines + Meeting + Presentation; single execution; valid IDs only.
- Regression: every view, both modes, all charts pixel-equivalent to pre-change screenshots.
- Debug counters: route() ≈ navigation-only; writes are per-item.

---

## D. PRE-MADE DECISIONS (defaults chosen by Matt's standing guidance — implement as written)
- **D1:** YES — floating AI launcher in Presentation Mode (Phase 5a). Revert = delete the button + CSS.
- **D2:** REMOVE the 3 phantom MSCoE metric IDs; generate allowlist + prompt list from `data.js` (no new metrics added — that would change functionality).
- **D3:** Canonical statuses `not-reviewed | in-progress | complete`; legacy `not-started` normalized on read; zero visible change.
- **D4:** Security is code-prep only behind a flag; Matt performs the console step and rules deploy himself (Phase 6 sequence).

## E. DEFINITION OF DONE
All Phase 7 checks pass and are logged; branch `fix/multiuser-perf` contains one commit per phase; `work_log.md` complete; `main` untouched; legacy Firestore docs intact; backups committed. Matt reviews, merges, and (separately) executes the Phase 6 manual security go-live.
