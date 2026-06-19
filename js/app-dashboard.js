// DCCS Operational Dashboard - at-a-glance status across service lines (added 2026-06-19)
// New #/dashboard route. Reuses App.metricStatus / getMetricDisplayEntries /
// getMetricEntries / getTaskData - it computes nothing new, only aggregates.
// Self-contained: injects its own CSS (no CSS-file edits). Does not touch Home,
// the Operational Framework page, or the service-line pages.
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
    DASHBOARD_STALE_DAYS: 14,

    dashboardServiceMetrics(sl) {
      const defs = [];
      (sl.trackedMetrics || []).forEach(m => defs.push(m));
      (sl.metricGroups || []).forEach(g => (g.series || []).forEach(s => defs.push({ ...s, period: g.period, groupId: g.id })));
      return defs;
    },

    dashboardDaysSince(dateStr) {
      const s = String(dateStr || '').slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return null;
      const then = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      const today = String((this.getLocalToday && this.getLocalToday()) || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const tm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
      const now = tm ? Date.UTC(+tm[1], +tm[2] - 1, +tm[3]) : Date.now();
      return Math.round((now - then) / 86400000);
    },

    dashboardTileData(sl) {
      const metrics = this.dashboardServiceMetrics(sl);
      let good = 0, warn = 0, neutral = 0, stale = 0, noData = 0, freshest = null;
      const offTarget = [];
      metrics.forEach(m => {
        const entries = this.getMetricDisplayEntries(m);
        const st = this.metricStatus(m, entries);
        if (st.tone === 'warn') { warn++; offTarget.push({ metric: m, latest: entries.length ? entries[entries.length - 1].value : null }); }
        else if (st.tone === 'good') good++;
        else neutral++;
        const raw = this.getMetricEntries(m.id);
        if (!raw.length) { noData++; return; }
        const d = this.dashboardDaysSince(raw[raw.length - 1].date);
        if (d === null) return;
        if (freshest === null || d < freshest) freshest = d;
        if (d > this.DASHBOARD_STALE_DAYS) stale++;
      });

      let openKpis = 0, activeTasks = 0;
      (sl.tasks || []).forEach(t => {
        const saved = this.getTaskData(t.id) || {};
        let status = saved.status || t.status;
        if (status === 'not-started') status = 'not-reviewed';
        if (status !== 'in-progress') return;
        activeTasks++;
        const checks = saved.kpis || {}, deleted = saved.deletedKpis || {};
        (t.kpis || []).forEach((k, i) => { if (!deleted[i] && !checks[i]) openKpis++; });
        (saved.customKpis || []).forEach((k, i) => { if (!checks['custom-' + i]) openKpis++; });
      });

      const tone = warn > 0 ? 'warn' : good > 0 ? 'good' : 'neutral';
      return { tone, good, warn, neutral, offTarget, openKpis, activeTasks, stale: stale + noData, freshest };
    },

    renderDashboardTile(sl) {
      const esc = (s) => this.escapeHtml(String(s == null ? '' : s));
      const d = this.dashboardTileData(sl);

      const chips = [`<span class="dash-chip good">${d.good} on goal</span>`];
      if (d.warn) chips.push(`<span class="dash-chip warn">${d.warn} off-target</span>`);
      if (d.neutral) chips.push(`<span class="dash-chip neutral">${d.neutral} tracking</span>`);

      let offHtml;
      if (d.offTarget.length) {
        const rows = d.offTarget.slice(0, 3).map(o => {
          const m = o.metric;
          const val = o.latest != null ? this.formatMetricValue(m, o.latest) : '\u2014';
          const goal = (m.goal != null) ? ` \u00b7 goal ${m.direction === 'lower' ? '<' : '\u2265'} ${this.formatMetricValue(m, m.goal)}` : '';
          return `<li><span class="dash-off-name">${esc(m.name)}</span><span class="dash-off-val">${esc(val)}${esc(goal)}</span></li>`;
        }).join('');
        const more = d.offTarget.length > 3 ? `<li class="dash-more">+${d.offTarget.length - 3} more off-target</li>` : '';
        offHtml = `<ul class="dash-offlist">${rows}${more}</ul>`;
      } else {
        offHtml = `<div class="dash-allgood">All tracked metrics on goal or steady.</div>`;
      }

      const staleClass = d.stale ? 'is-stale' : '';
      const staleText = d.stale ? `${d.stale} stale` : 'all fresh';
      const lastText = d.freshest != null ? ` \u00b7 last ${d.freshest}d ago` : '';

      return `
        <a class="dash-tile tone-${d.tone}" href="#/framework/${sl.id}">
          <div class="dash-tile-head">
            <span class="dash-dot"></span>
            <span class="dash-tile-name">${esc(sl.name)}</span>
            ${sl.leader ? `<span class="dash-tile-leader">${esc(sl.leader)}</span>` : ''}
          </div>
          <div class="dash-chip-row">${chips.join('')}</div>
          ${offHtml}
          <div class="dash-foot">
            <span class="dash-foot-item" title="Open KPIs on in-progress tasks">\u25f7 ${d.openKpis} open KPI${d.openKpis === 1 ? '' : 's'}${d.activeTasks ? ` \u00b7 ${d.activeTasks} active` : ''}</span>
            <span class="dash-foot-item ${staleClass}" title="Metrics with no entry in ${this.DASHBOARD_STALE_DAYS}+ days">\u2691 ${staleText}${lastText}</span>
          </div>
          <span class="dash-open">Open service line \u203a</span>
        </a>`;
    },

    renderDashboard(el) {
      this.injectDashboardStyles();
      const tiles = (FRAMEWORK.serviceLines || []).map(sl => this.renderDashboardTile(sl)).join('');
      el.innerHTML = `
        <section class="dash-wrap">
          <header class="dash-head">
            <div>
              <h1 class="dash-title">Operational Dashboard</h1>
              <p class="dash-sub">Live status across service lines${FRAMEWORK.hospital ? ' \u00b7 ' + this.escapeHtml(FRAMEWORK.hospital) : ''}</p>
            </div>
            <a class="dash-framework-link" href="#/framework">Operational Framework \u203a</a>
          </header>
          <div class="dash-grid">${tiles}</div>
        </section>`;
    },

    injectDashboardStyles() {
      if (document.getElementById('dashboard-styles')) return;
      const css = `
.nav-dashboard{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:var(--transition);border:1px solid var(--border-subtle);background:transparent;font-family:inherit}
.nav-dashboard:hover{color:var(--gold);background:rgba(200,168,78,0.1);border-color:var(--border-accent)}
.nav-dashboard.active{color:var(--gold);background:rgba(200,168,78,0.15);border-color:var(--gold)}
.dash-wrap{max-width:1200px;margin:0 auto;padding:32px 24px 64px}
.dash-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.dash-title{font-family:var(--font-display,inherit);font-size:1.9rem;font-weight:800;color:var(--text-primary);margin:0}
.dash-sub{color:var(--text-muted);font-size:.9rem;margin:4px 0 0}
.dash-framework-link{color:var(--gold);font-weight:700;font-size:.85rem;text-decoration:none;white-space:nowrap}
.dash-framework-link:hover{color:var(--gold-light)}
.dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.dash-tile{display:block;text-decoration:none;background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);border-left:4px solid #8a8f98;border-radius:14px;padding:16px 18px;transition:var(--transition);color:inherit}
.dash-tile:hover{transform:translateY(-2px);border-color:var(--border-accent);box-shadow:0 10px 28px rgba(0,0,0,0.28)}
.dash-tile.tone-good{--dash-accent:#5cb874;border-left-color:#5cb874}
.dash-tile.tone-warn{--dash-accent:#e0a23d;border-left-color:#e0a23d}
.dash-tile.tone-neutral{--dash-accent:#8a8f98;border-left-color:#8a8f98}
.dash-tile-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.dash-dot{width:10px;height:10px;border-radius:50%;background:var(--dash-accent,#8a8f98);flex:none;box-shadow:0 0 8px var(--dash-accent,#8a8f98)}
.dash-tile-name{font-weight:800;font-size:1rem;color:var(--text-primary)}
.dash-tile-leader{margin-left:auto;font-size:.72rem;color:var(--text-muted);white-space:nowrap}
.dash-chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.dash-chip{font-size:.7rem;font-weight:700;padding:3px 9px;border-radius:999px;border:1px solid var(--border-subtle);color:var(--text-secondary)}
.dash-chip.good{color:#7fd498;border-color:rgba(92,184,116,0.4);background:rgba(92,184,116,0.1)}
.dash-chip.warn{color:#f0bd6b;border-color:rgba(224,162,61,0.45);background:rgba(224,162,61,0.12)}
.dash-chip.neutral{color:var(--text-muted)}
.dash-offlist{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:5px}
.dash-offlist li{display:flex;justify-content:space-between;gap:10px;font-size:.78rem;align-items:baseline}
.dash-off-name{color:var(--text-secondary);font-weight:600}
.dash-off-val{color:#f0bd6b;font-weight:700;white-space:nowrap;text-align:right}
.dash-more{color:var(--text-muted);font-weight:600;font-size:.74rem}
.dash-allgood{font-size:.78rem;color:#7fd498;margin-bottom:10px}
.dash-foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;border-top:1px solid var(--border-subtle);padding-top:10px;margin-top:2px}
.dash-foot-item{font-size:.72rem;color:var(--text-muted);font-weight:600}
.dash-foot-item.is-stale{color:#f0bd6b}
.dash-open{display:inline-block;margin-top:10px;font-size:.72rem;font-weight:800;color:var(--gold);text-transform:uppercase;letter-spacing:.04em}
@media (max-width:560px){.dash-grid{grid-template-columns:1fr}.dash-wrap{padding:20px 14px 48px}}
`;
      const style = document.createElement('style');
      style.id = 'dashboard-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }
  });
}());
