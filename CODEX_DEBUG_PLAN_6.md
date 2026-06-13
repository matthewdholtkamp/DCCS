# CODEX_DEBUG_PLAN_6 — Cinematic Scroll Landing Page (Operational Framework Front Door)

**Repo:** `DCCS` (vanilla-JS hash-router SPA, Firebase compat via CDN, single `css/styles.css`, no build step)
**Target route:** `#/` → `App.renderLanding(el)` (currently `js/app.js:564`)
**Status of related systems:** render path already hardened (rAF-batched surgical patches in `applyRemoteChange`); landing view consumes only static `FRAMEWORK` data. Do not regress these.

---

## 0. Agent Quickstart

**Goal:** rebuild the `#/` home view as a self-contained, dark cinematic scroll page. Leave the static top nav (`.nav`) and left sidebar (`#sidebar`) untouched.

**Touch exactly these 5 files, in this order:**
1. `assets/` — ✅ **ALREADY STAGED by the planner. Do not source, download, or rename anything here.** All five backgrounds exist: `Old_Hospital.jpg`, `New_Hospital.webp`, `change_of_command.webp`, `field_medicine.webp`, `soldier_award.webp`. Use as-is (see §8).
2. `js/landing-scroll.js` — **NEW** standalone controller `window.LandingScroll` (full code in §6).
3. `js/app.js` — rewrite `renderLanding` body (DOM §4 + copy §3) and call `LandingScroll.init` on rAF at the end; add `LandingScroll.destroy()` to the `route()` teardown block (~L458–462, beside the `_erCharts` teardown); retire `renderLandingPhaseStrip` (§7).
4. `css/styles.css` — append one block, every selector scoped under `.landing-stage` (§9).
5. `index.html` — add the `landing-scroll.js` script **before** `app.js`; bump all `?v=` tokens → `20260613-v9`; optional hero `preload` (§7).

**Never touch:** `sync.js`, `firestore.rules(.proposed)`, the `data.js` schema (read `FRAMEWORK` only), the surgical patch/refresh system (`applyRemoteChange` / `refresh*`), `.nav` markup, `renderSidebar`. No Firestore reads/writes and no `route()` calls from the landing layer.

**Done when:** all §13 acceptance criteria pass.

---
## 1. Objective

Replace the current static landing (`renderLanding`) with a **vectr-style cinematic scroll experience** that walks the viewer through the DCCS/MSCoE Operational Framework: Current State → the three Lines of Effort → Phase 1 (Build) → Decisive Point (hospital move) → Phase 2 (Improve) → Phase 3 (Refine) → Desired State. As the user scrolls, the full-bleed background photograph crossfades and a sticky phase-progress rail tracks position.

**Hard constraints (do not violate):**
- The static **top nav** (`.nav` in `index.html`) and the **left sidebar** (`#sidebar`, built by `App.renderSidebar`) are NOT modified and remain fully functional.
- The scroll experience is a **self-contained dark "stage"** rendered inside the main pane (`#app`). It must read as a visually distinct, inset panel — clearly separate from the light/static chrome around it. The dark stage is the home page's front door; inner pages stay on the existing light theme.
- **No Firestore reads/writes** and **no calls to `route()`** from the landing layer.
- All new CSS is scoped under `.landing-stage` so nothing leaks into the white app or inner pages.

---

## 2. Architecture decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Animation engine | **IntersectionObserver + CSS transitions** (no GSAP) | Zero dependency; cannot trigger render storms (only toggles classes / swaps active bg); robust on gov browsers; trivial reduced-motion handling. GSAP is an optional future upgrade if scroll-scrubbed motion is ever wanted. |
| Scroll container | The `.landing-stage` element itself scrolls internally | Keeps the cinematic surface bounded and separate from chrome; IO `root` = the stage element. |
| Phase rail | CSS `position: sticky; top:0` inside the stage | No JS pin math; robust. |
| Background crossfade | Stacked absolute `.landing-bg` layers; active one gets `.active` (opacity 1) on scene enter; CSS transitions the fade | Simple, smooth, GPU-friendly (opacity only). |
| Scene reveal | IO adds `.in-view`; CSS fades/translates content in | Progressive enhancement — content is visible by default if JS/IO unavailable. |
| Lifecycle | `LandingScroll.init(stageEl)` at end of `renderLanding`; `LandingScroll.destroy()` in `route()` teardown (mirror the existing `_erCharts` teardown) | Clean setup/teardown across route changes; no orphan observers. |

---

## 3. Scroll storyboard (exact on-screen content)

Seven scenes. Each `<section class="landing-scene">` carries `data-bg` (which background to show) and, where relevant, `data-phase` / `data-loe` (for rail sync + accent color). All copy below is final/approved unless marked ALT.

**LOE reference (from `data.js`):**
- LOE 1 — **Medically Ready Force** — accent gold `#FFB81C` — "Deliver reliable, high-quality healthcare that exceeds DHA standards for access and performance."
- LOE 2 — **Ready Medical Force** — accent army-green `#46523f` — "Develop and empower a professional, technologically proficient, and resilient medical team capable of executing the mission with initiative."
- LOE 3 — **MSCoE Integration** — accent steel `#1c4f78` (data.js lists `#cccccc`; use the darker steel token for contrast on the dark stage) — "Synchronize medical functions to support the MSCoE training mission by ensuring trainees receive the right care, right place, right time."

### Scene 1 — CURRENT STATE  · `data-bg="current"` (Old hospital)
- Kicker: `CURRENT STATE`
- H1: **"We began as a reactive system."**  _(ALT: "A reactive system, strained at every seam.")_
- Sub: "Underperforming on DHA scorecards — critical staffing shortages, unsustainable primary care access, an overloaded ER, and gaps in unit-level accountability straining the MSCoE partnership and the training mission."
- Scroll cue: "Scroll to follow the framework ↓"

### Scene 2 — THREE LINES OF EFFORT · `data-bg="current"` (Old hospital, dimmed further)
- Kicker: `OPERATIONAL DESIGN`
- H2: **"Three lines of effort."**
- Lead (use `FRAMEWORK.mission`): "Continuously synchronize medical efforts across the GLWCH and MSCoE footprint to deliver the right care, at the right place, at the right time…"
- Three LOE cards (name + one-line description + accent color as listed in the LOE reference above).
- Footnote: "Each phase elevates one line of effort as its main effort."

### Scene 3 — PHASE 1 · BUILD · `data-bg="phase1"` (Old hospital) · `data-phase="1"` `data-loe="3"`
- Kicker: `PHASE 1 · BUILD · 1 AUG 2025 – 1 MAR 2026 · COMPLETE`
- Main effort tag: **Main Effort — MSCoE Integration (LOE 3)** (steel accent)
- Intent: "Synchronize medical functions to support the MSCoE training mission by ensuring trainees receive the right care, right place, right time."
- Goals:
  1. Implement Trainee Care Model — TOMS / CTMC / ER establishment
  2. MSCoE Surgeon oversight — synchronize across BDEs
  3. Executive Medicine — key-leader care; protect clinic access (SRP walk-ins, shaving/body-fat group encounters)
  4. Establish MSCoE Surgeon as a true division-level staff function
- Deep-link: subtle "Open in framework →" → `location.hash = '#/framework'`

### Scene 4 — DECISIVE POINT · `data-bg="transition"` (crossfade Old → **New** hospital)
- Kicker: `DECISIVE POINT`
- H2: **"Hospital Move"** · 7 Apr 2026
- Line: "The transition to the new facility — the pivot from building to improving."
- This scene is the visual hinge: entering it sets the active background to the **new hospital**, so the old→new crossfade reads as the phase transition.

### Scene 5 — PHASE 2 · IMPROVE · `data-bg="phase2"` (Army change of command) · `data-phase="2"` `data-loe="1"`
- Kicker: `PHASE 2 · IMPROVE · 1 MAR – 10 AUG 2026 · ★ CURRENT` (this is `FRAMEWORK.currentPhase === 2`)
- Main effort tag: **Main Effort — Medically Ready Force (LOE 1)** (gold accent)
- Intent: "Deliver reliable, high-quality healthcare that exceeds DHA standards for access and performance."
- Goals:
  1. PCSL DHA care model — access to care / HEDIS plans developed and implemented
  2. ER & Surgery throughput in the new facility — ER Fast Track (medic-led); surgery efficiency metrics developed and implemented
  3. Behavioral Health — improve BH targeted care model and tracking
- Deep-link: "Open in framework →" → `#/framework`

### Scene 6 — PHASE 3 · REFINE · `data-bg="phase3"` (Field training medicine — blurred-fill, §9) · `data-phase="3"` `data-loe="2"`
- Kicker: `PHASE 3 · REFINE · 10 AUG 2026 – JUL 2027 · UPCOMING`
- Main effort tag: **Main Effort — Ready Medical Force (LOE 2)** (army-green accent)
- Intent: "Develop and empower a professional, technologically proficient, and resilient medical team capable of executing the mission with initiative."
- Goals:
  1. Deliberate professional development — deliberate counseling at all levels
  2. Prioritize military skills & education — schools and local training/education plans
  3. Execute a deliberate leadership-transition plan
- Deep-link: "Open in framework →" → `#/framework`

### Scene 7 — DESIRED STATE · `data-bg="desired"` (Bronze Star — centered medal on dark, §9)
- Kicker: `DESIRED STATE`
- H1: **"Right care. Right place. Right time."**  _(ALT: "A High Reliability Organization.")_
- Sub: "Consistently meeting DHA standards, with an integrated trainee care model and technologically empowered, accountable staff who protect the ER, drive efficiency, and forge a fully integrated MSCoE partnership that enables the training mission."
- Motto stamp: **Work Smart, Move Fast, Be Nice.**
- CTA: "Enter the framework →" → `#/framework`

**Background → scene map** (5 distinct images; old hospital reused for 3 scenes):
`current, loes, phase1` → Old hospital · `transition` → New hospital · `phase2` → Change of command · `phase3` → Field training medicine · `desired` → Soldier award.

---

## 4. DOM structure (output of the rewritten `renderLanding`)

```html
<div class="page landing-v2">
  <div class="landing-stage" id="landing-stage">           <!-- dark, inset, self-contained scroller -->
    <div class="landing-bg-layer" aria-hidden="true">      <!-- absolute, behind content -->
      <div class="landing-bg" data-bg="current"  style="background-image:url('assets/Old_Hospital.jpg')"></div>
      <div class="landing-bg" data-bg="transition" style="background-image:url('assets/New_Hospital.webp')"></div>
      <div class="landing-bg" data-bg="phase2"    style="background-image:url('assets/change_of_command.webp')"></div>
      <div class="landing-bg landing-bg--fill" data-bg="phase3"    style="background-image:url('assets/field_medicine.webp')"></div>
      <div class="landing-bg landing-bg--object" data-bg="desired"   style="background-image:url('assets/soldier_award.webp')"></div>
      <div class="landing-scrim"></div>                    <!-- dark gradient for legibility -->
    </div>

    <nav class="landing-rail" aria-label="Operational phase progress">  <!-- sticky top:0 inside stage -->
      <button class="rail-seg" data-target="scene-current"  >Current State</button>
      <button class="rail-seg" data-target="scene-phase1" data-loe="3">Build</button>
      <button class="rail-seg" data-target="scene-phase2" data-loe="1">Improve</button>
      <button class="rail-seg" data-target="scene-phase3" data-loe="2">Refine</button>
      <button class="rail-seg" data-target="scene-desired"  >Desired State</button>
    </nav>

    <div class="landing-scenes">
      <section class="landing-scene" id="scene-current"   data-bg="current"></section>
      <section class="landing-scene" id="scene-loes"      data-bg="current"></section>
      <section class="landing-scene" id="scene-phase1"    data-bg="phase1" data-phase="1" data-loe="3"></section>
      <section class="landing-scene" id="scene-transition" data-bg="transition"></section>
      <section class="landing-scene" id="scene-phase2"    data-bg="phase2" data-phase="2" data-loe="1"></section>
      <section class="landing-scene" id="scene-phase3"    data-bg="phase3" data-phase="3" data-loe="2"></section>
      <section class="landing-scene" id="scene-desired"   data-bg="desired"></section>
    </div>
  </div>
</div>
```

- Build scene innerHTML from `FRAMEWORK` (phases, loes, mission, currentState, desiredState, motto). Use the approved copy in §3 verbatim for kickers/headlines/intents/goals; pull intents and LOE descriptions from `FRAMEWORK.loes` / `FRAMEWORK.phases` so they stay in sync.
- Escape any dynamic strings with the existing `this.escapeHtml(...)`.
- Default CSS state: scenes and content **visible** (`opacity:1`). `.in-view` only *enhances* (so no-JS / IO-unsupported still shows everything stacked over the first background). This is the progressive-enhancement guarantee.
- The first `.landing-bg` (`data-bg="current"`) starts with class `active`.

---

## 5. Phase-progress rail

- Five segments: Current State · Build · Improve · Refine · Desired State.
- Sticky at the top of the stage; visually part of the dark cinematic surface (NOT injected into the static top nav — keeps the scroll area separate per requirement).
- Active segment: IO reports the scene currently in view → add `.active` to the matching `rail-seg`, set `aria-current="true"`; fill a progress underline up to that segment using its LOE accent color (`data-loe`).
- Mark the **current operational phase** (`FRAMEWORK.currentPhase === 2` → "Improve") with a persistent `★`/dot indicator regardless of scroll.
- Click a segment → `document.getElementById(target).scrollIntoView({ behavior: 'smooth', block: 'start' })` within the stage. Keyboard-focusable buttons.

---

## 6. New module: `js/landing-scroll.js`

Create a small standalone controller exposed as `window.LandingScroll`. It owns ALL landing scroll behavior and holds no Firestore/app state.

```js
window.LandingScroll = (function () {
  let io = null, railIO = null, stage = null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setActiveBg(name) {
    if (!stage) return;
    stage.querySelectorAll('.landing-bg').forEach(el =>
      el.classList.toggle('active', el.dataset.bg === name));
  }
  function setActiveRail(sceneId) {
    if (!stage) return;
    stage.querySelectorAll('.rail-seg').forEach(seg => {
      const on = seg.dataset.target === sceneId;
      seg.classList.toggle('active', on);
      if (on) seg.setAttribute('aria-current', 'true'); else seg.removeAttribute('aria-current');
    });
  }

  function init(stageEl) {
    destroy();                       // idempotent
    stage = stageEl;
    if (!stage) return;

    // rail click -> smooth scroll within the stage
    stage.querySelectorAll('.rail-seg').forEach(seg => {
      seg.addEventListener('click', () => {
        const t = document.getElementById(seg.dataset.target);
        if (t) t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      });
    });

    if (reduceMotion) {            // show everything, no animation, static first bg
      stage.querySelectorAll('.landing-scene').forEach(s => s.classList.add('in-view'));
      setActiveBg('current');
      return;
    }

    io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const s = e.target;
        s.classList.add('in-view');                 // reveal (one-way)
        if (e.intersectionRatio >= 0.55) {          // dominant scene drives bg + rail
          if (s.dataset.bg) setActiveBg(s.dataset.bg);
          // rail follows nearest labeled scene
          const map = { 'scene-loes':'scene-current', 'scene-transition':'scene-phase1' };
          setActiveRail(map[s.id] || s.id);
        }
      });
    }, { root: stage, threshold: [0.2, 0.55, 0.8] });

    stage.querySelectorAll('.landing-scene').forEach(s => io.observe(s));
  }

  function destroy() {
    if (io) { io.disconnect(); io = null; }
    if (railIO) { railIO.disconnect(); railIO = null; }
    stage = null;
  }

  return { init, destroy };
})();
```

Notes for the agent:
- `root: stage` is essential — the stage is the scroll container, not the window.
- `setActiveBg` toggles `.active`; the CSS transition does the crossfade (opacity only).
- Keep this module free of any `App`, `Sync`, `FRAMEWORK` writes. Read-only DOM.

---

## 7. Wiring edits in existing files

### `js/app.js`
1. **`renderLanding(el)` (≈ line 564):** replace the body so it outputs the §4 DOM (built from `FRAMEWORK`). At the very end, after `el.innerHTML = ...`, kick the controller on the next frame:
   ```js
   requestAnimationFrame(() => {
     if (window.LandingScroll) window.LandingScroll.init(document.getElementById('landing-stage'));
   });
   ```
2. **`route()` teardown (≈ lines 458–462):** in the same block that destroys `_erCharts` (runs at the top of every route), add:
   ```js
   if (window.LandingScroll) window.LandingScroll.destroy();
   ```
   This guarantees the observers are torn down whenever the user leaves `#/` (to `#/framework`, a service line, or a mode).
3. **`renderLandingPhaseStrip()` (≈ line 593):** now superseded by the rail. Remove it, or leave it defined but unused. Do not call it from the new `renderLanding`.
4. Do **not** touch `applyRemoteChange`, `flushPendingPatches`, any `refresh*` method, `renderSidebar`, `renderFramework`, `renderServiceLine`, or presentation/meeting modes.

### `index.html`
1. Add the new module **before** `app.js` in the script block at the bottom:
   ```html
   <script src="js/landing-scroll.js?v=20260613-v9"></script>
   ```
2. Bump the cache-bust token on `styles.css`, `data.js`, `sync.js`, `app.js`, `ask-dr-holtkamp.js` to `?v=20260613-v9` (current is `20260611-v8`).
3. Optional: preload the hero background in `<head>`:
   ```html
   <link rel="preload" as="image" href="assets/Old_Hospital.jpg">
   ```

---

## 8. Assets — PRE-STAGED, no action required

All five backgrounds exist in `assets/` with the exact filenames the code references. **Do not source, download, generate, or rename any asset.** Use as-is. Two are portrait and use special render modes (see §9 and the `.landing-bg` modifier classes in §4).

| data-bg | File (in `assets/`) | Dimensions | Render mode | Source |
|---|---|---|---|---|
| current / loes / phase1 | `Old_Hospital.jpg` | 851x315 | cover (heavy scrim + slight blur hides low res) | GLWCH (existing) |
| transition | `New_Hospital.webp` | 2108x948 | cover | GLWCH (existing) |
| phase2 | `change_of_command.webp` | 1620x1080 | cover | User-provided (change of command) |
| phase3 | `field_medicine.webp` | 1200x1600 (portrait) | **blurred-fill** -> `.landing-bg--fill` | User-provided (field medicine) |
| desired | `soldier_award.webp` | 450x800 (portrait) | **centered medal on dark** -> `.landing-bg--object` | User-provided (Bronze Star) |

Darkening for legibility comes from the CSS `.landing-scrim` plus the per-mode treatments, not the image files. If the user later drops a landscape replacement under the same filename, switch that background back to plain `cover`.

---

## 9. Styling (`css/styles.css`)

Add ONE new block, all selectors scoped under `.landing-stage` / `.landing-v2`. Use local CSS variables for the dark surface so nothing leaks into the white app. Reuse existing tokens for accents: `--gold #FFB81C`, `--army-green-light #46523f`, `--blue #1c4f78`; fonts `--font-display` (Outfit), `--font-body` (Inter).

Key rules:
- **`.landing-stage`** — the inset cinematic panel that must read as separate from the chrome:
  - `position: relative; height: calc(100vh - <top-nav-height>); overflow-y: auto; scroll-behavior: smooth;`
  - `border-radius: var(--radius-lg); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), 0 8px 40px rgba(0,0,0,.25); margin: <small inset>;` and a dark base `background:#0b0f17;` so the white `#app`/page frames it as a distinct surface.
  - Local vars: `--stage-ink:#f5f6f8; --stage-muted:rgba(245,246,248,.72);`
- **`.landing-bg-layer`** `position:absolute; inset:0; z-index:0; overflow:hidden;`
- **`.landing-bg`** `position:absolute; inset:0; background-size:cover; background-position:center; opacity:0; transition:opacity .9s ease; transform:scale(1.05);` (slow Ken-Burns optional via `transform`); `.landing-bg.active{opacity:1;}`
- **`.landing-bg[data-bg="current"]`** add `filter:blur(1px) brightness(.9);` to mask the low-res old-hospital image. Optional grain via a tiling SVG/noise `::after`.
- **Background render modes** (modifier class on the `.landing-bg` div):
  - default (cover) — `Old_Hospital.jpg`, `New_Hospital.webp`, `change_of_command.webp`: `background-size:cover; background-position:center`.
  - `.landing-bg--fill` (portrait, blurred-fill) — `field_medicine.webp`: TWO stacked layers — a blurred enlarged copy (`background-size:cover; filter:blur(26px) brightness(.65); transform:scale(1.12)`) behind a crisp contained copy (`background-size:contain; background-repeat:no-repeat; background-position:center`). No crop; cinematic on widescreen.
  - `.landing-bg--object` (centered medal on dark) — `soldier_award.webp`: solid `#0b0f17` base, medal centered + crisp via `background-size:auto 68%; background-position:center`, no blur. Medal is the hero object for the finale.
- **`.landing-scrim`** `position:absolute; inset:0; background:linear-gradient(180deg, rgba(6,10,19,.55), rgba(6,10,19,.78));` — ensures AA contrast for white text.
- **`.landing-rail`** `position:sticky; top:0; z-index:3; display:flex; gap; padding; backdrop-filter:blur(8px); background:rgba(8,12,20,.55);` segments are buttons; `.rail-seg.active` uses its `data-loe` accent for an underline/fill; include a progress line.
- **`.landing-scene`** `position:relative; z-index:2; min-height:100%; display:flex; align-items:center; padding: clamp(...);` content max-width ~760px.
- **`.landing-scene` content** default `opacity:1`; the enhancement: start `.landing-scene:not(.in-view) .reveal{opacity:0; transform:translateY(16px);}` and `.in-view .reveal{opacity:1; transform:none; transition:.7s ease;}` — but ONLY apply the hidden state when JS is active (gate with a `.js-enhanced` class set by the controller) so no-JS shows everything.
- Typography: H1 `clamp(2.2rem, 6vw, 4.5rem)` Outfit 800; kicker uppercase letter-spaced gold; goals as clean list with accent ticks.

---

## 10. Accessibility & fallbacks

- **Progressive enhancement:** content visible by default; reveal-hiding only when controller adds `.js-enhanced` to the stage. If JS fails or IO is unsupported, all scenes render stacked over the first background — fully readable.
- **`prefers-reduced-motion: reduce`:** controller skips IO reveals (adds `in-view` to all), disables bg crossfade animation (instant/static), rail uses `behavior:'auto'`. No parallax/Ken-Burns.
- **Rail:** real `<button>`s, keyboard-focusable, visible focus ring, `aria-current` on active, `aria-label` on the nav.
- **Headings:** one `<h1>` (Scene 1), `<h2>` per subsequent scene; logical order.
- **Contrast:** white text over the scrim must pass AA (scrim ≥ .6 black). Verify on the change-of-command / award photos (often bright).
- **Deep-link buttons** are real links/buttons to `#/framework`.

### Mobile (≤ 768px)
- Backgrounds `background-size:cover` (already); reduce type scale via the `clamp()` mins.
- Rail collapses to a compact stepper (short labels or dots), horizontally centered, no overflow scroll-jank.
- No pinning issues (sticky only). Ensure `.landing-stage` height accounts for mobile top-nav height; test 100svh vs 100vh for mobile URL bars.

---

## 11. Performance

- Animate **opacity/transform only**. Add `will-change:opacity` to `.landing-bg`; remove after transition if needed.
- 5 background images total; eager load is acceptable. Optional: lazy-set `background-image` via IO for non-hero scenes if payload is a concern.
- Disconnect observers on `destroy()`; no listeners/observers survive a route change (prevents leaks the way the existing `_erCharts` teardown does).
- No layout thrash: IO callbacks only toggle classes; never read layout in a loop.

---

## 12. File-by-file change summary

| File | Change |
|---|---|
| `js/landing-scroll.js` | **NEW** — `window.LandingScroll` controller (§6). |
| `js/app.js` | Rewrite `renderLanding` body (§4 DOM + §3 copy) + rAF `LandingScroll.init`; add `LandingScroll.destroy()` to `route()` teardown; retire `renderLandingPhaseStrip`. Nothing else. |
| `css/styles.css` | Append one `.landing-stage`-scoped block (§9). |
| `index.html` | Add `landing-scroll.js` script (before `app.js`); bump all `?v=` to `20260613-v9`; optional hero `preload`. |
| `assets/` | ✅ Pre-staged — all 5 backgrounds already in place with correct names. No action needed. |

---

## 13. Acceptance criteria

1. `#/` renders the dark cinematic scroll stage as a **visually distinct, inset panel**; the light top nav and left sidebar are unchanged and fully functional.
2. Scrolling within the stage advances through all 7 scenes; backgrounds crossfade Old → (Decisive Point) New hospital → Change of command → Field training → Soldier award.
3. Sticky phase rail (Current State · Build · Improve · Refine · Desired State) updates its active segment with scroll, marks Phase 2 as current (`★`), and click-jumps to each scene.
4. Each phase scene shows the correct main-effort LOE name + accent color + intent + approved goals; "Open in framework" navigates to `#/framework`.
5. Leaving `#/` calls `LandingScroll.destroy()` — no console errors, no orphaned IntersectionObservers; returning re-inits cleanly.
6. Live Firestore updates to inner pages still patch surgically; the landing never re-renders on a snapshot (it reads no Firestore data).
7. `prefers-reduced-motion`: all content visible, no crossfade/reveal animation; rail still navigates.
8. Mobile ≤ 768px: legible, backgrounds cover, rail condensed, no horizontal overflow.
9. No regressions to framework, service-line, presentation, or meeting views.
10. No-JS / IO-unsupported: scenes render stacked and readable over the first background.
11. Portrait sources render via their treatments (field medicine blurred-fill, Bronze Star centered on dark) with no hard cropping.

---

## 14. Guardrails / out of scope

- Do NOT modify `sync.js`, `firestore.rules`(.proposed), the `data.js` schema (read `FRAMEWORK` only), the surgical patch/refresh system, the static `.nav` markup, or `renderSidebar`.
- Do NOT add any Firestore read/write or `route()` call from the landing layer.
- Keep all new CSS scoped under `.landing-stage` / `.landing-v2`.

## 15. Rollback

Revert `renderLanding` (+ restore `renderLandingPhaseStrip` call), remove the `landing-scroll.js` script tag and the `route()` teardown line, delete the `.landing-stage` CSS block, restore the prior `?v=` token. `_backup/` holds data only and is unaffected.
