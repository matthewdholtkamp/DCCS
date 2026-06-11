# DCCS Debug Plan 4 — Unit Volume Drill-Down, Ask Dr. Holtkamp UX Overhaul, Voice Input, Attribution + Undo
## Agent Handoff (Antigravity / Codex) — root causes verified live on 2026-06-10

**Baseline:** Plans 1–3 deployed on `main` (granular sync, rules fixed, metric persistence + recovery, ER union, AI confirmation cards). This plan: four workstreams, sequenced bug-fix-first.

## A. HOW TO WORK
1. `git pull origin main` → `git checkout -b fix/plan4`. One commit per phase: `Plan4 Phase N: <summary>`. Update `work_log.md`. Merge to `main` authorized after Phase 5 passes. Bump cache-busters to `?v=<date>-v4` on changed files.
2. Backup first (`scripts/backup_firestore.mjs`) and after. Constraints: C1 no data loss; C2 no UI/behavior change beyond what each phase explicitly authorizes; C3 AI mapped everywhere. STOP CONDITIONS: acceptance fails twice → halt + log; anything touching the write path must keep Plan 3's explicit-changed-IDs pattern.
3. Two-browser harness: `cd ~/Desktop/"Research AI" && python3 -m http.server 8000` → `/DCCS/`.

## PHASE 0 — Nightly backup automation (tiny, protects the PoC month)
Add `.github/workflows/nightly-backup.yml`: cron `0 8 * * *` (≈0200 Central), runs `node scripts/backup_firestore.mjs` (uses the public REST read; no secrets needed while rules are open — when Matt later locks rules, the workflow will need a service-account secret: leave a TODO comment), commits `_backup/nightly/<date>/*.json` to `main` (skip-ci tag). Prune to last 30 days. **Accept:** manually trigger via `workflow_dispatch`, verify backup files appear with correct counts.

## PHASE 1 — Unit Volume Over Time: restore drill-down + fix date range (verified causes)
**Cause 1 — Drill Level control empty:** the markup exists (`#uvBreadcrumb`, js/app.js ~L4413) and the handlers exist (`uvGoBde/uvGoBn/uvGoCo`, `uvRenderBreadcrumb` ~L4248) — but **`uvRenderBreadcrumb()` is never called anywhere** (only `uvBuildDateSlider()` is, ~L4770). The Drill Level block at top-left renders blank.
**Cause 2 — date off-by-one:** `this.allPatients = (store['er-patients']||[]).map(p => ({...p, date: new Date(p.date)}))` (~L3591 and the MSCoE path) — `new Date('YYYY-MM-DD')` parses as UTC midnight, which is the PREVIOUS day in Central time; every bucket, label, and slider date shifts one day back.
**Cause 3 — range span:** the chart reads `store['er-patients']`; Firestore history holds ~1,722 check-ins while `ER/data.json` ships only the latest ~325 (May). Verify Plan 3's union covered `er-patients`; if it replaces wholesale, the slider can only span 25 days.

**Fix:**
1. Call `uvRenderBreadcrumb()` at the top of `renderUnitVolumeChart()` (both normal and `pres-` prefix paths), exactly as the ER original does. Verify clicking a BDE series/legend drills to BN and BN→CO (the ER original wires drill via legend `onClick` → `uvGoBn`/`uvGoCo`; port that wiring if absent in DCCS).
2. Diff the `uv-*` CSS: DCCS has 27 `uv-` rules vs the ER original's 75 (`../ER/index.html` inline styles). Port every missing `uv-*` rule (incl. `uv-stats-row` if its markup exists) so the toolbar matches the ER layout — Drill Level block top-left, then Granularity, Acuity, Date Range.
3. Add `parseLocalDate(s)`: for `YYYY-MM-DD` strings split → `new Date(y, m-1, d)` (local); for ISO timestamps, derive the local calendar day consistently with Plan 3's `normalizeDateKey`. Use it everywhere `er-patients` dates are parsed (~L3591, ~L4301 area, table render). Spot-check: a check-in dated `2026-05-01` must bucket/label as May 1, not Apr 30.
4. Ensure `processERData` unions `er-patients` by composite key `date+timeStr+company+battalion+acuity(+count)` — data.json wins for overlapping keys, Firestore history retained, new rows persisted via `saveMetricSeries(['er-patients'],...)` only when new keys exist (idempotent).
5. Slider: bounds = full unioned span (default handles = full span); labels use `parseLocalDate`; verify the existing DST-boundary fix still holds across the longer range; handles must clamp (lo ≤ hi).

**Accept:** Drill Level breadcrumb visible top-left ("All Brigades"); clicking a brigade line/legend drills to its BNs, then COs, breadcrumb navigates back; granularity buttons still work; date labels match the underlying dates exactly (no off-by-one); slider spans the full history and narrowing it filters chart + check-in table; presentation-mode copy of the chart matches; two-browser: no regressions to other MSCoE/ED content.

## PHASE 2 — Ask Dr. Holtkamp: persistent, non-modal, conversation kept (authorized behavior changes)
Verified current behavior: `open()` resets `this.history = []` (js/ask-dr-holtkamp.js ~L130) — every reopen wipes the conversation; a document-level click handler closes the panel on any outside click (~L109); `.ask-backdrop` dims the page (`rgba(8,9,7,0.4)`, css ~L235) and blocks interaction.
1. **Keep the conversation:** remove the reset in `open()`. Persist `history` to `sessionStorage` (`dccs-ask-history`, cap last 40 messages) on every change; restore on init. Add a small "New chat" button in the panel header (next to ✕) that clears history + storage deliberately. (sessionStorage = per-tab/per-session; survives reopens and reloads in the same tab, resets when the tab closes — matches "until I close it".)
2. **Stay open until explicitly closed:** remove the outside-click close handler and the Escape-close. The panel closes ONLY via its ✕ or the nav "Ask Dr. Holtkamp" toggle.
3. **No blur/dim — page stays visible and interactive:** stop adding the backdrop (`open()`/`close()` no longer touch it; leave the element dormant for presentation-mode z-index handling if needed, else remove). The panel becomes a docked, non-modal side panel; the user can click metrics, scroll, and watch AI-confirmed changes patch the page live while chatting. Verify the Plan 3 confirmation cards still work, scoped patches render behind the open panel, and Meeting-mode auto-brief + presentation launcher are unaffected.

**Accept:** open panel → ask something → click around the page (panel stays, no dim) → close via ✕ → reopen: conversation intact; "New chat" clears it; AI add-metric flow: confirm card → value appears on the page beside the open panel in real time; reload tab → conversation still present; close tab → fresh next session.

## PHASE 3 — Voice-to-text for Ask Dr. Holtkamp (authorized addition)
Web Speech API (`window.SpeechRecognition || window.webkitSpeechRecognition`), `lang='en-US'`, `interimResults=true`.
1. Mic button inside `.ask-input-wrapper` (left of send). Toggle: press → listening (pulsing red state, `aria-pressed`), press again or silence-end → stop. Final + interim transcripts append into the textarea at the cursor; user reviews and presses Send themselves — **never auto-send**.
2. Graceful degradation: feature-detect — if unsupported, don't render the button. On `not-allowed`/`service-not-allowed` (mic blocked by gov policy), show a one-line status note ("Microphone unavailable on this device") and hide the button for the session. HTTPS is required and satisfied (GitHub Pages / localhost).
3. Style to match existing panel buttons; no other layout change.

**Accept:** in Chrome/Edge with mic allowed: speak → words appear in the input, editable, sent only on Send; deny mic permission → button hides gracefully, no console spam; Safari/unsupported → no button, no errors.

## PHASE 4 — Attribution + Undo (recommendation #3, scoped)
1. **Identity-lite (no passwords):** first visit, a small inline prompt in the nav ("Who's using this device?") with a dropdown built from `FRAMEWORK` leaders (LTC Holtkamp, SSG Holloway, MAJ Tobin, LTC Weir, Dr. Fellwock, MAJ Henderson) + "Other…" free text. Store in `localStorage('dccs-user')`; show as a small nav chip; click chip to change. Until chosen, writes record `by:"Unknown"` — never block saving.
2. **Stamp writes:** extend the granular writers: task field saves add `_by`; dialogue entry docs add `by`; metric entries become `{date, value, by}` (older entries without `by` remain valid — renderers must tolerate absence). AI-executed commands stamp `by: '<user> (via Dr. Holtkamp)'`.
3. **Audit log:** append-only `dccs_data/audit/events/{autoId}`: `{at: serverTimestamp, by, action, target, summaryBefore, summaryAfter}` (summaries truncated ≤300 chars). Written in the same batch as each save/delete. Read-only; no UI dependency on it for core flows.
4. **Undo toast:** after any delete or metric/dialogue/status change, a bottom toast "✓ Saved — Undo" (8 s). Undo restores the captured before-state through the same writers (and logs its own audit event). No undo for KPI checkbox toggles (one click re-toggles).
5. **Recent Activity (stretch, only if Phases 0–4 green):** collapsible "Recent Changes" details section at the bottom of the Framework Overview page listing the last 15 audit events ("10 Jun 14:32 — MAJ Tobin updated PCSL Acute: 26 → 22").

**Accept:** name chosen once per device; a metric add from browser A shows `by` in the audit doc; undo restores a deleted dialogue entry and a changed metric value exactly; unknown-user writes still succeed; no visible change for users beyond the chip, toast, and (if built) the collapsed activity section; all Plan 1–3 behaviors regress-tested.

## PHASE 5 — Verification (log in work_log.md)
1. Phase 1 matrix on the MSCoE tab + presentation copy, two browsers.
2. Phase 2/3 matrix incl. confirmation-card interplay and mic-denied path.
3. Phase 4 matrix incl. undo round-trips and audit doc inspection via REST.
4. Regression: metric persistence (Plan 3 P1), dialogue saves, ER charts full-vs-30, no full-page re-renders, Meeting + Presentation modes, badge stays Synced.
5. Run backup post-change; diff shows only intended additions.

## DEFINITION OF DONE
Drill-down (BDE→BN→CO) visible and working with correct dates and full-history range; Dr. Holtkamp panel stays open, keeps the conversation, never blurs the page, and takes dictation; every write is attributed with an audit trail and one-click undo; nightly backups running; merged to main with v4 busters.
