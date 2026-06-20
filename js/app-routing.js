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

    const isDashboard = parts[0] === 'dashboard';
    const isRollup = parts[0] === 'rollup';
    const isFrameworkRoute = parts[0] === 'framework';
    const serviceLineId = isFrameworkRoute ? parts[1] : null;

    if (isDashboard) this.renderDashboard(main);
    else if (isRollup) this.renderRollup(main);
    else if (serviceLineId) this.renderServiceLine(main, serviceLineId);
    else if (isFrameworkRoute) this.renderFramework(main);
    else this.renderLanding(main);

    this.renderSidebar(serviceLineId, isFrameworkRoute && !serviceLineId);
    const dashBtn = document.getElementById('btn-dashboard');
    if (dashBtn) dashBtn.classList.toggle('active', isDashboard);
    const rollBtn = document.getElementById('btn-rollup');
    if (rollBtn) rollBtn.classList.toggle('active', isRollup);
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
