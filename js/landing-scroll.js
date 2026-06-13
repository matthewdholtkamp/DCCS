(function () {
  let stage = null;
  let sceneObserver = null;
  const cleanupFns = [];

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  function updateScrollProgress() {
    if (!stage) return;
    const maxScroll = Math.max(stage.scrollHeight - stage.clientHeight, 1);
    const progress = Math.min(1, Math.max(0, stage.scrollTop / maxScroll));
    stage.style.setProperty('--landing-scroll-progress', progress.toFixed(4));
    stage.style.setProperty('--landing-scroll-percent', `${(progress * 100).toFixed(2)}%`);
  }

  function updateActiveScene() {
    if (!stage) return;
    updateScrollProgress();
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
        scene.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      };
      seg.addEventListener('click', onClick);
      cleanupFns.push(() => seg.removeEventListener('click', onClick));
    });
  }

  function init(selector = '#landing-stage') {
    destroy();
    stage = document.querySelector(selector);
    if (!stage) return;

    stage.scrollTop = 0;
    stage.classList.add('js-enhanced');
    updateScrollProgress();
    setActiveBg('current');
    setActiveRail('scene-current');

    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      stage.querySelectorAll('.landing-scene').forEach(scene => scene.classList.add('in-view'));
      wireScrollTracking();
      wireRail();
      updateActiveScene();
      return;
    }

    observeScenes();
    wireScrollTracking();
    wireRail();
    updateActiveScene();
  }

  function destroy() {
    if (sceneObserver) sceneObserver.disconnect();
    sceneObserver = null;

    while (cleanupFns.length) {
      const cleanup = cleanupFns.pop();
      if (typeof cleanup === 'function') cleanup();
    }

    if (stage) stage.classList.remove('js-enhanced');
    stage = null;
  }

  window.LandingScroll = { init, destroy };
})();
