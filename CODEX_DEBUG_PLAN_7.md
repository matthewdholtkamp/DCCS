# CODEX_DEBUG_PLAN_7 — Cinematic Motion Polish + Narrative Clarity (Operational Framework Front Door)

**Repo:** `DCCS` (vanilla-JS hash-router SPA, Firebase compat via CDN, single `css/styles.css`, no build step)
**Target route:** `#/` → `App.renderLanding(el)` (`js/app.js:565`); controller `window.LandingScroll` (`js/landing-scroll.js`)
**Builds on:** `CODEX_DEBUG_PLAN_6` — the cinematic scroll landing is already live. This plan is a **motion + performance + narrative** delta on top of that result. Do **not** rebuild the landing; enhance it.
**Status of related systems:** render path hardened (rAF-batched surgical patches); landing consumes static `FRAMEWORK` only; the sticky `landing-bg-layer` / `landing-progress-tracker` and a real `prefers-reduced-motion` branch already exist. Do not regress these.

---

## 0. Agent Quickstart

**Goal:** Elevate the *movement* of the existing `#landing-stage` to the smooth, scroll-linked "Vectr / Utsubo" feel — momentum scroll, subtle background parallax drift, staggered masked reveals — while making the narrative arc unmistakable: **where we were → where we are → where we are going → why.** Leave the static top nav (`.nav`) and left sidebar (`#sidebar`) untouched. Keep the dark photographic skin; we are changing **motion, not look**.

**Locked decisions (from planning session):**
- **Stack A:** GSAP + ScrollTrigger + Lenis (CDN, UMD globals). No build step.
- **Subtle:** momentum + parallax + masked reveals. **No hard pinning / no scroll-jacking / no scroll-snap.**
- **Backgrounds:** KEEP the existing center-based opacity crossfade; ADD a slow parallax drift. Do **not** replace the crossfade.
- **Step zero (prerequisite):** image diet. Momentum scroll makes jank *more* visible, so the ~1.4 MB of backgrounds must come down first.

**Touch exactly these files, in this order:**
1. `assets/` — re-encode the five backgrounds smaller (§4). Same filenames. No new art.
2. `index.html` — add Lenis + GSAP + ScrollTrigger CDN tags before `landing-scroll.js`; confirm preload is first-bg only; bump `?v=` tokens → `20260613-v13` (§7).
3. `js/app.js` — in `renderLanding`: wrap the stage's inner content in `.landing-stage-inner` (Lenis content target) and convert scene titles to masked-reveal headings (§6). Surgical. **Do not change copy.**
4. `js/landing-scroll.js` — integrate Lenis (wrapper = `#landing-stage`), wire to ScrollTrigger, add parallax drift + staggered/masked reveals, gate everything on reduced-motion/touch, route rail clicks through `lenis.scrollTo`, and extend `destroy()` to tear down Lenis + ScrollTrigger (§5).
5. `css/styles.css` — masked-reveal clip styles, parallax `will-change`, expressive easing, the persistent **current-phase** rail marker, and extend the reduced-motion block to neutralize new transforms (§8).

**Never touch:** `sync.js`, `firestore.rules(.proposed)`, the `data.js` schema (read `FRAMEWORK` only), the surgical patch/refresh system (`applyRemoteChange` / `refresh*`), `.nav` markup, `renderSidebar`, `ask-dr-holtkamp.js`. No Firestore reads/writes and no `route()` calls from the landing layer. **Do not rewrite scene copy** — narrative clarity comes from motion + small structural markers, not by editing the words.

**Done when:** all §9 acceptance criteria pass.

---

## 1. Objective & narrative contract

The landing must answer four questions in order, and the motion must make that order feel inevitable:

| Beat  | Question              | Existing scene(s)                                   | Motion job                                                        |
|-------|-----------------------|-----------------------------------------------------|-------------------------------------------------------------------|
| WERE  | Where were we?        | Scene 1 — Current State ("reactive system")         | Heaviest, slowest entry; dim old-hospital bg                      |
| WHY   | Why this design?      | Scene 2 — Three Lines of Effort + the two Decisive Points | Reveal the 3 LOEs with deliberate stagger; pivots read as pivots |
| ARE   | Where are we now?     | Phase 2 — Improve (★ CURRENT)                        | Unmistakable "you are here" (see §1.1)                            |
| GOING | Where are we going?   | Desired State ("Right care. Right place. Right time.") | Brightest, calmest, resolved; primary CTA                       |

The phases (Build → Improve → Refine) are the **bridge** from WERE to GOING; the LOEs and decisive points are the **WHY**. Order on the page already supports this — the job here is to make the motion reinforce it and to fix the one ambiguity in §1.1.

### 1.1 Distinguish "scene I'm viewing" from "phase we're actually in" (key clarity fix)
Today the progress rail only highlights the scene currently centered, so a viewer cannot tell, at a glance, **which phase the organization is actually in right now**. Add a **persistent current-phase marker** on the rail node for the active phase (Phase 2 → `scene-phase2`): a small static "now" pip/ring that stays lit regardless of scroll, visually distinct from the transient active-scene highlight. This is the single most important narrative add — it pins "where we are" independent of where the user has scrolled.

Source of truth: the phase whose `status === 'active'` in `FRAMEWORK.phases`. **Read it; do not hardcode the index** — it must auto-advance after the Aug 2026 change of command moves the main effort to Phase 3.

**Hard constraints:**
- Top nav (`.nav`) and sidebar (`#sidebar`) unmodified and fully functional.
- All motion confined to `#landing-stage` inside `#app`.
- No Firestore, no `route()` from the landing layer.
- Everything degrades to the existing static experience under `prefers-reduced-motion` and on touch devices.

---

## 2. Architecture decisions (locked)
- **Smooth scroll:** Lenis, scoped to the `#landing-stage` **container** (NOT window — see §5.1, the #1 integration trap).
- **Animation engine:** GSAP + ScrollTrigger, with `scroller: '#landing-stage'` on every trigger and Lenis driving `ScrollTrigger.update`.
- **Parallax:** global scroll progress → small `yPercent` drift on `.landing-bg` images. The crossfade logic (opacity `.active`) in `landing-scroll.js` is untouched and keeps running.
- **Reveals:** GSAP takes over `.reveal` (stagger) and adds a masked wipe on scene titles. The old CSS `.in-view` fade stays as the reduced-motion fallback.
- **No** pinning, **no** scroll-snap, **no** horizontal scroll, **no** text-splitting library (one mask per heading, not per line).

---

## 3. Library loading (`index.html`) — exact
Add **before** `js/landing-scroll.js`, after `chart.umd.min.js`:
```html
<script src="https://cdn.jsdelivr.net/npm/lenis@1/dist/lenis.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
```
- Pin versions. UMD globals must be `window.Lenis`, `window.gsap`, `window.ScrollTrigger`. **Verify** the exact Lenis path/version resolves (jsdelivr `lenis@1` is current; cdnjs `lenis` is an acceptable alternative — confirm the global is `Lenis` either way).
- If any global is missing at runtime, `landing-scroll.js` must no-op the motion layer and keep the static landing (§5.6). Never throw.

---

## 4. Step zero — image diet (`assets/`)
Current weights (≈ 1.41 MB total): `New_Hospital.webp` 475 KB · `change_of_command.webp` 381 KB · `soldier_award.webp` 269 KB · `field_medicine.webp` 201 KB · `Old_Hospital.jpg` 87 KB.

**Targets:** re-encode each to **max 2400 px on the long edge**, webp quality ~72–78, **each ≤ 180 KB, total ≤ ~600 KB**. Slim `Old_Hospital.jpg` to ≤ 120 KB (jpg q~80 or convert to webp). **Keep identical filenames + paths** so no code refs change (only the `?v=` bump). The full-screen scrim hides compression — these will read as visually lossless. Verify each still ≥ display resolution at 1440p.
- Tooling: `cwebp -q 75 -resize 2400 0 in.png -o out.webp`, or Squoosh. Confirm dimensions and on-screen sharpness after the scrim.
- Optional (only if trivial): `image-set()` 1x/2x. Not required for "subtle."

---

## 5. `js/landing-scroll.js` — integration (the core work)
Keep the existing module shape (`window.LandingScroll = { init, destroy }`), the IntersectionObserver crossfade, the rail logic, and `updateScrollProgress`. Add a motion layer on top, fully gated.

### 5.1 Lenis on the container (THE trap)
`#landing-stage` is an **internal scroll container**, not the window. Initialize Lenis against the wrapper/content explicitly:
```js
const wrapper = stage;                                          // #landing-stage
const content = stage.querySelector('.landing-stage-inner');    // new wrapper from app.js §6
lenis = new Lenis({
  wrapper, content,
  duration: 1.1,
  easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),       // expo-out
  smoothWheel: true,
  smoothTouch: false,    // native scroll on touch — perf + avoids mobile lag
  syncTouch: false,
});
```
- Bridge Lenis to ScrollTrigger with a **scrollerProxy** (mandatory for a non-window scroller — without it the parallax scrub and the reveals never fire), share one RAF, and drive the EXISTING crossfade/rail/progress from Lenis events instead of `scrollTop`:
```js
ScrollTrigger.scrollerProxy(stage, {
  scrollTop(value) {
    if (arguments.length) lenis.scrollTo(value, { immediate: true });
    // current Lenis offset — property name varies by version; confirm one of these exists:
    return lenis.actualScroll ?? lenis.animatedScroll ?? lenis.scroll ?? stage.scrollTop;
  },
  getBoundingClientRect() {
    const r = stage.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
});
ScrollTrigger.defaults({ scroller: stage });

const lenisRaf = (time) => lenis.raf(time * 1000);
gsap.ticker.add(lenisRaf);
gsap.ticker.lagSmoothing(0);

// Lenis is the SINGLE source of truth for crossfade/rail/progress — never stage.scrollTop.
lenis.on('scroll', (e) => {
  ScrollTrigger.update();
  const prog = (typeof e?.progress === 'number') ? e.progress : (lenis.progress ?? 0);
  stage.style.setProperty('--landing-scroll-progress', prog.toFixed(4));
  stage.style.setProperty('--landing-scroll-percent', `${(prog * 100).toFixed(2)}%`);
  updateActiveScene();   // scene-center detection uses live getBoundingClientRect — version-agnostic
});

ScrollTrigger.refresh();  // measure AFTER scenes + proxy are wired; also call on resize
```
- **Do NOT read `stage.scrollTop` while Lenis is driving.** `updateScrollProgress()` sources progress from `lenis.progress` (above); `updateActiveScene()` keeps its existing per-scene `getBoundingClientRect()` math (position-based — correct whether Lenis scrolls natively or by transform).
- When Lenis is active, **skip** the native `wireScrollTracking()` scroll listener — the `lenis.on('scroll')` handler replaces it. Keep `wireScrollTracking()` only for the reduced-motion / no-Lenis fallback path.

### 5.2 Rail clicks + keyboard through Lenis
Replace the rail handler's native `scene.scrollIntoView({ behavior: 'smooth' ... })` with:
```js
lenis
  ? lenis.scrollTo(scene, { offset: 0 })
  : scene.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
```
Keyboard scroll (space/arrows) and Tab focus must still move/reach the stage; Lenis passes these through by default. **Verify** Tab → rail step → Enter jumps correctly and the focus ring stays visible.

### 5.3 Parallax drift (crossfade preserved)
Subtle global drift on all `.landing-bg` (only the `.active` one is visible; drifting all keeps the crossfade intact):
```js
gsap.to('.landing-stage .landing-bg', {
  yPercent: 5, ease: 'none',
  scrollTrigger: { trigger: content, start: 'top top', end: 'bottom bottom', scrub: 0.6 }
});
```
- **Seam safety:** drift must stay within the background's scale headroom. The bg is `background-size: cover` with `transform: scale(1.02)` today — raise the base to `scale(1.06)` (§8) so a 5% drift never exposes an edge. Keep drift ≤ headroom.

### 5.4 Staggered + masked reveals (per scene)
For each `.landing-scene`, on entry, stagger its `.reveal` children up and wipe its title mask:
```js
scenes.forEach(scene => {
  const items = scene.querySelectorAll('.reveal');
  if (items.length) gsap.from(items, {
    yPercent: 16, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08,
    immediateRender: false,   // trigger fails -> content stays VISIBLE, never stuck hidden
    scrollTrigger: { trigger: scene, start: 'top 78%', toggleActions: 'play none none reverse' }
  });
  const mask = scene.querySelector('.landing-title.reveal-mask > .reveal-mask-inner');
  if (mask) gsap.from(mask, {
    yPercent: 110, duration: 1.0, ease: 'expo.out',
    immediateRender: false,   // same safety: no FOUC, no invisible heading
    scrollTrigger: { trigger: scene, start: 'top 78%', toggleActions: 'play none none reverse' }
  });
});
```
- GSAP now owns the animated path. Leave the CSS `.in-view → .reveal` transition in place **only** as the reduced-motion fallback (§8).
- `start: 'top 78%'` ensures Scene 1 (already at the top on load) triggers immediately.
- **Safe visibility (no invisible titles):** CSS must never hide `.landing-title` / `.reveal` by default — only the existing `.landing-stage.js-enhanced .landing-scene:not(.in-view) .reveal` rule may, and that path is GSAP-independent. Combined with `immediateRender: false`, a failed ScrollTrigger (CDN/proxy issue) leaves content visible rather than hidden. `.reveal-mask` `overflow:hidden` clips nothing when the inner sits at its natural position.

### 5.5 Current-phase rail marker (narrative §1.1)
On `init`, find the active phase and tag its rail step (static, not cleared by scroll):
```js
const activePhase = (window.FRAMEWORK?.phases || []).find(p => p.status === 'active');
const targetSceneId = activePhase ? `scene-phase${activePhase.id}` : null;  // confirm id→scene map
if (targetSceneId) {
  const step = stage.querySelector(`.landing-progress-step[data-target="${targetSceneId}"]`);
  step && step.classList.add('is-current-phase');
}
```
CSS in §8 renders the persistent "now" pip. This runs **regardless** of reduced motion (it is static, not animation).

### 5.6 Reduced-motion, touch + teardown
- Wrap §5.1–5.4 in `if (!prefersReducedMotion())`. Under reduce: no Lenis, no GSAP triggers — the existing native scroll + instant `.in-view` reveals remain exactly as today. §5.5 still runs.
- If `Lenis`/`gsap`/`ScrollTrigger` are undefined (CDN blocked): skip the motion layer, log nothing user-facing, keep the static landing.
- **Extend `destroy()`** (mandatory — `app.js` calls `LandingScroll.destroy()` on route change, ~`js/app.js:463`; leaked triggers/RAF corrupt scrolling on inner pages):
```js
if (lenis) { gsap.ticker.remove(lenisRaf); lenis.destroy(); lenis = null; }
if (window.ScrollTrigger) ScrollTrigger.getAll().forEach(t => { if (t.scroller === stage) t.kill(); });
if (window.gsap) gsap.killTweensOf('.landing-stage .landing-bg');
```

---

## 6. `js/app.js` — `renderLanding` edits (surgical)
1. **Lenis content wrapper.** Inside `<section class="landing-stage" id="landing-stage">`, wrap ALL current children (`.landing-bg-layer`, `.landing-progress-tracker`, `.landing-stage-header`, `.landing-scenes`) in a single `<div class="landing-stage-inner"> … </div>`. Sticky children still stick to `#landing-stage` (the scroll wrapper), so bg-layer/rail pinning is unaffected — **verify** visually after wrapping.
2. **Masked titles (titles only; copy untouched, heading semantics preserved).** Convert each scene title from `<h1 class="landing-title">TEXT</h1>` to:
   ```html
   <h1 class="landing-title reveal-mask"><span class="reveal-mask-inner">TEXT</span></h1>
   ```
   (same for the `<h2 class="landing-title">` scenes). Keep the `<h1>/<h2>` element — do not downgrade to `<span>`. Apply at minimum to the four narrative anchors (Current State, Three Lines of Effort, Phase 2 Improve, Desired State); applying to all scene titles is fine.
3. No copy changes, no new/removed scenes. `renderLanding` still ends with the existing `requestAnimationFrame(() => LandingScroll.init('#landing-stage'))`.

---

## 7. `index.html`
- Add the three CDN `<script>` tags (§3) **before** `js/landing-scroll.js`.
- **Preload:** keep ONLY `<link rel="preload" as="image" href="assets/Old_Hospital.jpg">` (first scene). Confirm no other background is preloaded.
- Bump every `?v=20260613-v12` → `?v=20260613-v13` (css + all `js/*` includes).

---

## 8. `css/styles.css` (append; every selector scoped under `.landing-stage`)
- **Masked reveal:**
```css
.landing-stage .reveal-mask { display: block; overflow: hidden; }
.landing-stage .reveal-mask-inner { display: block; will-change: transform; }
```
- **Parallax headroom + perf:** raise the bg base scale so drift never exposes a seam, and keep GPU compositing:
```css
.landing-stage .landing-bg { transform: scale(1.06); will-change: opacity, transform; backface-visibility: hidden; }
.landing-stage .landing-bg.active { transform: scale(1.04); } /* keep the existing activate-zoom feel, just more headroom */
```
  (Confirm against current rules at ~`css:4700` / `4712`; adjust the `.active` scale to preserve the current Ken-Burns settle.)
- **Expressive easing:** where the scene-card / `.reveal` transition uses `ease`, prefer `cubic-bezier(0.16, 1, 0.3, 1)` for the cinematic curve. (Reduced-motion path keeps a plain ease.)
- **Persistent current-phase marker (§1.1):**
```css
.landing-stage .landing-progress-step.is-current-phase .landing-progress-dot {
  background: var(--stage-gold);
  border-color: rgba(255, 244, 205, 0.92);
  box-shadow: 0 0 0 4px rgba(8, 15, 24, 0.78), 0 0 0 7px rgba(255, 184, 28, 0.34);
}
.landing-stage .landing-progress-step.is-current-phase .landing-progress-label::after {
  content: " · now";
  color: var(--stage-gold);
  font-weight: 800;
  letter-spacing: 0.10em;
}
```
  (Tune placement to the rail layout at ~`css:4802`. The marker must remain visible whether or not that step is the scroll-active one — i.e., independent of `.active`.)
- **Extend the reduced-motion block (~`css:5119`):** neutralize the new transforms so nothing hides:
```css
@media (prefers-reduced-motion: reduce) {
  .landing-stage .reveal-mask-inner { transform: none !important; }
  .landing-stage .landing-bg { transform: none !important; }
  /* existing rules already reveal scenes + disable bg transitions — keep them */
}
```
  The `is-current-phase` marker is static and **must persist** under reduced motion.

---

## 9. Acceptance criteria

**Performance**
- Total landing background payload ≤ ~600 KB (was ~1.41 MB); each image ≤ 180 KB; only `Old_Hospital` preloaded.
- No layout shift; sustained ~60 fps while scrolling on desktop; LCP improved vs. v12.

**Motion (desktop, motion allowed)**
- Scroll has eased momentum (Lenis) inside `#landing-stage` — not native-snappy.
- Backgrounds drift subtly (≤ ~5%) with **no exposed seams**; the opacity crossfade between scenes still fires on scene-center (unchanged).
- Scene `.reveal` children stagger in; the four anchor titles wipe up from a mask on entry; easing reads as deliberate/weighty.
- **Failure-safe:** if a ScrollTrigger does not fire (CDN/proxy issue), titles and copy remain visible — never stuck hidden (verified via `immediateRender: false`).

**Narrative**
- A first-time viewer can state **were / are / going / why** after one pass.
- The active-phase rail node shows a persistent **"now"** marker, visually distinct from the transient active-scene highlight, **regardless of scroll position**, driven by `FRAMEWORK.phases` `status==='active'` (not hardcoded).

**Integrity / a11y**
- Top nav and sidebar markup, CSS, and handlers are unchanged (diff proves it).
- Rail click and keyboard (Tab → step → Enter) navigate via Lenis; focus ring visible; smooth.
- `prefers-reduced-motion`: no Lenis, no GSAP motion; static reveals + native scroll; "now" marker still present.
- Touch devices use native scroll (`smoothTouch:false`); no mobile scroll lag.
- Navigating away from `#/` and back leaves **no** leaked ScrollTrigger/Lenis RAF (inner-page scrolling normal); `LandingScroll.destroy` tears everything down.
- If any CDN (Lenis/GSAP) fails to load, the page falls back to the current static cinematic landing with no console errors that break render.

---

## 10. File-by-file change summary
| File | Change | Risk |
|---|---|---|
| `assets/*` | Re-encode 5 backgrounds ≤180 KB each, same names | Low (visual check under scrim) |
| `index.html` | +3 CDN scripts, preload audit, `?v` bump | Low |
| `js/app.js` | `renderLanding`: add `.landing-stage-inner` wrapper + masked-title markup | Med (verify sticky bg/rail still pin) |
| `js/landing-scroll.js` | Lenis + ScrollTrigger init, parallax, reveals, rail-via-lenis, `destroy()` teardown, reduced-motion gates | Med-High (core; follow §5 exactly) |
| `css/styles.css` | mask clip, bg scale headroom, easing, `is-current-phase` marker, reduced-motion neutralizers | Low-Med |

---

## 11. Guardrails / out of scope
- **Do NOT** add pinning, scroll-snap, horizontal scroll, or a text-splitting lib.
- **Do NOT** touch nav, sidebar, Ask Dr. Holtkamp, `sync.js`, Firestore, or the `data.js` schema.
- **Do NOT** rewrite scene copy or add/remove scenes (motion + the "now" marker only).
- **Do NOT** change the light inner-page theme or the dark-stage skin.
- Keep the existing crossfade + IntersectionObserver logic; this plan layers on top, it does not replace.

---

## 12. Rollback
Single commit. Revert restores v12 behavior. The CDN scripts are additive; removing the three `<script>` tags, the Lenis/GSAP block in `landing-scroll.js`, and the §8 CSS returns to the Plan-6 landing. **Keep the slimmed images even on rollback** — strict improvement, no behavior change.
