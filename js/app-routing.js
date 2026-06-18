// DCCS Operational Framework - Routing and sidebar rendering
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
  route() {
    if (window.DCCS_DEBUG) window.DCCS_DEBUG.routeCalls++;
    if (this._erCharts) {
      Object.keys(this._erCharts).forEach(id => this._destroyErChart(id));
    }
    if (window.ScrollTrigger && typeof window.ScrollTrigger.getAll === 'function') {
      window.ScrollTrigger.getAll().forEach(t => t.kill());
      if (typeof window.ScrollTrigger.clearScrollMemory === 'function') {
        window.ScrollTrigger.clearScrollMemory();
      }
    }
    if (window.LandingScroll) window.LandingScroll.destroy();
    if (window.FrameworkScroll) window.FrameworkScroll.destroy();
    const hash = location.hash.slice(1) || '/';
    const main = document.getElementById('app');
    const parts = hash.split('/').filter(Boolean);

    // If navigating to root, exit any active mode
    if ((parts.length === 0 || hash === '/') && !this.togglingMode) {
      if (this.isPresentationMode) {
        this.isPresentationMode = false;
        document.body.classList.remove('presentation-mode-active');
        const presBtn = document.getElementById('btn-presentation-mode');
        if (presBtn) presBtn.classList.remove('active');
        this.teardownPresentationListeners();
      }
      if (this.isMeetingMode) {
        this.isMeetingMode = false;
        document.body.classList.remove('meeting-mode-active');
        const meetBtn = document.getElementById('btn-meeting-mode');
        if (meetBtn) meetBtn.classList.remove('active');
      }
    }

    this.togglingMode = false;

    if (this.isPresentationMode) {
      this.renderPresentationMode(main);
      this.renderSidebar(null);
      window.scrollTo(0, 0);
      return;
    }

    if (this.isMeetingMode) {
      this.renderMeetingMode(main);
      this.renderSidebar(null);
      window.scrollTo(0, 0);
      return;
    }

    const isFrameworkRoute = parts[0] === 'framework';
    const serviceLineId = isFrameworkRoute ? parts[1] : null;

    if (serviceLineId) this.renderServiceLine(main, serviceLineId);
    else if (isFrameworkRoute) this.renderFramework(main);
    else this.renderLanding(main);

    this.renderSidebar(serviceLineId, isFrameworkRoute && !serviceLineId);
    window.scrollTo(0, 0);
  },

  renderSidebar(activeServiceLine, frameworkActive = false) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const D = FRAMEWORK;

    sidebar.innerHTML = `
      <a class="sidebar-title ${frameworkActive ? 'active' : ''}" href="#/framework">
        <span class="sidebar-title-main">Operational Framework</span>
        <span class="sidebar-title-year">2027</span>
      </a>
      <div class="sidebar-section-label">Service Lines</div>
      <nav class="sidebar-links" aria-label="Service lines">
        ${D.serviceLines.map(sl => `
          <a class="sidebar-link ${activeServiceLine === sl.id ? 'active' : ''}" href="#/framework/${sl.id}">
            <span class="service-mark sidebar-link-icon" aria-hidden="true">${this.serviceLineIcon(sl.id)}</span>
            <span>
              <span class="sidebar-link-name">${sl.name}</span>
              <span class="sidebar-link-meta">${sl.leader}${sl.abbr ? ' • ' + sl.abbr : ''}</span>
            </span>
          </a>
        `).join('')}
      </nav>`;
  },
  });
}());
