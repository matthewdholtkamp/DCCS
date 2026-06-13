(function () {
  let stage = null;
  let content = null;
  let lenis = null;
  let lenisRaf = null;
  const cleanupFns = [];
  const motionTriggers = [];
  let activeRotX = 0;
  let activeRotY = 0;

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

  function handleMouseMove(e) {
    if (prefersReducedMotion() || isTouchDevice()) return;
    if (!stage) return;
    const slide = stage.querySelector('.framework-slide');
    if (!slide) return;
    
    const rect = stage.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Normalize coordinates around center (-1 to 1)
    const normX = (mouseX / rect.width) * 2 - 1;
    const normY = (mouseY / rect.height) * 2 - 1;
    
    // Calculate tilt angles (max tilt ±2.5 deg)
    const tiltX = -normY * 2.5;
    const tiltY = normX * 2.5;
    
    const gsap = window.gsap;
    if (gsap) {
      gsap.to(slide, {
        rotationX: tiltX,
        rotationY: tiltY,
        duration: 0.5,
        ease: 'power1.out',
        overwrite: 'auto'
      });
    }
  }

  function applyFocus(target) {
    if (!stage) return;
    const slideDeck = stage.querySelector('.framework-slide-deck');
    const slide = stage.querySelector('.framework-slide');
    if (!slideDeck || !slide) return;

    // Define coordinates based on targets
    let scale = 1.0;
    let x = 0;
    let y = 0;
    let rotationX = 0;
    let rotationY = 0;

    // We scale down the offsets slightly on smaller screens so the content remains visible
    const isSmallScreen = window.innerWidth <= 1024;
    const widthFactor = isSmallScreen ? 0.7 : 1.0;

    if (target === 'mission') {
      scale = 1.75;
      x = 0;
      y = isSmallScreen ? 140 : 200;
      rotationX = -4.5;
      rotationY = 0;
    } else if (target === 'prior-state') {
      scale = 1.7;
      x = (isSmallScreen ? 220 : 340) * widthFactor;
      y = 0;
      rotationX = 0;
      rotationY = -6.0;
    } else if (target === 'loes') {
      scale = 1.55;
      x = (isSmallScreen ? 180 : 280) * widthFactor;
      y = 0;
      rotationX = 1.5;
      rotationY = -4.0;
    } else if (target === 'phase1') {
      scale = 1.5;
      x = (isSmallScreen ? 100 : 150) * widthFactor;
      y = 0;
      rotationX = 1.0;
      rotationY = -3.0;
    } else if (target === 'phase2') {
      scale = 1.5;
      x = 0;
      y = 0;
      rotationX = 0;
      rotationY = 0;
    } else if (target === 'phase3') {
      scale = 1.5;
      x = (isSmallScreen ? -100 : -150) * widthFactor;
      y = 0;
      rotationX = 1.0;
      rotationY = 3.0;
    } else if (target === 'desired-state') {
      scale = 1.7;
      x = (isSmallScreen ? -220 : -340) * widthFactor;
      y = 0;
      rotationX = 0;
      rotationY = 6.0;
    }

    activeRotX = rotationX;
    activeRotY = rotationY;

    // Swap background images
    setActiveBg(target);

    // Update Telemetry display
    updateTelemetry(target, x, y, scale);

    const gsap = window.gsap;
    if (gsap && !prefersReducedMotion()) {
      gsap.to(slideDeck, {
        scale: scale,
        x: x,
        y: y,
        rotationX: rotationX,
        rotationY: rotationY,
        duration: 0.85,
        ease: 'power3.out',
        overwrite: 'auto'
      });
      // Smoothly animate inner slide rotation back to center during zoom shifts
      gsap.to(slide, {
        rotationX: 0,
        rotationY: 0,
        duration: 0.85,
        ease: 'power3.out',
        overwrite: 'auto'
      });
    } else {
      // Direct jump for reduced motion
      slideDeck.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotateX(${rotationX}deg) rotateY(${rotationY}deg)`;
      slide.style.transform = 'none';
    }

    // Apply focus class to dim other components with aligned mapping
    slide.className = 'framework-slide';
    const classMap = {
      'all': 'focus-all',
      'mission': 'focus-mission',
      'prior-state': 'focus-prior',
      'loes': 'focus-loes',
      'phase1': 'focus-p1',
      'phase2': 'focus-p2',
      'phase3': 'focus-p3',
      'desired-state': 'focus-desired'
    };
    const focusClass = classMap[target] || `focus-${target}`;
    slide.classList.add(focusClass);

    // Update progress steps
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

    // Bind mousemove parallax tilt
    const mouseMoveHandler = (e) => handleMouseMove(e);
    stage.addEventListener('mousemove', mouseMoveHandler);
    cleanupFns.push(() => stage.removeEventListener('mousemove', mouseMoveHandler));

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
