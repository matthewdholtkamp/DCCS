/* =============================================================================
 * framework-scroll.js
 * DCCS Operational Framework — cinematic walkthrough controller (Model B)
 * -----------------------------------------------------------------------------
 * A camera glides/zooms across a persistent operational-design board while a
 * heavy detail panel narrates each region in the commander's voice.
 *
 * Engine is copied from landing-scroll.js: Lenis smooth-scroll wired to GSAP
 * ScrollTrigger via ScrollTrigger.scrollerProxy(). BEATS[] below is the single
 * source of truth for the walk (camera targets, backgrounds, narration, rail).
 *
 * HANDOFF NOTES FOR CODEX
 *   - This file is inert until app.js renders the DOM contract below and CSS
 *     defines the new framework block. When all three land, rename this to
 *     js/framework-scroll.js (replacing the old one) and update index.html's
 *     ?v= cache string.
 *   - SHIP STAGE 1 FIRST: leave USE_SCRUB = false. Verify the full walk is
 *     stable (no clip, no jitter). THEN flip USE_SCRUB = true for the
 *     continuous glide (Stage 2) and take the tuning pass there only.
 *
 * REQUIRED DOM (renderFramework must emit this):
 *   #framework-stage                       scroll wrapper (overflow-y:auto; height:calc(100vh-64px))
 *     .framework-stage-inner               height set by JS = BEATS.length*100vh
 *       .framework-cinema                  position:sticky; top:0; height:calc(100vh-64px)
 *         .framework-photo-layer           one .framework-bg-photo[data-bg="<key>"] per PHOTO key + .framework-scrim
 *         .framework-viewport              overflow:hidden (camera window; flex-fills right of the 292px sidebar)
 *           .framework-camera              position:relative; transform-origin:0 0; will-change:transform
 *             .framework-board             the slide (digital twin of the .pptx); cells carry the #b-* IDs
 *         .framework-progress-tracker      one .framework-progress-step[data-rail="<id>"] per RAIL id
 *       .framework-beats                   EMPTY — this controller injects the invisible 100vh markers
 *
 * Board cell IDs (must exist on .framework-board):
 *   #b-mission #b-current #b-desired
 *   #b-p1 #b-p2 #b-p3
 *   #b-p1-loe1 #b-p1-loe2 #b-p1-loe3
 *   #b-p2-loe1 #b-p2-loe2 #b-p2-loe3
 *   #b-p3-loe1 #b-p3-loe2 #b-p3-loe3
 *   #b-dp1 #b-dp2
 * ============================================================================= */

(function () {
  'use strict';

  // ---- BUILD FLAG -----------------------------------------------------------
  // Stage 1 = false (discrete camera tweens). Stage 2 = true (scrubbed glide).
  const USE_SCRUB = true;

  // ---- TUNING ---------------------------------------------------------------
  const CAMERA_DURATION = 0.9;     // Stage 1 tween seconds
  const CAMERA_EASE     = 'power3.inOut';
  const SCRUB_EASE      = 'power2.inOut';
  const SCRUB_AMOUNT    = 0.8;     // ScrollTrigger scrub lag
  const MAX_SCALE       = 1.55;    // preserve row/phase context around small cells

  // ---- THE WALK -------------------------------------------------------------
  // target: CSS selector of the board region to frame, or null = whole board.
  // fill:   fraction of the viewport the target should occupy when framed.
  // photo:  data-bg key on .framework-photo-layer.
  // rail:   which progress-step lights up.
  // ---- module state ---------------------------------------------------------
  let BEATS = [];
  let stage, stageInner, cinema, viewport, camera, board, photoLayer, beatsEl, railSteps;
  let lenis = null, lenisRaf = null, sceneObserver = null;
  let beats = [];          // precomputed [{x,y,scale,targetEl}]
  let regionEls = [];      // unique dimmable board regions
  let activeIndex = -1;
  const cleanupFns = [];
  const motionTriggers = [];

  // ---- capability checks ----------------------------------------------------
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isNarrowViewport() {
    return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  }
  function hasMotionLibraries() {
    return typeof window.Lenis === 'function' && Boolean(window.gsap) && Boolean(window.ScrollTrigger);
  }
  function lenisScrollOffset() {
    if (!lenis) return null;
    return lenis.actualScroll ?? lenis.animatedScroll ?? lenis.scroll ?? stage.scrollTop;
  }

  // ---- camera math (measured at init + resize, never in the scroll hot path)--
  function boardSpaceRect(el) {
    // Accumulate layout offsets up to .framework-camera. offsetLeft/Top/Width/
    // Height are pre-transform layout metrics, so this is correct even while the
    // camera carries a transform.
    let left = 0, top = 0, node = el;
    while (node && node !== camera && node !== document.body) {
      left += node.offsetLeft;
      top += node.offsetTop;
      node = node.offsetParent;
    }
    const w = el.offsetWidth, h = el.offsetHeight;
    return { cx: left + w / 2, cy: top + h / 2, w, h };
  }

  function frameTarget(el, fill) {
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    const r = boardSpaceRect(el);
    if (!r.w || !r.h) return { x: 0, y: 0, scale: 1 };
    const scale = Math.min((vpW * fill) / r.w, (vpH * fill) / r.h, MAX_SCALE);
    return {
      x: vpW / 2 - r.cx * scale,
      y: vpH / 2 - r.cy * scale,
      scale
    };
  }

  function computeBeats() {
    regionEls = Array.from(board.querySelectorAll('[data-framework-region]'));
    beats = BEATS.map(b => {
      const targetEl = b.target ? board.querySelector(b.target) : board;
      if (targetEl && targetEl !== board && regionEls.indexOf(targetEl) === -1) {
        regionEls.push(targetEl);
      }
      const t = targetEl ? frameTarget(targetEl, b.fill) : { x: 0, y: 0, scale: 1 };
      return { x: t.x, y: t.y, scale: t.scale, targetEl };
    });
  }

  function setActivePhoto(key) {
    if (!photoLayer) return;
    photoLayer.querySelectorAll('.framework-bg-photo').forEach(p => {
      p.classList.toggle('active', p.dataset.bg === key);
    });
  }

  function applyDim(targetEl) {
    const wholeBoard = (targetEl === board || !targetEl);
    regionEls.forEach(el => {
      el.classList.toggle('is-focus', !wholeBoard && el === targetEl);
      el.classList.toggle('is-dim', !wholeBoard && el !== targetEl);
    });
    board.classList.toggle('board-overview', wholeBoard);
  }

  function setActiveRail(railId) {
    railSteps.forEach(step => {
      const active = step.dataset.rail === railId;
      step.classList.toggle('active', active);
      step.setAttribute('aria-current', active ? 'step' : 'false');
    });
  }

  // ---- activate a beat ------------------------------------------------------
  function activate(index, opts) {
    if (index < 0 || index >= beats.length || index === activeIndex) return;
    activeIndex = index;
    const meta = BEATS[index];
    const b = beats[index];
    if (stage) stage.dataset.activeBeat = meta.id;
    setActivePhoto(meta.photo);
    applyDim(b.targetEl);

    if (cinema) {
      cinema.classList.toggle('is-start', index === 0);
    }

    const detail = stage.querySelector('.framework-detail');
    if (detail) {
      const overview = (index === 0 || index === BEATS.length - 1 || b.targetEl === board);
      if (overview) {
        detail.classList.remove('is-visible');
      } else {
        const full = b.targetEl && b.targetEl.querySelector('.cell-full');
        const prose = meta.text ? `<p class="detail-prose">${meta.text}</p>` : '';
        const bullets = full ? full.innerHTML : '';
        detail.querySelector('.detail-eyebrow').textContent = (meta.eyebrow || '');
        detail.querySelector('.detail-body').innerHTML = prose + bullets;
        detail.classList.add('is-visible');
      }
    }

    setActiveRail(meta.rail);

    // In scrub mode the timeline owns the camera; only drive it here in Stage 1.
    if (!USE_SCRUB) {
      const gsap = window.gsap;
      if (gsap && !(opts && opts.instant) && !prefersReducedMotion()) {
        gsap.to(camera, { x: b.x, y: b.y, scale: b.scale, duration: CAMERA_DURATION, ease: CAMERA_EASE, overwrite: 'auto' });
      } else if (gsap) {
        gsap.set(camera, { x: b.x, y: b.y, scale: b.scale });
      } else {
        camera.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) scale(${b.scale})`;
      }
    }
  }

  // ---- invisible scroll markers (one 100vh marker per beat) -----------------
  function buildMarkers() {
    beatsEl.innerHTML = '';
    BEATS.forEach((b, i) => {
      const m = document.createElement('section');
      m.className = 'framework-beat';
      m.id = `fb-${b.id}`;
      m.dataset.index = String(i);
      m.setAttribute('aria-hidden', 'true');
      beatsEl.appendChild(m);
    });
    // The marker stack defines the scroll length; the cinema sticks within it.
    stageInner.style.height = `${BEATS.length * 100}vh`;
  }

  // ---- motion layer: Lenis + ScrollTrigger via scrollerProxy (from landing) --
  function initMotionLayer() {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    try {
      gsap.registerPlugin(ScrollTrigger);

      // Flush any stale proxy/scroll state left by the previous page's Lenis
      // (e.g. landing-scroll). Even though route() calls destroy(), ScrollTrigger
      // may retain internal cached scroll positions from the old proxy.
      if (typeof ScrollTrigger.clearScrollMemory === 'function') {
        ScrollTrigger.clearScrollMemory();
      }
      ScrollTrigger.scrollerProxy(stage, undefined); // ensure no leftover proxy
      ScrollTrigger.refresh(true);

      lenis = new window.Lenis({
        wrapper: stage,
        content: stageInner,
        duration: 1.1,
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        smoothTouch: false,
        syncTouch: false
      });
      lenis.scrollTo(0, { immediate: true });

      ScrollTrigger.scrollerProxy(stage, {
        scrollTop(value) {
          if (arguments.length) lenis.scrollTo(value, { immediate: true });
          return lenisScrollOffset() ?? stage.scrollTop;
        },
        getBoundingClientRect() {
          const r = stage.getBoundingClientRect();
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        }
      });

      lenisRaf = time => { if (lenis) lenis.raf(time * 1000); };
      gsap.ticker.add(lenisRaf);
      gsap.ticker.lagSmoothing(0);

      lenis.on('scroll', () => { ScrollTrigger.update(); });

      if (USE_SCRUB) buildScrubTimeline();

      const onResize = () => {
        if (lenis && typeof lenis.resize === 'function') lenis.resize();
        computeBeats();
        if (USE_SCRUB) { rebuildScrubTimeline(); }
        else if (activeIndex >= 0) { activate(activeIndex, { instant: true }); }
        ScrollTrigger.refresh(true);
      };
      window.addEventListener('resize', onResize);
      cleanupFns.push(() => window.removeEventListener('resize', onResize));

      if (typeof lenis.resize === 'function') lenis.resize();
      ScrollTrigger.refresh();
      return true;
    } catch (err) {
      console.warn('[framework] motion layer failed:', err);
      teardownMotion();
      return false;
    }
  }

  // ---- Stage 2: single scrubbed camera timeline -----------------------------
  let scrubTimeline = null;
  function buildScrubTimeline() {
    const gsap = window.gsap;
    scrubTimeline = gsap.timeline({
      defaults: { ease: SCRUB_EASE },
      scrollTrigger: {
        trigger: beatsEl,
        scroller: stage,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
        snap: {
          snapTo: 1 / (BEATS.length - 1),   // one stop per beat
          duration: { min: 0.25, max: 0.5 },
          delay: 0.05,
          ease: 'power2.inOut',
          inertia: false                    // don't coast past — lock onto the nearest section
        }
      }
    });
    gsap.set(camera, { x: beats[0].x, y: beats[0].y, scale: beats[0].scale });
    beats.forEach((b, i) => {
      if (i === 0) return;
      scrubTimeline.to(camera, { x: b.x, y: b.y, scale: b.scale }, i - 1);
    });
    if (scrubTimeline.scrollTrigger) motionTriggers.push(scrubTimeline.scrollTrigger);
  }
  function rebuildScrubTimeline() {
    if (scrubTimeline) {
      if (scrubTimeline.scrollTrigger) scrubTimeline.scrollTrigger.kill();
      scrubTimeline.kill();
      scrubTimeline = null;
    }
    buildScrubTimeline();
  }

  // ---- scene detection (drives caption/photo/dim/rail + Stage-1 camera) -----
  function observeBeats() {
    sceneObserver = new IntersectionObserver(() => { pickActive(); }, {
      root: stage,
      threshold: [0.25, 0.5, 0.75],
      rootMargin: '-25% 0px -45% 0px'
    });
    Array.from(beatsEl.children).forEach(m => sceneObserver.observe(m));
  }

  function pickActive() {
    const markers = Array.from(beatsEl.children);
    const sr = stage.getBoundingClientRect();
    const center = sr.top + sr.height * 0.5;
    let best = -1, bestDist = Infinity;
    markers.forEach((m, i) => {
      const r = m.getBoundingClientRect();
      const d = Math.abs((r.top + r.height * 0.5) - center);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best >= 0) activate(best);
  }

  function wireScrollTrackingFallback() {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; pickActive(); });
    };
    stage.addEventListener('scroll', onScroll, { passive: true });
    cleanupFns.push(() => stage.removeEventListener('scroll', onScroll));
  }

  // ---- rail -----------------------------------------------------------------
  function wireRail() {
    railSteps.forEach(step => {
      const onClick = () => {
        const railTargets = {
          overview: 'establish', mission: 'mission', prior: 'current',
          p1: 'p1', p2: 'p2', p3: 'p3', desired: 'desired'
        };
        const railId = step.dataset.rail;
        const targetId = railTargets[railId] || railId;
        const i = BEATS.findIndex(b => b.id === targetId);
        if (i < 0) return;
        const marker = beatsEl.children[i];
        if (!marker) return;
        if (lenis) lenis.scrollTo(marker, { offset: 0 });
        else marker.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      };
      step.addEventListener('click', onClick);
      cleanupFns.push(() => step.removeEventListener('click', onClick));
    });
  }

  // ---- teardown -------------------------------------------------------------
  function teardownMotion() {
    const gsap = window.gsap;
    while (motionTriggers.length) {
      const t = motionTriggers.pop();
      if (t && typeof t.kill === 'function') t.kill();
    }
    if (window.ScrollTrigger) {
      if (typeof window.ScrollTrigger.getAll === 'function') {
        window.ScrollTrigger.getAll().forEach(t => {
          if (t.scroller === stage) t.kill();
        });
      }
      if (stage && typeof window.ScrollTrigger.scrollerProxy === 'function') {
        window.ScrollTrigger.scrollerProxy(stage, undefined);
      }
    }
    if (scrubTimeline) { scrubTimeline.kill(); scrubTimeline = null; }
    if (gsap) {
      if (lenisRaf) gsap.ticker.remove(lenisRaf);
      if (camera) gsap.killTweensOf(camera);
    }
    if (lenis) { lenis.destroy(); lenis = null; }
    lenisRaf = null;
  }

  // ---- deferred layout refresh (fixes first-load stale measurements) --------
  let _refreshTimer = null;
  function deferredRefresh() {
    // Recompute camera positions after fonts/images/sidebar settle
    if (!stage || !viewport || !camera || !board) return;
    computeBeats();
    if (USE_SCRUB) rebuildScrubTimeline();
    else if (activeIndex >= 0) activate(activeIndex, { instant: true });
    if (lenis && typeof lenis.resize === 'function') lenis.resize();
    if (window.ScrollTrigger) window.ScrollTrigger.refresh(true);
  }
  function scheduleDeferredRefresh(delayMs) {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(deferredRefresh, delayMs);
  }

  // ---- init / destroy -------------------------------------------------------
  function cacheDom() {
    stageInner = stage.querySelector('.framework-stage-inner');
    cinema     = stage.querySelector('.framework-cinema');
    viewport   = stage.querySelector('.framework-viewport');
    camera     = stage.querySelector('.framework-camera');
    board      = stage.querySelector('.framework-board');
    photoLayer = stage.querySelector('.framework-photo-layer');
    beatsEl    = stage.querySelector('.framework-beats');
    railSteps  = Array.from(stage.querySelectorAll('.framework-progress-step'));
    return stageInner && cinema && viewport && camera && board && beatsEl;
  }

  function init(selector = '#framework-stage') {
    destroy();
    stage = document.querySelector(selector);
    if (!stage) return;
    if (!cacheDom()) { console.warn('[framework] required DOM missing — check renderFramework markup'); return; }

    stage.scrollTop = 0;
    stage.classList.add('js-enhanced');
    activeIndex = -1;

    BEATS = (typeof FRAMEWORK !== 'undefined' && FRAMEWORK.beats) ? FRAMEWORK.beats : [];

    buildMarkers();
    wireRail();

    // Force a synchronous reflow so GSAP gets correct layout dimensions immediately
    void stage.offsetHeight;
    void viewport.clientWidth;

    if (!stage) return;
    computeBeats();

    const motionAllowed = !prefersReducedMotion() && !isNarrowViewport() &&
      hasMotionLibraries() && ('IntersectionObserver' in window);

    if (motionAllowed && initMotionLayer()) {
      observeBeats();
      activate(0, { instant: true });   // establishing shot
      pickActive();

      // Deferred refreshes: layout may be stale on first navigation because
      // fonts, images, or sidebar haven't settled yet. This is the root cause
      // of the "works only after manual reload" bug.
      scheduleDeferredRefresh(300);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => scheduleDeferredRefresh(100));
      }
      const onLoad = () => { scheduleDeferredRefresh(200); window.removeEventListener('load', onLoad); };
      if (document.readyState === 'complete') scheduleDeferredRefresh(150);
      else window.addEventListener('load', onLoad);
      cleanupFns.push(() => { clearTimeout(_refreshTimer); window.removeEventListener('load', onLoad); });
      return;
    }

    // ---- static fallback: full board lit, native scroll updates caption -----
    if (window.gsap) window.gsap.set(camera, { x: beats[0].x, y: beats[0].y, scale: beats[0].scale });
    else camera.style.transform = `translate3d(${beats[0].x}px, ${beats[0].y}px, 0) scale(${beats[0].scale})`;
    board.classList.add('board-overview');
    if ('IntersectionObserver' in window) observeBeats();
    wireScrollTrackingFallback();
    activate(0, { instant: true });
    pickActive();
  }

  function destroy() {
    clearTimeout(_refreshTimer);
    teardownMotion();
    if (sceneObserver) { sceneObserver.disconnect(); sceneObserver = null; }
    while (cleanupFns.length) {
      const fn = cleanupFns.pop();
      if (typeof fn === 'function') fn();
    }
    if (stage) {
      stage.classList.remove('js-enhanced');
      delete stage.dataset.activeBeat;
    }
    stage = stageInner = cinema = viewport = camera = board = photoLayer = beatsEl = null;
    railSteps = null;
    beats = []; regionEls = []; activeIndex = -1;
  }

  window.FrameworkScroll = { init, destroy };
})();
