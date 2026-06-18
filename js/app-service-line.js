// DCCS Operational Framework - Service line page composition and phase sections
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
  // ===== SERVICE LINE DETAIL =====
  renderServiceLine(el, slId) {
    const sl = FRAMEWORK.serviceLines.find(s => s.id === slId);
    if (!sl) { this.renderFramework(el); return; }
    const D = FRAMEWORK;

    // Group tasks by phase
    const tasksByPhase = [1, 2, 3].map(p => sl.tasks.filter(t => t.phase === p));

    // Get relevant cross-cutting tasks
    const ccTasks = D.crossCuttingTasks;

    el.innerHTML = `
      <div class="page sl-detail">
        <div class="sl-detail-header">
          <div class="service-mark sl-detail-icon" aria-hidden="true">${this.serviceLineIcon(sl.id)}</div>
          <div class="sl-detail-meta">
            <h1>${sl.name}</h1>
            <p>Owner: <strong>${sl.leader}</strong>${sl.abbr ? ' • ' + sl.abbr : ''} • Current phase: ${D.phases.find(p => p.status === 'active')?.name || 'Improve'}</p>
            <p class="sl-context-line">${this.serviceLineFunction(sl)}</p>
          </div>
        </div>
        <div class="sl-detail-clinics">
          ${sl.clinics.map(c => `<span class="clinic-tag">${c}</span>`).join('<span class="clinic-separator">•</span>')}
        </div>
        <div class="page-actions" aria-label="Page actions">
          <button type="button" onclick="App.setServiceSections(true)">Expand sections</button>
          <button type="button" onclick="App.setServiceSections(false)">Current phase only</button>
        </div>

        ${this.renderWeeklyDialogue(sl)}
        ${sl.trackedMetrics || sl.metricGroups ? this.renderTrackedMetrics(sl) : ''}
        ${this.renderPhaseTaskSections(tasksByPhase, ccTasks, D)}
        ${sl.id === 'mscoe' ? this.renderTraineeCareFlow(sl) : ''}
        ${sl.hedisMetrics ? this.renderHedisDropdown(sl) : ''}
        ${this.renderServiceLineProgression(sl, tasksByPhase, ccTasks, D)}
      </div>`;

    if (sl.id === 'emergency') {
      setTimeout(() => this.drawEmergencyCharts(), 0);
    } else if (sl.id === 'mscoe') {
      setTimeout(() => this.initMscoeChartsAndTables(), 0);
    } else if (sl.trackedMetrics || sl.metricGroups) {
      setTimeout(() => {
        (sl.trackedMetrics || []).forEach(m => this.drawMiniChart(m.id));
        (sl.metricGroups || []).forEach(g => this.drawMetricGroupChart(g.id));
      }, 0);
    }
  },

  setServiceSections(expanded) {
    document.querySelectorAll('.service-section').forEach(section => {
      section.open = expanded || section.classList.contains('current-phase-section') || section.classList.contains('top-dialogue-section');
    });
    document.querySelectorAll('.dropdown-section .dropdown-content').forEach(content => {
      content.classList.toggle('open', expanded);
    });
    document.querySelectorAll('.dropdown-section .dropdown-trigger').forEach(trigger => {
      trigger.classList.toggle('open', expanded);
    });
  },

  renderPhaseTaskSections(tasksByPhase, ccTasks, D) {
    return [1, 2, 3].map(phaseNum => {
      const phase = D.phases[phaseNum - 1];
      const tasks = tasksByPhase[phaseNum - 1];
      const cc = ccTasks.filter(t => t.phase === phaseNum);
      if (tasks.length === 0 && cc.length === 0) return '';
      const isCurrent = phase.status === 'active';

      return `
        <details class="service-section phase-section ${phase.status} ${isCurrent ? 'current-phase-section' : ''}" ${isCurrent ? 'open' : ''}>
          <summary class="service-section-summary">
            <span class="phase-badge ${phase.status}">${phase.status === 'complete' ? '✓' : phase.status === 'active' ? '★' : '◇'} Phase ${phase.id}</span>
            <span class="phase-section-title">Phase ${phase.id}: ${phase.name}</span>
            <span class="service-section-meta">${phase.dateRange} • ${tasks.length + cc.length} tasks</span>
          </summary>
          <div class="service-section-body">
            ${tasks.map(task => this.renderTaskCard(task)).join('')}
            ${cc.length > 0 ? `
              <div class="cross-cutting-label">Cross-Cutting: All Service Lines</div>
              ${cc.map(task => this.renderTaskCard(task)).join('')}
            ` : ''}
          </div>
        </details>`;
    }).join('');
  },

  renderServiceLineProgression(sl, tasksByPhase, ccTasks, D) {
    return `
      <details class="service-section support-section">
        <summary class="service-section-summary">
          <span class="service-section-kicker">Timeline</span>
          <span class="phase-section-title">${sl.name} Task Progression</span>
          <span class="service-section-meta">3 phases</span>
        </summary>
        <div class="service-section-body">
          <div class="progression-map compact">
            <div class="timeline">
              ${D.phases.map((phase, i) => {
                const phaseTasks = tasksByPhase[i];
                const phaseCC = ccTasks.filter(t => t.phase === phase.id);
                return `
                <div class="timeline-phase ${phase.status}">
                  ${i < D.phases.length - 1 ? '<div class="timeline-connector"></div>' : ''}
                  <div class="timeline-phase-sub-header">
                    <span class="phase-badge ${phase.status} timeline-phase-sub-badge">${phase.status === 'complete' ? '✓' : phase.status === 'active' ? '★' : '◇'} Phase ${phase.id}: ${phase.name}</span>
                    <span class="timeline-phase-sub-date">${phase.dateRange}</span>
                  </div>
                  ${phase.status === 'active' ? '<div class="timeline-you-are-here timeline-you-are-here-sub">Current Phase</div>' : ''}
                  <div class="timeline-phase-sub-tasks">${phaseTasks.length} service line tasks${phaseCC.length > 0 ? ' + ' + phaseCC.length + ' cross-cutting' : ''}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </details>`;
  },

  });
}());
