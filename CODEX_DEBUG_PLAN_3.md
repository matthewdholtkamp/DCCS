# DCCS Debug Plan 3 — Metric Persistence (P1), ER Chart History, AI Read/Add/Delete with Confirmation
## Agent Handoff (Antigravity / Codex) — all root causes verified live on 2026-06-10

**State:** Plans 1–2 deployed and working: scoped re-render, granular writes, rules fixed, migration complete (`_meta.migratedV2=true`), dialogue subcollection healthy (16 entries). Three new workstreams, in Matt's priority order.

## A. HOW TO WORK
1. `git pull origin main` → `git checkout -b fix/plan3`. One commit per phase: `Plan3 Phase N: <summary>`. Update `work_log.md`. Merge to `main` authorized after Phase 4 acceptance passes (Pages auto-deploys).
2. Bump cache-busters to `?v=<date>-v3` on changed files.
3. Constraints: C1 no data loss (backup first: run `scripts/backup_firestore.mjs`); C2 no UI/behavior change beyond what each phase explicitly authorizes; C3 AI stays mapped everywhere.
4. STOP CONDITIONS: acceptance fails twice → halt + log; any step risking existing Firestore entries → halt.
5. Two-browser harness: `cd ~/Desktop/"Research AI" && python3 -m http.server 8000` → `/DCCS/` in two browsers.

---

## PHASE 1 — METRIC DATA POINTS DON'T PERSIST (TOP PRIORITY — verified root cause)
**Bug (exact):** `App.addMetricEntry` (js/app.js ~L943) does `const all = this.getMetricStore()` — but `Sync.getMetricStore()` returns `this.cache.metrics` **by reference**. The new entry is pushed into the cached array in place, then the SAME object is passed to `Sync.saveMetricStore(allMetrics)` (js/sync.js ~L582), whose change detector compares `allMetrics[key]` vs `this.cache.metrics[key]` — **an object against itself** → `changedMetricId` stays null → the Firestore write block never executes. localStorage updates (looks saved), then the metrics `series` listener delivers the server's empty array → server-wins → the point vanishes on reload. Firestore confirms: all user-entered series (`pcsl-acute`, `pcsl-followup`, `pcsl-medic`, `pcsl-virtual`, `surgery-*`) = **0 entries** while ER-migrated series have data.
**Bug 2 (stacked):** the detector `break`s after the FIRST changed key — `addMetricGroupEntry` (~L1010) writes several series per save (surgery group), so even with a diff fix, all but one series would be dropped.

**Fix — make the changed set explicit; stop inferring by diff:**
1. New writer in `js/sync.js`: `async saveMetricSeries(changedIds, allMetrics)` — updates cache + localStorage, then for EACH id in `changedIds`: add `metrics/<id>` to `pendingWrites`, `set` doc `dccs_data/metrics/series/<id>` with `{entries: allMetrics[id], _ts: serverTimestamp()}` (use a `db.batch()` when >1), clear pendingWrites on ack. Legacy-mode fallback (`migrationDeferred`) keeps the whole-doc merge path.
2. Callers pass what they changed: `addMetricEntry` → `saveMetricSeries([metricId], all)`; `addMetricGroupEntry` → collect every series id it touched → `saveMetricSeries(ids, all)`; AI `updateMetricLocal` → `saveMetricSeries([metricId], store)`; any delete path likewise. Also stop mutating the cache in place: build the new entries array as a copy (`[...existing, newEntry].sort(...)`) before handing to the writer.
3. Keep `saveMetricStore` as a thin deprecated wrapper that derives changedIds from an explicit param or throws in `?debug=1` — grep ALL call sites and migrate them: js/app.js (`addMetricEntry`, `addMetricGroupEntry`, metric delete/edit rows if present) and js/ask-dr-holtkamp.js (`updateMetricLocal`).

**Phase 1R — Recover stranded data points:** every point entered since Plan 1 deployed lives ONLY in browser localStorage (`dccs-metric-entries`) on the machine where it was typed. Add a one-time, guarded recovery in `Sync` post-first-snapshot: for each NON-`er-` series where server entries are empty/missing and localStorage has entries → upload the union (dedupe by exact date; prefer local where server empty). Log a console line per recovered series (`DCCS Recovery: pcsl-acute restored N entries`). Idempotent (re-runs find nothing to do). Matt should open the site once on EACH machine he used for data entry (gov laptop especially) so each browser's stranded points upload.

**Accept:** add a point to PCSL Acute → hard reload → point still there; Firestore REST shows it in `dccs_data/metrics/series/pcsl-acute`; appears on second browser ≤2s; surgery group save persists ALL filled series; AI-added metric persists; recovery log confirms restored series on a machine holding stranded localStorage data.

---

## PHASE 2 — ER CHARTS: FULL HISTORY vs LAST 30 (currently both show the same 25 days)
**Verified cause:** the chart code is already correct (`full = allData`, `second = allData.slice(-30)`, js/app.js ~L4037/4085). The data is wrong: `ER/data.json` contains only 25 rows (2026-05-01→05-25), and `processERData` REPLACES the in-memory er-* series with those 25 days — clobbering (in memory) the **160 entries spanning 2025-01-18 → 2026-06-09** that Firestore holds in `metrics/series/er-*`. Both charts therefore render the same 25-day set.
**Date-format landmine:** Firestore's historical er entries use ISO timestamps (`2025-01-18T06:00:00.000Z`); data.json uses `YYYY-MM-DD`. Keying by raw string would duplicate days and wreck sort order.

**Fix:**
1. Add `normalizeDateKey(d)` → always `YYYY-MM-DD` (take first 10 chars of ISO strings after validating; convert timestamp dates using LOCAL date to match how they were entered — verify a few samples render on the correct calendar day; document the choice).
2. `processERData` becomes a **union-merge**: start from the store's existing er-* series (Firestore history), overlay data.json-derived values by normalized date (data.json wins for overlapping dates — it is the recent source of truth), output sorted ascending. Never replace wholesale.
3. **Persist genuinely NEW dates** so history keeps accumulating even though the ER repo truncates data.json: if the merge produced dates absent from the server copy, write the merged series via Phase 1's `saveMetricSeries` — gated so it only fires when new dates exist (idempotent by date; at most one write per new day by the first viewer; no write storm — Plan 1 Phase 3's concern stays satisfied).
4. One-time cleanup inside the same merge: normalize the 160 legacy ISO-timestamp dates to `YYYY-MM-DD` (persisted with the first new-date write).
5. Badges: full chart badge shows true total day count; last-30 badge shows `min(30, total)`.
6. Note for the ER repo (separate codebase, do NOT modify here): its generator currently emits only the latest ~25-day batch; long term it should append. DCCS-side union makes this moot for display.

**Accept:** full-history chart spans Jan 2025 → present (~160+ pts, badge matches); last-30 chart shows exactly the most recent 30 dated days and differs from the full chart; no duplicated dates; Unit Volume/MSCoE views unaffected; reload stable; second browser shows same ranges.

---

## PHASE 3 — ASK DR. HOLTKAMP: READ EVERYTHING, ADD/DELETE WITH MANDATORY CONFIRMATION
Authorized behavior changes (Matt's spec): AI can answer from all stored data; can add data mapped to the right place; can DELETE data; must CONFIRM with the user before ANY add/delete; must ask a clarifying question when the request is ambiguous. Reads stay immediate (no confirmation for questions).

1. **Confirmation gate (client-enforced, not prompt-trusted):** repurpose the executor so ANY parsed command block — old `[DCCS_COMMAND:...]` included — is NEVER auto-executed. Instead render a confirmation card inside the assistant message: human-readable summary per command (e.g. "Add **22 hours** to **PCSL — Acute Appointments** on **2026-06-10**" / "Delete entry **2026-06-03** from **Surgery — Total Surgeries**"), with **Confirm** and **Cancel** buttons. Confirm → run the existing executor (now wired to Phase-1 writers) → append the ✓ system log; Cancel → append "Cancelled — nothing changed." Multi-command blocks list each item with one Confirm-all + Cancel. The card is plain DOM inside `.ask-message-body` (match existing panel styling); disable its buttons after use.
2. **Prompt update (`DCCS_CONTEXT_RULES`):** replace the "confidently tell the user it has been recorded" instruction with: propose the change, state exactly where it will go (service line, metric name, date, value), tell the user to press Confirm; after the portal confirms execution it may state it is saved. If the target is ambiguous (no/unknown metric, multiple plausible matches, missing date or value), ASK a clarifying question and emit NO command block. Never emit a delete affecting more than one entry without listing each.
3. **Delete commands (new executor actions + prompt docs):**
   - `{action:"delete_metric_entry", metricId, date}` → remove the entry with that normalized date from the series; error if absent.
   - `{action:"delete_dialogue_entry", serviceLineId, date, textMatch}` → delete the subcollection doc whose date matches and whose text contains `textMatch`; if 0 or >1 match, do not delete — return the candidates so the AI can ask which one.
   Both route through the confirmation card and the granular writers (metric delete → `saveMetricSeries`; dialogue delete → subcollection doc delete with scoped patch).
4. **Context hygiene (serves "examine all the data and answer appropriately"):** `buildDccsContext` currently embeds EVERY entry of EVERY series — including `er-patients` (1,722 row objects) — bloating each AI call, slowing replies, and risking truncation that makes answers WORSE. Change `summarizeMetric` to include: entryCount, first/last date, latest+previous, goal status, and `recentEntries` capped at the last 90; exclude `er-patients` raw rows entirely (provide count + date range only). Dialogue/HEDIS/task summaries unchanged.
5. Regenerate nothing by hand: metric ID lists are already runtime-generated from `FRAMEWORK` (Plan 1 Phase 5b) — confirm deletes use the same source.

**Accept:** ask to add a metric value → AI proposes with exact target → nothing persists until Confirm → persists + visible on second browser; Cancel leaves data untouched; ask to delete a specific point → same flow; ambiguous ask ("add 12 to surgery" with 4 surgery series) → AI asks which series, no command emitted; vague delete matching 2 dialogue entries → AI lists both and asks; questions about trends answer from full stored history (spot-check vs Firestore values); AI response latency noticeably improved vs pre-change (context size down).

---

## PHASE 4 — VERIFICATION (log all in work_log.md)
1. Phase 1 acceptance end-to-end on two machines, including recovery on a machine with stranded localStorage.
2. Phase 2 acceptance; confirm zero ER-page write storms (`?debug=1` write counter flat while two viewers idle on ED page).
3. Phase 3 acceptance: all four legacy actions + two delete actions, each through the confirmation card, each exactly once.
4. Regression: dialogues still save; tasks/KPIs/HEDIS unaffected; Meeting + Presentation modes (incl. auto-brief and launcher position) unchanged; no full-page re-renders on remote edits.
5. Post-change backup run; diff vs pre-change backup shows only additions/intended deletions.

## DEFINITION OF DONE
Metric points persist forever across machines and the stranded points are recovered (P1); ER full-history chart shows Jan-2025→present while the second chart shows a true last-30 (P2); Ask Dr. Holtkamp reads everything, adds and deletes only after explicit user confirmation, and asks clarifying questions when unsure (P3); Phase 4 matrix green; merged to main with v3 busters.
