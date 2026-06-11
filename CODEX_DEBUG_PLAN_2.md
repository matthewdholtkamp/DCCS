# DCCS Debug Plan 2 (REVISED) — Restore Live Sync + Presentation Launcher Fix
## Agent Handoff (Antigravity / Codex) — replaces the previous Plan 2 entirely

**Status:** Plan 1 code is merged and live (PR #1 → `main`, busters `?v=20260610-v1`). The jumping/reloading symptom is FIXED. Two live issues remain, both root-caused with hard evidence on 2026-06-10:

### Issue 1 — Badge always "Offline" — AND real-time sync is actually dead (not cosmetic)
**Proven root cause:** the deployed `firestore.rules` matches `/dccs_data/{document}` — a SINGLE path segment. It covers the five top-level docs but NOT the new V2 subcollections (`dccs_data/metrics/series/*`, `dccs_data/dialogue/entries/*`). Firestore rules are not recursive without `{document=**}`.
**Evidence (live):** browser console on the live site: `DCCS Sync V2 Migration failed: FirebaseError: Missing or insufficient permissions` → `init()`'s `.catch` → `disableSync()`. REST probes: read/write to `dccs_data/_writetest` = 200 OK; LIST and WRITE on `dccs_data/dialogue/entries` = 403 PERMISSION_DENIED. Firestore state: `_meta` doc absent, `metrics/series` = 0 docs, `dialogue/entries` = 0 docs, legacy docs intact (15 series / 16 dialogue entries).
**Consequence:** on EVERY load, `runMigrationV2()` throws at its first subcollection `.get()` → `disableSync()` → `subscribe()` never runs → no listeners, no writes. Every user is on localStorage only. **Edits made since the merge exist only in each user's own browser** (see Phase 3.6).

### Issue 2 — Presentation Mode: Ask Dr. Holtkamp launcher covers the Exit button
`.pres-ask-launcher` is `position:fixed; bottom:24px; right:24px` (css/styles.css ~L4447). The presentation footer is a 56px-high bottom bar (`.presentation-footer-controls`, ~L3437) with the `Exit ✕` button at its right end → direct overlap.

### Design flaw exposed (fix alongside): migration failure should never kill sync
Even with correct rules, the pattern "any init/migration error → permanent disableSync, no retry" is fragile on a flaky government network. Harden it.

---

## A. HOW TO WORK
1. `git pull origin main`, then branch: `git checkout -b fix/plan2-sync-restore`. One commit per phase: `Plan2 Phase N: <summary>`. Append to `work_log.md`.
2. **ORDER IS MANDATORY: Phase 1 (code) merges and deploys BEFORE Phase 2 (rules).** If rules are opened first, every currently-open client immediately runs the OLD migration concurrently → the duplicate-dialogue race goes live.
3. Merge to `main` is authorized at Phase 1.7 (it is the fix). Rules deploy is authorized at Phase 2 with the exact content below — nothing else in rules may change.
4. STOP CONDITIONS: any acceptance fails twice → halt + log. `firebase deploy` requires an authenticated CLI; if `firebase login:list` shows no account → STOP at Phase 2 and write the exact command + rules text in work_log for Matt (alternative: paste rules into Firebase console → Firestore → Rules → Publish).
5. Constraints C1 (no data loss) / C2 (no functional or visual change beyond the two authorized fixes) / C3 (AI mapped everywhere) still apply.

---

## B. PHASE 1 — Code hardening (commit + merge + deploy Pages FIRST)

**1.1 Race-safe, idempotent migration** (`js/sync.js runMigrationV2`, ~L342–438)
- Deterministic dialogue doc IDs so a double-run overwrites instead of duplicating: `entryId = `${slId}_${date}_${hash8(text)}`` where `hash8` is a small stable string hash (e.g. FNV-1a hex, inline ~6 lines — `crypto.subtle` is async-fine too). Replace `.doc()` auto-ID with `.doc(entryId)` in BOTH the migration loop AND the normal `add dialogue` write path (so runtime adds stay collision-proof and naturally dedupe identical re-adds).
- Transaction lock on `_meta`: `db.runTransaction`: read `_meta`; abort silently if `migratedV2 === true`; if `migrationLock` exists and is <2 min old, abort silently (another client is migrating); else set `migrationLock: {clientId, ts: serverTimestamp()}`. Only the lock winner migrates; on success set `migratedV2: true` and delete the lock.
- Keep the count-verification throw; it aborts cleanly inside the failure handling below.

**1.2 Migration failure must NOT kill sync** (`js/sync.js init`, ~L108–123)
- Replace `.catch(err => disableSync())` with: log the error, set a `migrationDeferred` flag, and **still call `this.subscribe()`** in LEGACY mode — attach only the original `dccs_data` collection listener and read/write legacy docs exactly as the pre-V2 code did (the legacy reader/writer paths still exist for tasks/hedis; for metrics/dialogue fall back to the legacy whole-doc save with `{merge:true}`). Badge shows `Synced` with a console warn. Retry migration on next load.
- Defense in depth: wrap each subcollection `.get()`/listener attach in its own try/catch → on `permission-denied`, fall back to legacy mode for that store rather than throwing.

**1.3 `disableSync()` hardening** (`js/sync.js` ~L147–168)
- Remove the `App.route()` call (it scroll-jumps the page on any transient error). Badge + cache fallback only.
- Listener error handlers and write `catch` blocks: retry with backoff (1s/5s/15s, max 3) before going offline; a successful retry or the `online` event re-`subscribe()`s.

**1.4 Dedupe safety net**: `scripts/dedupe_dialogue.mjs` — lists exact-duplicate `dialogue/entries` docs (same serviceLineId+date+text), DRY-RUN default, `--apply` to delete extras. (Today's count is 16 entries, 0 dupes — keep it that way.)

**1.5 Verify `firestore.rules.proposed`** uses `match /dccs_data/{document=**}`; if it's single-segment, fix it — otherwise Matt's future auth go-live would re-break subcollections the same way.

**1.6 Presentation launcher reposition** (`css/styles.css` ~L4447): change `.pres-ask-launcher` to `bottom: 80px;` (clears the 56px footer + margin; keep `right: 24px` and all other styling). Verify no overlap with the footer's Exit/nav buttons at 1280px, 1440px, and a narrow ~1024px width, and that the launcher never covers slide content controls. No other visual change.

**1.7 Bump cache-busters** on changed files to `?v=20260610-v2`. Local two-browser regression: load with `?debug=1`, confirm no errors, sync paths attach (will still be permission-blocked for subcollections until Phase 2 — confirm the NEW behavior: badge `Synced`, legacy-mode console warn, page fully usable). Fresh backup: run `scripts/backup_firestore.mjs` → `_backup/<date>-pre-plan2/`. Then merge to `main`, push, wait for Pages build, confirm live `index.html` serves `-v2` busters.

**Accept:** live site (before rules deploy) shows badge `Synced`, no `disableSync`, console warns "migration deferred / legacy mode"; presentation launcher sits clear of Exit; backup committed.

## C. PHASE 2 — Deploy corrected rules (the actual unblock)
Replace `firestore.rules` content with exactly:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /dccs_data/{document=**} {
      allow read, write: if true;
    }
  }
}
```
(Same open posture as today, extended recursively. Auth lockdown remains Matt's separate manual go-live per Plan 1 Phase 6, using the verified `.proposed` file.)
Deploy: `firebase deploy --only firestore:rules` (project `glwch-dccs-2027`). If CLI unauthenticated → STOP CONDITION 4 handoff.
**Verify immediately via REST** (no key changes needed): LIST `dccs_data/dialogue/entries` returns 200 (empty list, not 403).

## D. PHASE 3 — Live verification
1. Hard-refresh live site: console shows migration lock acquired → batch committed → `migratedV2: true` (exactly once across all clients).
2. Firestore state: `_meta.migratedV2 == true`; `metrics/series` = 15 docs; `dialogue/entries` = 16 docs; dedupe dry-run reports 0.
3. Badge `Synced` on load; stays `Synced` through edits.
4. Two-machine test: task edit, dialogue add, metric add each appear on the other machine within ~2s, scoped patch, no scroll/flash, no duplicates on simultaneous dialogue adds.
5. Presentation Mode on both machines: Exit clickable, launcher clickable, AI panel opens above slides; Meeting Mode auto-brief unaffected.
6. **Divergence sweep:** edits made between the merge and this fix lived only in individual browsers and may not have uploaded. Have Matt eyeball recent entries (esp. dialogue/notes from 10 Jun onward) on the live site and re-enter anything missing. Log what was re-entered.
7. AI commands: one of each type → executes once, persists, visible on second machine.

## E. DEFINITION OF DONE
Phases 1–3 green and logged in `work_log.md`; rules deployed and probe-verified; migration completed exactly once with counts 15/16 and zero duplicates; badge `Synced`; launcher clear of Exit; divergence sweep done; rollback notes (revert merge commit + restore prior rules text) recorded.
