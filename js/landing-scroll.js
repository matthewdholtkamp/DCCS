(function () {
  let stage = null;
  let content = null;
  let sceneObserver = null;
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

  function bgKey(name) {
    return name === 'phase1' ? 'current' : name;
  }

  function setActiveBg(name) {
    const key = bgKey(name || 'current');
    stage.querySelectorAll('.landing-bg').forEach(bg => {
      bg.classList.toggle('active', bg.dataset.bg === key);
    });
  }

  function setActiveRail(sceneId) {
    const map = {
      'scene-current': 'scene-current',
      'scene-loes': 'scene-current',
      'scene-phase1': 'scene-phase1',
      'scene-transition': 'scene-phase1',
      'scene-phase2': 'scene-phase2',
      'scene-command': 'scene-phase2',
      'scene-phase3': 'scene-phase3',
      'scene-desired': 'scene-desired'
    };
    const target = map[sceneId] || sceneId;

    stage.querySelectorAll('.landing-progress-step').forEach(seg => {
      const active = seg.dataset.target === target;
      seg.classList.toggle('active', active);
      seg.setAttribute('aria-current', active ? 'step' : 'false');
    });
  }

  function lenisScrollOffset() {
    if (!lenis) return null;
    return lenis.actualScroll ?? lenis.animatedScroll ?? lenis.scroll ?? stage.scrollTop;
  }

  function updateScrollProgress(progressValue) {
    if (!stage) return;
    let progress = typeof progressValue === 'number' ? progressValue : null;

    if (progress === null && lenis) {
      if (typeof lenis.progress === 'number') {
        progress = lenis.progress;
      } else {
        const maxScroll = Math.max(stage.scrollHeight - stage.clientHeight, 1);
        progress = (lenisScrollOffset() || 0) / maxScroll;
      }
    }

    if (progress === null) {
      const maxScroll = Math.max(stage.scrollHeight - stage.clientHeight, 1);
      progress = stage.scrollTop / maxScroll;
    }

    progress = Math.min(1, Math.max(0, progress));
    stage.style.setProperty('--landing-scroll-progress', progress.toFixed(4));
    stage.style.setProperty('--landing-scroll-percent', `${(progress * 100).toFixed(2)}%`);
  }

  function updateActiveScene(progressValue) {
    if (!stage) return;
    updateScrollProgress(progressValue);
    const scenes = Array.from(stage.querySelectorAll('.landing-scene'));
    const stageRect = stage.getBoundingClientRect();
    const stageCenter = stageRect.top + (stageRect.height * 0.5);
    let activeScene = null;
    let activeDistance = Infinity;

    scenes.forEach(scene => {
      const rect = scene.getBoundingClientRect();
      const visiblePx = Math.min(rect.bottom, stageRect.bottom) - Math.max(rect.top, stageRect.top);
      const visibleRatio = visiblePx > 0 ? visiblePx / Math.min(rect.height, stageRect.height) : 0;

      if (visibleRatio > 0.2) {
        scene.classList.add('in-view');
      }

      if (visibleRatio > 0.35) {
        const distance = Math.abs((rect.top + rect.height * 0.5) - stageCenter);
        if (distance < activeDistance) {
          activeDistance = distance;
          activeScene = scene;
        }
      }
    });

    if (activeScene) {
      setActiveBg(activeScene.dataset.bg);
      setActiveRail(activeScene.id);
    }
  }

  function markCurrentPhase() {
    if (!stage) return;
    stage.querySelectorAll('.landing-progress-step.is-current-phase').forEach(step => {
      step.classList.remove('is-current-phase');
    });

    const framework = typeof FRAMEWORK !== 'undefined' ? FRAMEWORK : window.FRAMEWORK;
    const activePhase = (framework?.phases || []).find(phase => phase.status === 'active');
    const targetSceneId = activePhase ? `scene-phase${activePhase.id}` : null;
    const step = targetSceneId ? stage.querySelector(`.landing-progress-step[data-target="${targetSceneId}"]`) : null;
    if (step) step.classList.add('is-current-phase');
  }

  function observeScenes() {
    const scenes = Array.from(stage.querySelectorAll('.landing-scene'));
    sceneObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.2) {
          entry.target.classList.add('in-view');
        }
      });
      updateActiveScene();
    }, {
      root: stage,
      threshold: [0.2, 0.45, 0.55, 0.8],
      rootMargin: '-12% 0px -35% 0px'
    });

    scenes.forEach(scene => sceneObserver.observe(scene));
  }

  function wireScrollTracking() {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateActiveScene();
      });
    };

    stage.addEventListener('scroll', onScroll, { passive: true });
    cleanupFns.push(() => stage.removeEventListener('scroll', onScroll));
  }

  function wireRail() {
    stage.querySelectorAll('.landing-progress-step').forEach(seg => {
      const onClick = () => {
        const scene = stage.querySelector(`#${seg.dataset.target}`);
        if (!scene) return;
        scene.classList.add('in-view');
        setActiveBg(scene.dataset.bg);
        setActiveRail(scene.id);

        if (lenis) {
          lenis.scrollTo(scene, { offset: 0 });
        } else {
          scene.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        }
      };
      seg.addEventListener('click', onClick);
      cleanupFns.push(() => seg.removeEventListener('click', onClick));
    });
  }

  function initMotionLayer() {
    if (!stage || !content || !hasMotionLibraries()) return false;

    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;

    try {
      gsap.registerPlugin(ScrollTrigger);

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
          return lenisScrollOffset() ?? stage.scrollTop;
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

      lenis.on('scroll', event => {
        ScrollTrigger.update();
        const progress = typeof event?.progress === 'number'
          ? event.progress
          : (typeof lenis.progress === 'number' ? lenis.progress : null);
        updateActiveScene(progress);
      });

      const parallaxTween = gsap.to(stage.querySelectorAll('.landing-bg'), {
        yPercent: 5,
        ease: 'none',
        scrollTrigger: {
          trigger: content,
          scroller: stage,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6
        }
      });
      if (parallaxTween.scrollTrigger) motionTriggers.push(parallaxTween.scrollTrigger);

      stage.querySelectorAll('.landing-scene').forEach(scene => {
        const items = scene.querySelectorAll('.reveal');
        if (items.length) {
          const revealTween = gsap.from(items, {
            yPercent: 16,
            opacity: 0.86,
            duration: 0.9,
            ease: 'power3.out',
            stagger: 0.08,
            immediateRender: false,
            scrollTrigger: {
              trigger: scene,
              scroller: stage,
              start: 'top 78%',
              toggleActions: 'play none none reverse'
            }
          });
          if (revealTween.scrollTrigger) motionTriggers.push(revealTween.scrollTrigger);
        }

        const mask = scene.querySelector('.landing-title.reveal-mask > .reveal-mask-inner');
        if (mask) {
          const maskTween = gsap.from(mask, {
            yPercent: 110,
            duration: 1.0,
            ease: 'expo.out',
            immediateRender: false,
            scrollTrigger: {
              trigger: scene,
              scroller: stage,
              start: 'top 78%',
              toggleActions: 'play none none reverse'
            }
          });
          if (maskTween.scrollTrigger) motionTriggers.push(maskTween.scrollTrigger);
        }
      });

      const onResize = () => {
        if (lenis && typeof lenis.resize === 'function') lenis.resize();
        ScrollTrigger.refresh();
        updateActiveScene();
      };
      window.addEventListener('resize', onResize);
      cleanupFns.push(() => window.removeEventListener('resize', onResize));

      if (typeof lenis.resize === 'function') lenis.resize();
      ScrollTrigger.refresh();
      updateActiveScene();
      return true;
    } catch (error) {
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
        gsap.killTweensOf(stage.querySelectorAll('.landing-bg'));
        gsap.killTweensOf(stage.querySelectorAll('.reveal'));
        gsap.killTweensOf(stage.querySelectorAll('.reveal-mask-inner'));
      }
    }

    if (lenis) {
      lenis.destroy();
      lenis = null;
    }

    lenisRaf = null;
  }

  function init(selector = '#landing-stage') {
    destroy();
    stage = document.querySelector(selector);
    if (!stage) return;
    content = stage.querySelector('.landing-stage-inner') || stage;

    stage.scrollTop = 0;
    stage.classList.add('js-enhanced');
    updateScrollProgress();
    setActiveBg('current');
    setActiveRail('scene-current');
    markCurrentPhase();
    wireRail();

    const hasObserver = 'IntersectionObserver' in window;
    const motionAllowed = !prefersReducedMotion() && !isTouchDevice() && hasMotionLibraries();

    if (!hasObserver) {
      stage.querySelectorAll('.landing-scene').forEach(scene => scene.classList.add('in-view'));
      wireScrollTracking();
      updateActiveScene();
      return;
    }

    observeScenes();

    if (motionAllowed && initMotionLayer()) {
      updateActiveScene();
      return;
    }

    if (prefersReducedMotion()) {
      stage.querySelectorAll('.landing-scene').forEach(scene => scene.classList.add('in-view'));
    }

    wireScrollTracking();
    updateActiveScene();
  }

  function destroy() {
    teardownMotion();

    if (sceneObserver) sceneObserver.disconnect();
    sceneObserver = null;

    while (cleanupFns.length) {
      const cleanup = cleanupFns.pop();
      if (typeof cleanup === 'function') cleanup();
    }

    if (stage) stage.classList.remove('js-enhanced');
    stage = null;
    content = null;
  }

  window.LandingScroll = { init, destroy };
})();
