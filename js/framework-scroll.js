(function () {
  let stage = null;
  let content = null;
  let lenis = null;
  let lenisRaf = null;
  const cleanupFns = [];
  const motionTriggers = [];
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isTouchDevice() {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0);
  }

  function hasMotionLibraries() {
    return typeof window.Lenis === 'function' && Boolean(window.gsap) && Boolean(window.ScrollTrigger);
  }

  function setActiveBg(target) {
    if (!stage) return;
    const bgMap = {
      'all': 'fw-bg-all',
      'mission': 'fw-bg-mission',
      'prior-state': 'fw-bg-prior',
      'loes': 'fw-bg-prior',
      'phase1': 'fw-bg-phase1',
      'phase2': 'fw-bg-phase2',
      'phase3': 'fw-bg-phase3',
      'desired-state': 'fw-bg-desired'
    };
    const activeBgId = bgMap[target] || 'fw-bg-all';
    
    stage.querySelectorAll('.framework-bg-photo').forEach(photo => {
      const active = photo.id === activeBgId;
      photo.classList.toggle('active', active);
    });
  }

  function updateTelemetry(target, x, y, scale) {
    if (!stage) return;
    const valSector = stage.querySelector('#hud-val-sector');
    const valCoords = stage.querySelector('#hud-val-coords');
    const valZoom = stage.querySelector('#hud-val-zoom');
    
    if (valSector) {
      const sectorNames = {
        'all': 'OVERVIEW',
        'mission': 'CMD MISSION',
        'prior-state': 'BASELINE 2025',
        'loes': 'STRAT LOES',
        'phase1': 'PH1 BUILD',
        'phase2': 'PH2 IMPROVE',
        'phase3': 'PH3 REFINE',
        'desired-state': 'OUTCOMES 2027'
      };
      valSector.textContent = sectorNames[target] || target.toUpperCase();
    }
    
    if (valCoords) {
      valCoords.textContent = `${x.toFixed(0)} / ${y.toFixed(0)}`;
    }
    
    if (valZoom) {
      valZoom.textContent = `${(scale * 100).toFixed(0)}%`;
    }
  }

  function applyFocus(target) {
    if (!stage) return;
    const slideDeck = stage.querySelector('.framework-slide-deck');
    const slide = stage.querySelector('.framework-slide');
    if (!slideDeck || !slide) return;

    const gsap = window.gsap;
    if (!gsap) return;

    // Helper to calculate coordinates relative to .framework-slide
    function getCenterRelativeToSlide(el) {
      let left = 0;
      let top = 0;
      let curr = el;
      while (curr && curr !== slide && curr !== document.body) {
        left += curr.offsetLeft;
        top += curr.offsetTop;
        curr = curr.offsetParent;
      }
      return {
        x: left + el.offsetWidth / 2,
        y: top + el.offsetHeight / 2
      };
    }

    // 1. Reset cell active states and blur class on slide
    slide.classList.remove('blur-back');
    const allElements = slide.querySelectorAll(
      '.prior-state-box, .desired-state-box, .slide-footer, .matrix-header-cell:not(.empty), .matrix-cell'
    );
    allElements.forEach(el => el.classList.remove('active-pop'));

    // 2. Map cells belonging to the current focus scene
    let activeElements = [];
    let scale = 1.25;

    if (target === 'mission') {
      activeElements = [slide.querySelector('#slide-element-mission')];
    } else if (target === 'prior-state') {
      activeElements = [slide.querySelector('#slide-element-prior-state')];
    } else if (target === 'desired-state') {
      activeElements = [slide.querySelector('#slide-element-desired-state')];
    } else if (target === 'phase1') {
      activeElements = [
        slide.querySelector('#matrix-header-p1'),
        slide.querySelector('#cell-p1-loe1'),
        slide.querySelector('#cell-p1-loe2'),
        slide.querySelector('#cell-p1-loe3')
      ];
      scale = 1.15; // slightly smaller scale to fit column elements
    } else if (target === 'phase2') {
      activeElements = [
        slide.querySelector('#matrix-header-p2'),
        slide.querySelector('#cell-p2-loe1'),
        slide.querySelector('#cell-p2-loe2'),
        slide.querySelector('#cell-p2-loe3')
      ];
      scale = 1.15;
    } else if (target === 'phase3') {
      activeElements = [
        slide.querySelector('#matrix-header-p3'),
        slide.querySelector('#cell-p3-loe1'),
        slide.querySelector('#cell-p3-loe2'),
        slide.querySelector('#cell-p3-loe3')
      ];
      scale = 1.15;
    }

    activeElements = activeElements.filter(Boolean);

    // 3. Compute target offsets relative to center (cx = 600, cy = 360)
    let dx = 0;
    let dy = 0;

    if (activeElements.length > 0) {
      slide.classList.add('blur-back');
      activeElements.forEach(el => el.classList.add('active-pop'));

      if (activeElements.length === 1) {
        const center = getCenterRelativeToSlide(activeElements[0]);
        dx = 600 - center.x;
        dy = 360 - center.y;
      } else {
        // Compute column X-center using header and Y-center using middle cell
        const header = activeElements[0];
        const middleCell = activeElements[2] || activeElements[1];
        const headerCenter = getCenterRelativeToSlide(header);
        const middleCenter = getCenterRelativeToSlide(middleCell);
        dx = 600 - headerCenter.x;
        dy = 360 - middleCenter.y;
      }
    }

    // 4. Update backdrop scrim photo
    setActiveBg(target);

    // 5. Update HUD telemetry display values
    updateTelemetry(target, dx, dy, activeElements.length > 0 ? scale : 1.0);

    // 6. Smoothly animate transforms with GSAP
    if (!prefersReducedMotion()) {
      // Keep main deck centered and unrotated
      gsap.to(slideDeck, {
        scale: 1,
        x: 0,
        y: 0,
        rotationX: 0,
        rotationY: 0,
        duration: 0.6,
        ease: 'power2.out',
        overwrite: 'auto'
      });
      gsap.to(slide, {
        rotationX: 0,
        rotationY: 0,
        duration: 0.6,
        ease: 'power2.out',
        overwrite: 'auto'
      });

      // Animate active cells/columns outwards and center them, reset non-active cells
      allElements.forEach(el => {
        const isActive = activeElements.includes(el);
        gsap.to(el, {
          x: isActive ? dx : 0,
          y: isActive ? dy : 0,
          scale: isActive ? scale : 1.0,
          duration: 0.65,
          ease: 'power2.out',
          overwrite: 'auto'
        });
      });
    } else {
      // Reduced motion direct fallback
      slideDeck.style.transform = 'none';
      slide.style.transform = 'none';
      allElements.forEach(el => {
        const isActive = activeElements.includes(el);
        if (isActive) {
          el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
        } else {
          el.style.transform = 'none';
        }
      });
    }

    // Apply focus class name to slide
    slide.className = 'framework-slide';
    const classMap = {
      'all': 'focus-all',
      'mission': 'focus-mission',
      'prior-state': 'focus-prior',
      'loes': 'focus-prior',
      'phase1': 'focus-p1',
      'phase2': 'focus-p2',
      'phase3': 'focus-p3',
      'desired-state': 'focus-desired'
    };
    const focusClass = classMap[target] || `focus-${target}`;
    slide.classList.add(focusClass);
    if (activeElements.length > 0) {
      slide.classList.add('blur-back');
    }

    // Update bottom stepper highlighted state
    setActiveRail(target);
  }

  function setActiveRail(target) {
    if (!stage) return;
    const stepMap = {
      'all': 'fw-step-all',
      'mission': 'fw-step-mission',
      'prior-state': 'fw-step-prior',
      'loes': 'fw-step-prior',
      'phase1': 'fw-step-phase1',
      'phase2': 'fw-step-phase2',
      'phase3': 'fw-step-phase3',
      'desired-state': 'fw-step-desired'
    };
    const targetStepId = stepMap[target] || 'fw-step-all';

    stage.querySelectorAll('.framework-progress-step').forEach(step => {
      const active = step.id === targetStepId;
      step.classList.toggle('active', active);
      step.setAttribute('aria-current', active ? 'step' : 'false');
    });
  }

  function wireRail() {
    stage.querySelectorAll('.framework-progress-step').forEach(step => {
      const onClick = () => {
        const sceneId = step.dataset.target;
        const scene = stage.querySelector(`#${sceneId}`);
        if (!scene) return;

        if (lenis) {
          lenis.scrollTo(scene, { offset: 0 });
        } else {
          scene.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        }
      };
      step.addEventListener('click', onClick);
      cleanupFns.push(() => step.removeEventListener('click', onClick));
    });
  }

  function initMotionLayer() {
    if (!stage || !content || !hasMotionLibraries()) return false;

    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;

    try {
      gsap.registerPlugin(ScrollTrigger);

      // Setup Lenis scroll wrapper
      lenis = new window.Lenis({
        wrapper: stage,
        content,
        duration: 1.1,
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        smoothTouch: false,
        syncTouch: false
      });

      ScrollTrigger.scrollerProxy(stage, {
        scrollTop(value) {
          if (arguments.length) {
            lenis.scrollTo(value, { immediate: true });
          }
          return lenis.actualScroll ?? lenis.animatedScroll ?? lenis.scroll ?? stage.scrollTop;
        },
        getBoundingClientRect() {
          const r = stage.getBoundingClientRect();
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        }
      });

      lenisRaf = time => {
        if (lenis) lenis.raf(time * 1000);
      };

      gsap.ticker.add(lenisRaf);
      gsap.ticker.lagSmoothing(0);

      lenis.on('scroll', () => {
        ScrollTrigger.update();
      });

      // Pin the slide presentation view
      const pinTrigger = ScrollTrigger.create({
        trigger: '.framework-presentation-container',
        scroller: stage,
        start: 'top top',
        end: 'bottom bottom',
        pin: true,
        pinSpacing: false
      });
      motionTriggers.push(pinTrigger);

      // Set up triggers for each scene to shift slide focus
      stage.querySelectorAll('.framework-scroll-scene').forEach(scene => {
        const target = scene.dataset.target;
        const trigger = ScrollTrigger.create({
          trigger: scene,
          scroller: stage,
          start: 'top 50%',
          end: 'bottom 50%',
          onToggle: self => {
            if (self.isActive) {
              applyFocus(target);
            }
          }
        });
        motionTriggers.push(trigger);
      });

      // Stagger card reveals
      stage.querySelectorAll('.framework-scroll-scene').forEach(scene => {
        const card = scene.querySelector('.narrative-card');
        if (card) {
          const revealTween = gsap.from(card, {
            yPercent: 12,
            opacity: 0.1,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: scene,
              scroller: stage,
              start: 'top 80%',
              toggleActions: 'play none none reverse'
            }
          });
          if (revealTween.scrollTrigger) motionTriggers.push(revealTween.scrollTrigger);
        }
      });

      const onResize = () => {
        if (lenis && typeof lenis.resize === 'function') lenis.resize();
        ScrollTrigger.refresh();
      };
      window.addEventListener('resize', onResize);
      cleanupFns.push(() => window.removeEventListener('resize', onResize));

      if (typeof lenis.resize === 'function') lenis.resize();
      ScrollTrigger.refresh();
      return true;
    } catch (error) {
      console.warn('Framework Scroll: Motion layer failed to load:', error);
      teardownMotion();
      return false;
    }
  }

  function teardownMotion() {
    const gsap = window.gsap;

    while (motionTriggers.length) {
      const trigger = motionTriggers.pop();
      if (trigger && typeof trigger.kill === 'function') trigger.kill();
    }

    if (gsap) {
      if (lenisRaf) gsap.ticker.remove(lenisRaf);
      if (stage) {
        gsap.killTweensOf(stage.querySelector('.framework-slide-deck'));
        gsap.killTweensOf(stage.querySelectorAll('.narrative-card'));
      }
    }

    if (lenis) {
      lenis.destroy();
      lenis = null;
    }

    lenisRaf = null;
  }

  function init(selector = '#framework-stage') {
    destroy();
    stage = document.querySelector(selector);
    if (!stage) return;
    content = stage.querySelector('.framework-stage-inner') || stage;

    stage.scrollTop = 0;
    stage.classList.add('js-enhanced');
    applyFocus('all');
    wireRail();

    // (Mousemove tilt event listener removed to satisfy user choice)

    const hasObserver = 'IntersectionObserver' in window;
    const motionAllowed = !prefersReducedMotion() && !isTouchDevice() && hasMotionLibraries();

    if (!hasObserver) {
      wireScrollTrackingFallback();
      return;
    }

    if (motionAllowed && initMotionLayer()) {
      return;
    }

    // Standard scroll fallback if motion/libraries are not supported
    wireScrollTrackingFallback();
  }

  function wireScrollTrackingFallback() {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateActiveSceneFallback();
      });
    };

    stage.addEventListener('scroll', onScroll, { passive: true });
    cleanupFns.push(() => stage.removeEventListener('scroll', onScroll));
    updateActiveSceneFallback();
  }

  function updateActiveSceneFallback() {
    if (!stage) return;
    const scenes = Array.from(stage.querySelectorAll('.framework-scroll-scene'));
    const stageRect = stage.getBoundingClientRect();
    const stageCenter = stageRect.top + (stageRect.height * 0.5);
    let activeScene = null;
    let activeDistance = Infinity;

    scenes.forEach(scene => {
      const rect = scene.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.height * 0.5) - stageCenter);
      if (distance < activeDistance) {
        activeDistance = distance;
        activeScene = scene;
      }
    });

    if (activeScene) {
      applyFocus(activeScene.dataset.target);
    }
  }

  function destroy() {
    teardownMotion();

    while (cleanupFns.length) {
      const cleanup = cleanupFns.pop();
      if (typeof cleanup === 'function') cleanup();
    }

    if (stage) stage.classList.remove('js-enhanced');
    stage = null;
    content = null;
  }

  window.FrameworkScroll = { init, destroy };
})();
