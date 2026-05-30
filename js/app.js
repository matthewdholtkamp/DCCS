// DCCS Operational Framework — Main Application
// SECURITY NOTE: Firebase config keys are exposed client-side by design.
// Firestore Security Rules must be configured to restrict read/write access.
// These keys alone do not grant admin access — they identify the project.
const App = {
  _notesSaveTimers: {},
  expandedMetricId: null,
  expandedMetricGroupId: null,
  isMeetingMode: false,
  meetingActiveServiceLineId: null,
  isPresentationMode: false,
  presentationActiveIndex: 0,

  getLocalToday() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  confirmAction(message, onConfirm) {
    let dialog = document.getElementById('confirm-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'confirm-dialog';
      dialog.className = 'military-modal';
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = `
      <div class="military-modal-header">Confirm Action</div>
      <div class="military-modal-body">${this.escapeHtml(message)}</div>
      <div class="military-modal-actions">
        <button class="military-modal-btn cancel" id="confirm-dialog-cancel">Cancel</button>
        <button class="military-modal-btn confirm" id="confirm-dialog-confirm">Confirm</button>
      </div>
    `;
    const cancelBtn = dialog.querySelector('#confirm-dialog-cancel');
    const confirmBtn = dialog.querySelector('#confirm-dialog-confirm');
    
    cancelBtn.addEventListener('click', () => dialog.close());
    confirmBtn.addEventListener('click', () => {
      dialog.close();
      onConfirm();
    });
    dialog.showModal();
  },

  showTooltip(event, date, value) {
    let tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'chart-tooltip';
      tooltip.className = 'chart-tooltip';
      document.body.appendChild(tooltip);
    }
    tooltip.innerHTML = `
      <div class="chart-tooltip-date">${this.escapeHtml(date)}</div>
      <div class="chart-tooltip-value">${this.escapeHtml(value)}</div>
    `;
    tooltip.classList.add('show');
    const rect = event.target.getBoundingClientRect();
    const x = window.scrollX + rect.left + rect.width / 2;
    const y = window.scrollY + rect.top;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  },

  hideTooltip() {
    const tooltip = document.getElementById('chart-tooltip');
    if (tooltip) {
      tooltip.classList.remove('show');
    }
  },

  init() {
    window.addEventListener('hashchange', () => this.route());
    // P2: Auto-clear input validation errors when user interacts
    document.addEventListener('focus', (e) => {
      if (e.target.classList?.contains('input-error')) {
        e.target.classList.remove('input-error');
      }
    }, true);
    this.route();
  },

  route() {
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (this.isMeetingMode) {
      this.renderMeetingMode(main);
      this.renderSidebar(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const isFrameworkRoute = parts[0] === 'framework';
    const serviceLineId = isFrameworkRoute ? parts[1] : null;

    if (serviceLineId) this.renderServiceLine(main, serviceLineId);
    else if (isFrameworkRoute) this.renderFramework(main);
    else this.renderLanding(main);

    this.renderSidebar(serviceLineId, isFrameworkRoute && !serviceLineId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  statusLabel(s) {
    const map = { 'complete': '✓ Complete', 'in-progress': '◉ In Progress', 'not-reviewed': '○ Not Reviewed', 'not-started': '○ Not Started', 'upcoming': '◇ Upcoming' };
    return map[s] || s;
  },

  serviceLineIcon(id) {
    const map = { pcsl: 'PCSL', surgery: '3SL', 'mental-health': 'MH', emergency: 'ED', mscoe: 'MS' };
    return map[id] || 'DCS';
  },

  serviceLineFunction(sl) {
    if (sl.id === 'mscoe') return 'Trainee care model and MSCoE medical integration';
    if (sl.id === 'emergency') return 'Emergency access, acuity, and trainee flow';
    if (sl.id === 'mental-health') return 'Behavioral health access, readiness, and disposition flow';
    if (sl.id === 'surgery') return 'Surgical throughput, readiness, and perioperative reliability';
    return 'Primary care access, HEDIS readiness, and care-ladder execution';
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  },

  // ===== LANDING PAGE =====
  renderLanding(el) {
    const D = FRAMEWORK;
    el.innerHTML = `
      <div class="page landing">
        <div class="landing-header">
          <div class="landing-eyebrow">Defense Health Agency • Fort Leonard Wood</div>
          <h1 class="landing-title">${D.hospital}</h1>
          <p class="landing-subtitle">${D.title}</p>
          <div class="landing-mission">${D.mission}</div>
        </div>
        ${this.renderLandingPhaseStrip()}
        <div class="landing-footer">
          <div class="landing-leadership">
            <div class="landing-leader-box">
              <div class="landing-footer-name">${D.leader.name}</div>
              <div class="landing-footer-title">${D.leader.title}</div>
            </div>
            <div class="landing-leader-box">
              <div class="landing-footer-name">${D.assistant.name}</div>
              <div class="landing-footer-title">${D.assistant.title}</div>
            </div>
          </div>
          <div class="landing-motto-box">
            Motto: <span>${D.motto}</span>
          </div>
        </div>
      </div>`;
  },

  renderLandingPhaseStrip() {
    const phases = FRAMEWORK.phases;
    return `
      <div class="landing-phase-strip" aria-label="Operational phase status">
        ${phases.map((phase, index) => `
          <div class="landing-phase-card ${phase.status}">
            <span class="landing-phase-label">${phase.status === 'active' ? '★ Current' : `Phase ${phase.id}`}</span>
            <strong>Phase ${phase.id}: ${phase.name}</strong>
          </div>
          ${index < phases.length - 1 ? `
            <div class="landing-transition-chip" aria-label="Transition from phase ${phase.id} to phase ${phases[index + 1].id}">
              <span>Transition</span>
              <strong>${phase.decisivePoint.name}</strong>
            </div>
          ` : ''}
        `).join('')}
      </div>`;
  },

  // ===== SHARED DISCLOSURE =====
  toggleDropdown(id) {
    const el = document.getElementById(id);
    const btn = el?.previousElementSibling;
    if (el) {
      el.classList.toggle('open');
      btn?.classList.toggle('open');
    }
  },

  // ===== FRAMEWORK OVERVIEW =====
  renderFramework(el) {
    el.innerHTML = `
      <div class="page framework-page">
        ${this.renderFrameworkCore()}
      </div>`;
  },

  renderFrameworkCore() {
    const D = FRAMEWORK;
    return `
      <section class="framework-overview" aria-label="Operational framework">
        <div class="section-header">
          <div class="section-eyebrow">DCCS / MSCoE Surgeon</div>
          <h2 class="section-title">Operational Framework — 2027</h2>
          <p class="section-desc">${D.vision}</p>
        </div>

        <div class="transformation-diagram">
          <div class="state-box current">
            <div class="state-label current">2025 Current State</div>
            <div class="state-text">${D.currentState}</div>
          </div>
          
          <div class="loe-arrows-column" aria-label="Lines of effort">
            ${D.loes.map(loe => `
              <div class="loe-bridge-arrow">
                <span class="loe-bridge-num">LOE ${loe.id}</span>
                <span class="loe-bridge-name">${loe.name}</span>
                <span class="loe-bridge-desc">${loe.description}</span>
              </div>
            `).join('')}
          </div>

          <div class="state-box desired">
            <div class="state-label desired">2027 Desired State</div>
            <div class="state-text">${D.desiredState}</div>
          </div>
        </div>

        <div class="progression-map">
          <div class="progression-title">Operational Timeline — <span class="text-gold">Progression Map</span></div>
          <div class="timeline">
            ${D.phases.map((phase, i) => `
              <div class="timeline-phase ${phase.status}">
                ${i < D.phases.length - 1 ? '<div class="timeline-connector"></div>' : ''}
                <div class="timeline-phase-header">
                  <div>
                    <span class="phase-badge ${phase.status}">${phase.status === 'complete' ? '✓' : phase.status === 'active' ? '★' : '◇'} Phase ${phase.id}</span>
                  </div>
                  <div class="timeline-phase-dates">${phase.dateRange}</div>
                </div>
                ${phase.status === 'active' ? '<div class="timeline-you-are-here">★ YOU ARE HERE</div>' : ''}
                <div class="timeline-phase-name">Phase ${phase.id}: ${phase.name}</div>
                <div class="timeline-phase-effort">Main Effort: <strong>LOE — ${phase.mainEffort}</strong></div>
                <div class="timeline-phase-desc">${phase.description}</div>
                <div class="timeline-phase-hq">HQ: ${phase.hq}</div>
                <div class="timeline-dp">
                  <span class="timeline-dp-icon">${phase.decisivePoint.status === 'complete' ? '✓' : '★'}</span>
                  <div>
                    <div class="timeline-dp-title">Decisive Point: ${phase.decisivePoint.name}</div>
                    <div class="timeline-dp-date">${phase.decisivePoint.date}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="priority-pop-container">
          <div class="priority-pop-header">Priority Populations</div>
          <div class="priority-pop-list">
            ${D.priorityPopulations.map((p, i) => `
              <div class="priority-pop-item ${i === 0 ? 'primary' : ''}">
                ${i+1}. ${p}
              </div>
              ${i < D.priorityPopulations.length - 1 ? '<span class="priority-pop-separator">›</span>' : ''}
            `).join('')}
          </div>
        </div>

        <div class="cross-cutting-info-box">
          <div class="cross-cutting-info-title">Cross-Cutting Tasks (LOE 2: Ready Medical Force)</div>
          <div class="cross-cutting-info-desc">${D.crossCuttingTasks.length} tasks apply across all service lines and remain visible within each service line detail view.</div>
        </div>
      </section>`;
  },

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

    if (sl.trackedMetrics || sl.metricGroups) {
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

  // ===== PERSISTENCE (localStorage) =====
  getTaskData(taskId) {
    return Sync.getTaskData(taskId);
  },

  saveTaskData(taskId, data) {
    Sync.saveTaskData(taskId, data);
  },

  findTask(taskId) {
    for (const sl of FRAMEWORK.serviceLines) {
      const task = sl.tasks?.find(t => t.id === taskId);
      if (task) return task;
    }
    return FRAMEWORK.crossCuttingTasks.find(t => t.id === taskId);
  },

  refreshTaskCard(taskId) {
    if (this.isMeetingMode) {
      const sl = FRAMEWORK.serviceLines.find(s => s.tasks?.some(t => t.id === taskId));
      if (sl) {
        this.setMeetingActiveServiceLine(sl.id);
        return;
      }
    }
    const card = document.getElementById(`task-${taskId}`);
    const task = this.findTask(taskId);
    if (!card || !task) {
      this.route();
      return;
    }
    card.outerHTML = this.renderTaskCard(task);
  },

  reindexCustomKpiChecks(kpis, removedIndex) {
    const next = {};
    Object.entries(kpis || {}).forEach(([key, value]) => {
      if (!key.startsWith('custom-')) {
        next[key] = value;
        return;
      }
      const oldIndex = Number(key.replace('custom-', ''));
      if (!Number.isInteger(oldIndex) || oldIndex === removedIndex) return;
      const newIndex = oldIndex > removedIndex ? oldIndex - 1 : oldIndex;
      next[`custom-${newIndex}`] = value;
    });
    return next;
  },

  toggleKpi(taskId, kpiIndex) {
    const data = this.getTaskData(taskId);
    const kpis = data.kpis || {};
    const kpiDates = data.kpiDates || {};
    kpis[kpiIndex] = !kpis[kpiIndex];
    if (kpis[kpiIndex]) {
      kpiDates[kpiIndex] = this.getLocalToday();
    } else {
      delete kpiDates[kpiIndex];
    }
    this.saveTaskData(taskId, { kpis, kpiDates });
    this.refreshTaskCard(taskId);
    this.route();
  },

  changeKpiDate(taskId, kpiIndex, newDate) {
    const data = this.getTaskData(taskId);
    const kpiDates = data.kpiDates || {};
    if (newDate) {
      kpiDates[kpiIndex] = newDate;
    } else {
      delete kpiDates[kpiIndex];
    }
    this.saveTaskData(taskId, { kpiDates });
    this.refreshTaskCard(taskId);
    this.route();
  },

  toggleBuiltInKpiDeleted(taskId, kpiIndex) {
    const data = this.getTaskData(taskId);
    const deletedKpis = data.deletedKpis || {};
    deletedKpis[kpiIndex] = !deletedKpis[kpiIndex];
    this.saveTaskData(taskId, { deletedKpis });
    this.refreshTaskCard(taskId);
  },

  addCustomKpi(taskId) {
    const input = document.getElementById(`new-kpi-${taskId}`);
    if (!input || !input.value.trim()) return;
    
    const data = this.getTaskData(taskId);
    const customKpis = Array.isArray(data.customKpis) ? [...data.customKpis] : [];
    customKpis.push(input.value.trim());
    this.saveTaskData(taskId, { customKpis });
    input.value = '';
    this.refreshTaskCard(taskId);
  },

  deleteCustomKpi(taskId, index) {
    const data = this.getTaskData(taskId);
    const customKpis = Array.isArray(data.customKpis) ? [...data.customKpis] : [];
    customKpis.splice(index, 1);
    
    const kpis = this.reindexCustomKpiChecks(data.kpis || {}, index);
    const kpiDates = this.reindexCustomKpiChecks(data.kpiDates || {}, index);
    
    this.saveTaskData(taskId, { customKpis, kpis, kpiDates });
    this.refreshTaskCard(taskId);
  },

  setTaskStatus(taskId, status) {
    this.saveTaskData(taskId, { status });
    document.querySelectorAll(`[data-status-task="${taskId}"]`).forEach(btn => {
      btn.className = 'status-option';
      if (btn.dataset.statusValue === status) {
        btn.classList.add('active-' + status);
      }
    });
    const badge = document.getElementById(`badge-${taskId}`);
    if (badge) {
      badge.className = `status-badge ${status}`;
      badge.textContent = this.statusLabel(status);
    }
  },

  toggleNotes(taskId) {
    const area = document.getElementById(`notes-area-${taskId}`);
    const btn = document.getElementById(`notes-btn-${taskId}`);
    if (area) {
      const isOpen = area.style.display !== 'none';
      area.style.display = isOpen ? 'none' : 'block';
      btn?.classList.toggle('open', !isOpen);
    }
  },

  saveNotes(taskId) {
    // P5: Debounce saves to reduce Firestore writes during rapid typing
    if (this._notesSaveTimers[taskId]) clearTimeout(this._notesSaveTimers[taskId]);
    this._notesSaveTimers[taskId] = setTimeout(() => {
      const textarea = document.getElementById(`notes-input-${taskId}`);
      if (textarea) {
        this.saveTaskData(taskId, { notes: textarea.value });
        const indicator = document.getElementById(`notes-saved-${taskId}`);
        if (indicator) {
          indicator.classList.add('show');
          setTimeout(() => indicator.classList.remove('show'), 1800);
        }
      }
    }, 600);
  },

  renderTaskCard(task) {
    const saved = this.getTaskData(task.id);
    const currentStatus = saved.status || task.status;
    const kpiChecks = saved.kpis || {};
    const kpiDates = saved.kpiDates || {};
    const deletedKpis = saved.deletedKpis || {};
    const notes = saved.notes || '';

    return `
      <div class="task-card" id="task-${task.id}">
        <div class="task-header">
          <div class="task-title">${this.escapeHtml(task.title)}</div>
          <div class="task-header-badges">
            <span class="loe-tag loe-${task.loe}">LOE ${task.loe}</span>
            <span class="status-badge ${currentStatus}" id="badge-${task.id}">${this.statusLabel(currentStatus)}</span>
          </div>
        </div>
        <div class="task-desc">${this.escapeHtml(task.description)}</div>

        <!-- Interactive KPIs -->
        <div class="task-kpi-list">
          ${(task.kpis || []).map((k, i) => {
            const checked = !!kpiChecks[i];
            const deleted = !!deletedKpis[i];
            const dateInput = checked 
              ? `<span class="kpi-date-container" onclick="event.stopPropagation();">
                   <span class="kpi-date-label">Completed:</span>
                   <input class="kpi-date-picker" type="date" value="${kpiDates[i] || ''}" onchange="App.changeKpiDate('${task.id}', '${i}', this.value)" title="Change completion date">
                 </span>`
              : '';
            return `
              <div class="kpi-interactive ${checked ? 'checked' : ''} ${deleted ? 'soft-deleted' : ''}" id="kpi-${task.id}-${i}" onclick="App.toggleKpi('${task.id}', '${i}')">
                <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                <div class="kpi-label ${checked ? 'checked' : ''} ${deleted ? 'soft-deleted' : ''}">${this.escapeHtml(k)}</div>
                ${dateInput}
                <button class="kpi-action-btn" type="button" onclick="event.stopPropagation(); App.toggleBuiltInKpiDeleted('${task.id}', '${i}')" title="${deleted ? 'Restore framework KPI' : 'Line out framework KPI'}">${deleted ? 'Restore' : 'Line out'}</button>
              </div>`;
          }).join('')}
          ${(saved.customKpis || []).map((k, i) => {
            const idx = `custom-${i}`;
            const checked = !!kpiChecks[idx];
            const dateInput = checked 
              ? `<span class="kpi-date-container" onclick="event.stopPropagation();">
                   <span class="kpi-date-label">Completed:</span>
                   <input class="kpi-date-picker" type="date" value="${kpiDates[idx] || ''}" onchange="App.changeKpiDate('${task.id}', '${idx}', this.value)" title="Change completion date">
                 </span>`
              : '';
            return `
              <div class="kpi-interactive custom-kpi ${checked ? 'checked' : ''}" id="kpi-${task.id}-${idx}" onclick="App.toggleKpi('${task.id}', '${idx}')">
                <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                <div class="kpi-label ${checked ? 'checked' : ''}">${this.escapeHtml(k)}</div>
                ${dateInput}
                <button class="kpi-action-btn danger" type="button" onclick="event.stopPropagation(); App.deleteCustomKpi('${task.id}', ${i})" title="Delete custom KPI permanently">Delete</button>
              </div>`;
          }).join('')}
        </div>
        
        <!-- Add Custom KPI Input -->
        <form class="kpi-add-form" onsubmit="App.addCustomKpi('${task.id}'); return false;">
          <input type="text" id="new-kpi-${task.id}" placeholder="+ Type a new KPI to track...">
          <button type="submit">Add</button>
        </form>

        <!-- Status Selector + Notes -->
        <div class="task-notes-area">
          <div class="task-action-row">
            <div class="status-selector">
              <button class="status-option ${currentStatus === 'complete' ? 'active-complete' : ''}" data-status-task="${task.id}" data-status-value="complete" onclick="App.setTaskStatus('${task.id}','complete')">✓ Complete</button>
              <button class="status-option ${currentStatus === 'in-progress' ? 'active-in-progress' : ''}" data-status-task="${task.id}" data-status-value="in-progress" onclick="App.setTaskStatus('${task.id}','in-progress')">◉ In Progress</button>
              <button class="status-option ${currentStatus === 'not-started' ? 'active-not-started' : ''}" data-status-task="${task.id}" data-status-value="not-started" onclick="App.setTaskStatus('${task.id}','not-started')">○ Not Started</button>
            </div>
            <button class="task-notes-toggle ${notes ? 'open' : ''}" id="notes-btn-${task.id}" onclick="App.toggleNotes('${task.id}')">
              ✎ ${notes ? 'View Notes' : 'Add Notes'}
            </button>
            <span class="task-notes-saved" id="notes-saved-${task.id}">✓ Saved</span>
          </div>
          <div id="notes-area-${task.id}" style="display:${notes ? 'block' : 'none'};">
            <textarea class="task-notes-input" id="notes-input-${task.id}" placeholder="Enter accomplishments, updates, or notes..." oninput="App.saveNotes('${task.id}')">${notes}</textarea>
          </div>
        </div>
      </div>`;
  },

  // ===== TRACKED METRICS (line graph + data entry) =====
  getMetricStore() {
    return Sync.getMetricStore();
  },

  saveMetricStore(all) {
    Sync.saveMetricStore(all);
  },

  getMetricDefinition(metricId) {
    for (const sl of FRAMEWORK.serviceLines) {
      const metric = sl.trackedMetrics?.find(m => m.id === metricId);
      if (metric) return metric;
      for (const group of sl.metricGroups || []) {
        const series = group.series?.find(s => s.id === metricId);
        if (series) return { ...series, period: group.period, groupId: group.id };
      }
    }
    return null;
  },

  getMetricGroupDefinition(groupId) {
    for (const sl of FRAMEWORK.serviceLines) {
      const group = sl.metricGroups?.find(g => g.id === groupId);
      if (group) return { group, serviceLine: sl };
    }
    return null;
  },

  getMetricGroupForSeries(metricId) {
    for (const sl of FRAMEWORK.serviceLines) {
      const group = sl.metricGroups?.find(g => g.series?.some(s => s.id === metricId));
      if (group) return { group, serviceLine: sl };
    }
    return null;
  },

  getMetricEntries(metricId) {
    const all = this.getMetricStore();
    return all[metricId] || [];
  },

  addMetricEntry(metricId) {
    const valInput = document.getElementById(`metric-val-${metricId}`);
    const dateInput = document.getElementById(`metric-date-${metricId}`);
    if (!valInput) return;
    
    valInput.classList.remove('input-error');
    if (dateInput) dateInput.classList.remove('input-error');
    
    let hasError = false;
    if (!dateInput || !dateInput.value) {
      if (dateInput) dateInput.classList.add('input-error');
      hasError = true;
    }
    
    const parsedVal = parseFloat(valInput.value);
    if (valInput.value === '' || isNaN(parsedVal)) {
      valInput.classList.add('input-error');
      hasError = true;
    }
    
    if (hasError) return;
    
    const all = this.getMetricStore();
    const entries = all[metricId] || [];
    entries.push({ date: dateInput.value, value: parsedVal });
    entries.sort((a, b) => a.date.localeCompare(b.date));
    all[metricId] = entries;
    this.saveMetricStore(all);
    valInput.value = '';
    // P2: Show save confirmation flash
    valInput.style.boxShadow = '0 0 0 2px rgba(122,172,106,0.5)';
    setTimeout(() => { valInput.style.boxShadow = ''; }, 800);
    this.refreshMetricDisplay(metricId);
  },

  drawMiniChart(metricId) {
    const chart = document.getElementById(`chart-${metricId}`);
    const metric = this.getMetricDefinition(metricId);
    if (!chart || !metric) return;
    const entries = this.getMetricEntries(metricId);
    chart.innerHTML = this.renderMetricChart(metric, entries);
  },

  addMetricGroupEntry(groupId) {
    const found = this.getMetricGroupDefinition(groupId);
    if (!found) return;
    const { group } = found;
    const dateInput = document.getElementById(`metric-group-date-${group.id}`);
    
    if (dateInput) dateInput.classList.remove('input-error');
    
    let dateHasError = false;
    if (!dateInput || !dateInput.value) {
      if (dateInput) dateInput.classList.add('input-error');
      dateHasError = true;
    }
    
    let hasValues = false;
    let valueHasError = false;
    const inputs = [];
    
    group.series.forEach(series => {
      const input = document.getElementById(`metric-group-val-${group.id}-${series.id}`);
      if (input) {
        input.classList.remove('input-error');
        inputs.push({ series, input });
        if (input.value !== '') {
          const parsed = parseFloat(input.value);
          if (isNaN(parsed)) {
            input.classList.add('input-error');
            valueHasError = true;
          } else {
            hasValues = true;
          }
        }
      }
    });
    
    // If no values were entered at all, mark all empty series inputs as errors
    if (!hasValues && !valueHasError) {
      inputs.forEach(({ input }) => {
        input.classList.add('input-error');
      });
      valueHasError = true;
    }
    
    if (dateHasError || valueHasError) return;
    
    const date = dateInput.value;
    const all = this.getMetricStore();
    let added = false;
    
    group.series.forEach(series => {
      const input = document.getElementById(`metric-group-val-${group.id}-${series.id}`);
      if (!input || input.value === '') return;
      const entries = all[series.id] || [];
      entries.push({ date, value: parseFloat(input.value) });
      entries.sort((a, b) => a.date.localeCompare(b.date));
      all[series.id] = entries;
      input.value = '';
      added = true;
    });
    
    if (!added) return;
    this.saveMetricStore(all);
    this.refreshMetricGroupDisplay(group.id);
  },

  drawMetricGroupChart(groupId) {
    const found = this.getMetricGroupDefinition(groupId);
    const chart = document.getElementById(`chart-group-${groupId}`);
    if (!found || !chart) return;
    chart.innerHTML = this.renderMetricGroupChart(found.group);
  },

  formatMetricNumber(value) {
    if (!Number.isFinite(Number(value))) return '0';
    const rounded = Math.round(Number(value) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  },

  metricUnitLabel(metric, value) {
    const unit = metric.unit || 'count';
    if (Number(value) !== 1) return unit;
    if (unit.endsWith('ies')) return `${unit.slice(0, -3)}y`;
    if (unit.endsWith('s')) return unit.slice(0, -1);
    return unit;
  },

  formatMetricValue(metric, value) {
    return `${this.formatMetricNumber(value)} ${this.metricUnitLabel(metric, value)}`;
  },

  metricPeriodLabel(metricOrGroup) {
    return metricOrGroup?.period === 'day' ? 'Day' : 'Week';
  },

  metricTargetText(metric) {
    if (metric.goal !== null && metric.goal !== undefined) {
      return `Goal: ${metric.direction === 'lower' ? 'under' : 'at least'} ${this.formatMetricValue(metric, metric.goal)}`;
    }
    if (metric.direction === 'neutral') {
      return `Track ${this.metricPeriodLabel(metric).toLowerCase()} count`;
    }
    return `Track weekly volume (${metric.direction} is better)`;
  },

  metricLatestText(metric, entries) {
    if (!entries.length) return 'No entries yet';
    const latest = entries[entries.length - 1];
    return this.formatMetricValue(metric, latest.value);
  },

  metricStatus(metric, entries) {
    if (!entries.length) return { label: 'Awaiting first entry', tone: 'neutral' };
    if (metric.goal === null || metric.goal === undefined) {
      return { label: metric.direction === 'neutral' ? 'Tracking count' : 'Tracking volume', tone: 'neutral' };
    }

    const latest = entries[entries.length - 1].value;
    const meetsGoal = metric.direction === 'lower' ? latest < metric.goal : latest >= metric.goal;
    if (meetsGoal) return { label: 'Meets goal', tone: 'good' };
    return { label: metric.direction === 'lower' ? 'Above goal' : 'Below goal', tone: 'warn' };
  },

  metricTrend(metric, entries) {
    if (entries.length < 2) return { label: 'Need 2 entries for trend', tone: 'neutral' };
    const previous = entries[entries.length - 2].value;
    const latest = entries[entries.length - 1].value;
    const delta = Math.round((latest - previous) * 10) / 10;
    if (delta === 0) return { label: 'Stable from last entry', tone: 'neutral' };

    if (metric.direction === 'neutral') {
      return {
        label: `${delta > 0 ? 'Up' : 'Down'} ${this.formatMetricValue(metric, Math.abs(delta))}`,
        tone: 'neutral'
      };
    }

    const improving = metric.direction === 'lower' ? delta < 0 : delta > 0;
    const directionLabel = delta > 0 ? 'up' : 'down';
    return {
      label: `${improving ? 'Improving' : 'Watch'}: ${directionLabel} ${this.formatMetricValue(metric, Math.abs(delta))}`,
      tone: improving ? 'good' : 'warn'
    };
  },

  renderMetricBadge(text, tone) {
    return `<span class="metric-badge ${tone}">${this.escapeHtml(text)}</span>`;
  },

  renderMetricChart(metric, entries, options = {}) {
    const variant = options.variant || 'mini';
    const isExpanded = variant === 'expanded';
    const width = isExpanded ? 760 : 320;
    const height = isExpanded ? 280 : 150;
    const pad = isExpanded ? 34 : 18;
    const safeName = this.escapeHtml(metric.name);

    if (!entries.length) {
      return `
        <div class="metric-chart-empty ${isExpanded ? 'expanded' : ''}">
          <strong>No data entered</strong>
          <span>Add ${this.metricPeriodLabel(metric).toLowerCase()} values to begin the trend line.</span>
        </div>`;
    }

    if (entries.length === 1) {
      const entry = entries[0];
      return `
        <div class="metric-chart-empty ${isExpanded ? 'expanded' : ''}">
          <strong>1 entry saved</strong>
          <span>${this.escapeHtml(entry.date)} • ${this.escapeHtml(this.formatMetricValue(metric, entry.value))}</span>
          <span>Add one more entry to draw the line.</span>
        </div>`;
    }

    const values = entries.map(e => Number(e.value));
    const scaleValues = metric.goal !== null && metric.goal !== undefined ? [...values, Number(metric.goal)] : values;
    const rawMin = Math.min(...scaleValues);
    const rawMax = Math.max(...scaleValues);
    const span = Math.max(rawMax - rawMin, Math.abs(rawMax || 1) * 0.1, 1);
    const min = rawMin >= 0 ? Math.max(0, rawMin - span * 0.14) : rawMin - span * 0.14;
    const max = rawMax + span * 0.14;
    const xStep = (width - pad * 2) / (entries.length - 1);
    const yFor = value => height - pad - ((Number(value) - min) / (max - min)) * (height - pad * 2);
    const points = entries.map((entry, index) => ({
      x: pad + index * xStep,
      y: yFor(entry.value),
      entry
    }));
    const pointString = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const gridLines = isExpanded ? [0.25, 0.5, 0.75].map(ratio => {
      const y = pad + ratio * (height - pad * 2);
      return `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${width - pad}" y2="${y.toFixed(1)}" class="metric-chart-gridline"/>`;
    }).join('') : '';
    const goalLine = metric.goal !== null && metric.goal !== undefined ? (() => {
      const y = yFor(metric.goal);
      return `
        <line x1="${pad}" y1="${y.toFixed(1)}" x2="${width - pad}" y2="${y.toFixed(1)}" class="metric-chart-goal"/>
        ${isExpanded ? `<text x="${width - pad}" y="${Math.max(14, y - 8).toFixed(1)}" text-anchor="end" class="metric-chart-goal-label">Goal ${this.escapeHtml(this.formatMetricValue(metric, metric.goal))}</text>` : ''}
      `;
    })() : '';
    const circles = points.map(p => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isExpanded ? 4.5 : 3.5}" class="metric-chart-point"></circle>
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12" fill="transparent" style="cursor: pointer;"
        onmouseenter="App.showTooltip(event, '${this.escapeHtml(p.entry.date)}', '${this.escapeHtml(this.formatMetricValue(metric, p.entry.value))}')"
        onmouseleave="App.hideTooltip()"
        onmousemove="App.showTooltip(event, '${this.escapeHtml(p.entry.date)}', '${this.escapeHtml(this.formatMetricValue(metric, p.entry.value))}')">
      </circle>
    `).join('');

    return `
      <svg class="metric-line-chart ${isExpanded ? 'expanded' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeName} trend chart" preserveAspectRatio="none">
        ${gridLines}
        ${goalLine}
        <polyline points="${pointString}" class="metric-chart-line"/>
        ${circles}
      </svg>
      <div class="metric-chart-dates">
        <span>${this.escapeHtml(entries[0].date)}</span>
        <span>${this.escapeHtml(entries[entries.length - 1].date)}</span>
      </div>`;
  },

  metricGroupSeriesData(group) {
    return group.series.map(series => ({
      ...series,
      entries: this.getMetricEntries(series.id)
    }));
  },

  metricGroupEntryCount(group) {
    return this.metricGroupSeriesData(group).reduce((sum, series) => sum + series.entries.length, 0);
  },

  metricGroupDates(group) {
    const dates = new Set();
    this.metricGroupSeriesData(group).forEach(series => {
      series.entries.forEach(entry => dates.add(entry.date));
    });
    return Array.from(dates).sort((a, b) => a.localeCompare(b));
  },

  metricGroupLatestDate(group) {
    const dates = this.metricGroupDates(group);
    return dates.length ? dates[dates.length - 1] : null;
  },

  metricSeriesLatest(series) {
    const entries = this.getMetricEntries(series.id);
    return entries.length ? entries[entries.length - 1] : null;
  },

  renderMetricGroupLegend(group) {
    return `
      <div class="metric-legend" aria-label="${this.escapeHtml(group.name)} legend">
        ${group.series.map(series => {
          const latest = this.metricSeriesLatest(series);
          return `
            <div class="metric-legend-item">
              <span class="metric-color-dot" style="background:${series.color};"></span>
              <span class="metric-legend-name">${this.escapeHtml(series.name)}</span>
              <strong>${latest ? this.escapeHtml(this.formatMetricValue(series, latest.value)) : 'No data'}</strong>
            </div>`;
        }).join('')}
      </div>`;
  },

  renderMetricGroupChart(group, options = {}) {
    const variant = options.variant || 'mini';
    const isExpanded = variant === 'expanded';
    const width = isExpanded ? 760 : 640;
    const height = isExpanded ? 280 : 190;
    const pad = isExpanded ? 34 : 22;
    const seriesData = this.metricGroupSeriesData(group);
    const dates = this.metricGroupDates(group);
    const allValues = seriesData.flatMap(series => series.entries.map(entry => Number(entry.value)));

    if (!allValues.length) {
      return `
        <div class="metric-chart-empty ${isExpanded ? 'expanded' : ''}">
          <strong>No data entered</strong>
          <span>Add ${this.metricPeriodLabel(group).toLowerCase()} values to begin the combined trend.</span>
        </div>`;
    }

    if (dates.length < 2) {
      return `
        <div class="metric-chart-empty ${isExpanded ? 'expanded' : ''}">
          <strong>${allValues.length} ${allValues.length === 1 ? 'value' : 'values'} saved</strong>
          <span>${this.escapeHtml(dates[0])}</span>
          <span>Add another ${this.metricPeriodLabel(group).toLowerCase()} to draw the combined lines.</span>
        </div>`;
    }

    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues, 1);
    const span = Math.max(rawMax - rawMin, Math.abs(rawMax || 1) * 0.1, 1);
    const min = Math.max(0, rawMin - span * 0.14);
    const max = rawMax + span * 0.14;
    const xStep = (width - pad * 2) / (dates.length - 1);
    const xForDate = date => pad + dates.indexOf(date) * xStep;
    const yFor = value => height - pad - ((Number(value) - min) / (max - min)) * (height - pad * 2);
    const gridLines = [0.25, 0.5, 0.75].map(ratio => {
      const y = pad + ratio * (height - pad * 2);
      return `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${width - pad}" y2="${y.toFixed(1)}" class="metric-chart-gridline"/>`;
    }).join('');

    const seriesSvg = seriesData.map(series => {
      const points = series.entries.map(entry => ({
        x: xForDate(entry.date),
        y: yFor(entry.value),
        entry
      }));
      const line = points.length > 1 ? `
        <polyline points="${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" class="metric-chart-line" style="stroke:${series.color};"/>
      ` : '';
      const circles = points.map(point => `
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${isExpanded ? 4.5 : 3.5}" class="metric-chart-point" style="fill:${series.color};"></circle>
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="12" fill="transparent" style="cursor: pointer;"
          onmouseenter="App.showTooltip(event, '${this.escapeHtml(series.name)} • ${this.escapeHtml(point.entry.date)}', '${this.escapeHtml(this.formatMetricValue(series, point.entry.value))}')"
          onmouseleave="App.hideTooltip()"
          onmousemove="App.showTooltip(event, '${this.escapeHtml(series.name)} • ${this.escapeHtml(point.entry.date)}', '${this.escapeHtml(this.formatMetricValue(series, point.entry.value))}')">
        </circle>
      `).join('');
      return `${line}${circles}`;
    }).join('');

    return `
      <svg class="metric-line-chart metric-multi-line-chart ${isExpanded ? 'expanded' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${this.escapeHtml(group.name)} combined trend chart" preserveAspectRatio="none">
        ${gridLines}
        ${seriesSvg}
      </svg>
      <div class="metric-chart-dates">
        <span>${this.escapeHtml(dates[0])}</span>
        <span>${this.escapeHtml(dates[dates.length - 1])}</span>
      </div>`;
  },

  updateMetricTable(metricId, entries) {
    const summary = document.getElementById(`metric-summary-${metricId}`);
    if (summary) summary.textContent = `Data log (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})`;
    
    const tbody = document.getElementById(`metric-tbody-${metricId}`);
    if (!tbody) return;
    const metric = this.getMetricDefinition(metricId);
    tbody.innerHTML = this.renderMetricRows(metric, entries);
  },

  deleteLastMetricEntry(metricId) {
    const all = this.getMetricStore();
    const entries = all[metricId] || [];
    if (entries.length === 0) return;
    entries.pop();
    all[metricId] = entries;
    this.saveMetricStore(all);
    this.refreshMetricDisplay(metricId);
  },

  deleteMetricEntry(metricId, entryIndex) {
    const all = this.getMetricStore();
    const entries = all[metricId] || [];
    const entry = entries[entryIndex];
    if (!entry) return;
    const metric = this.getMetricDefinition(metricId);
    const metricName = metric ? metric.name : 'this metric';
    
    this.confirmAction(`Delete the ${entry.date} entry for ${metricName}?`, () => {
      entries.splice(entryIndex, 1);
      all[metricId] = entries;
      this.saveMetricStore(all);
      this.refreshMetricDisplay(metricId);
    });
  },

  deleteMetricGroupEntry(groupId, seriesId, entryIndex) {
    const found = this.getMetricGroupDefinition(groupId);
    if (!found) return;
    const series = found.group.series.find(s => s.id === seriesId);
    if (!series) return;

    const all = this.getMetricStore();
    const entries = all[series.id] || [];
    const entry = entries[entryIndex];
    if (!entry) return;

    this.confirmAction(`Delete the ${entry.date} ${series.name} entry?`, () => {
      entries.splice(entryIndex, 1);
      all[series.id] = entries;
      this.saveMetricStore(all);
      this.refreshMetricGroupDisplay(groupId);
    });
  },

  refreshMetricDisplay(metricId) {
    const metric = this.getMetricDefinition(metricId);
    if (!metric) return;
    const entries = this.getMetricEntries(metricId);
    const status = this.metricStatus(metric, entries);
    const trend = this.metricTrend(metric, entries);

    const latestEl = document.getElementById(`metric-latest-${metricId}`);
    if (latestEl) latestEl.textContent = this.metricLatestText(metric, entries);

    const statusEl = document.getElementById(`metric-status-${metricId}`);
    if (statusEl) statusEl.innerHTML = this.renderMetricBadge(status.label, status.tone);

    const trendEl = document.getElementById(`metric-trend-${metricId}`);
    if (trendEl) trendEl.innerHTML = this.renderMetricBadge(trend.label, trend.tone);

    this.drawMiniChart(metricId);
    this.updateMetricTable(metricId, entries);
    this.updateExpandedMetric(metricId);
  },

  refreshMetricGroupDisplay(groupId) {
    const found = this.getMetricGroupDefinition(groupId);
    if (!found) return;
    const { group } = found;
    const count = this.metricGroupEntryCount(group);
    const latestDate = this.metricGroupLatestDate(group);

    const latestEl = document.getElementById(`metric-group-latest-${group.id}`);
    if (latestEl) latestEl.textContent = latestDate || 'No entries yet';

    const countEl = document.getElementById(`metric-group-count-${group.id}`);
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'value' : 'values'} saved`;

    const legendEl = document.getElementById(`metric-group-legend-${group.id}`);
    if (legendEl) legendEl.innerHTML = this.renderMetricGroupLegend(group);

    this.drawMetricGroupChart(group.id);

    const tbody = document.getElementById(`metric-group-tbody-${group.id}`);
    if (tbody) tbody.innerHTML = this.renderMetricGroupRows(group);

    const summary = document.getElementById(`metric-group-summary-${group.id}`);
    if (summary) summary.textContent = `Data log (${count} ${count === 1 ? 'value' : 'values'})`;

    this.updateExpandedMetricGroup(group.id);
  },

  toggleMetricExpand(metricId) {
    this.expandedMetricId = this.expandedMetricId === metricId ? null : metricId;
    this.expandedMetricGroupId = null;
    const serviceLine = FRAMEWORK.serviceLines.find(sl => sl.trackedMetrics?.some(m => m.id === metricId));
    if (!serviceLine) return;

    const panel = document.getElementById(`metrics-expanded-${serviceLine.id}`);
    if (panel) {
      panel.innerHTML = this.renderExpandedMetricContent(serviceLine);
    }

    this.updateMetricExpandButtons(serviceLine);

    if (this.expandedMetricId) {
      requestAnimationFrame(() => {
        const expanded = document.getElementById('metric-expanded-panel');
        expanded?.focus({ preventScroll: true });
        expanded?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  },

  toggleMetricGroupExpand(groupId) {
    this.expandedMetricGroupId = this.expandedMetricGroupId === groupId ? null : groupId;
    this.expandedMetricId = null;
    const found = this.getMetricGroupDefinition(groupId);
    if (!found) return;
    const { serviceLine } = found;

    const panel = document.getElementById(`metrics-expanded-${serviceLine.id}`);
    if (panel) {
      panel.innerHTML = this.renderExpandedMetricContent(serviceLine);
    }

    this.updateMetricExpandButtons(serviceLine);

    if (this.expandedMetricGroupId) {
      requestAnimationFrame(() => {
        const expanded = document.getElementById('metric-expanded-panel');
        expanded?.focus({ preventScroll: true });
        expanded?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  },

  updateMetricExpandButtons(serviceLine) {
    (serviceLine.trackedMetrics || []).forEach(metric => {
      const button = document.getElementById(`metric-expand-${metric.id}`);
      if (!button) return;
      const isOpen = this.expandedMetricId === metric.id;
      button.setAttribute('aria-expanded', String(isOpen));
      button.textContent = isOpen ? 'Collapse' : 'Expand';
    });

    (serviceLine.metricGroups || []).forEach(group => {
      const button = document.getElementById(`metric-group-expand-${group.id}`);
      if (!button) return;
      const isOpen = this.expandedMetricGroupId === group.id;
      button.setAttribute('aria-expanded', String(isOpen));
      button.textContent = isOpen ? 'Collapse' : 'Expand';
    });
  },

  updateExpandedMetric(metricId) {
    if (this.expandedMetricId !== metricId) return;
    const serviceLine = FRAMEWORK.serviceLines.find(sl => sl.trackedMetrics?.some(m => m.id === metricId));
    const panel = serviceLine ? document.getElementById(`metrics-expanded-${serviceLine.id}`) : null;
    if (panel) panel.innerHTML = this.renderExpandedMetricContent(serviceLine);
  },

  updateExpandedMetricGroup(groupId) {
    if (this.expandedMetricGroupId !== groupId) return;
    const found = this.getMetricGroupDefinition(groupId);
    const panel = found ? document.getElementById(`metrics-expanded-${found.serviceLine.id}`) : null;
    if (panel) panel.innerHTML = this.renderExpandedMetricContent(found.serviceLine);
  },

  renderMetricRows(metric, entries) {
    if (!metric || !entries.length) {
      return `<tr><td class="metric-log-empty" colspan="3">No entries yet.</td></tr>`;
    }

    return entries.map((entry, index) => ({ entry, index })).reverse().map(({ entry, index }) => `
      <tr>
        <td>${this.escapeHtml(entry.date)}</td>
        <td class="metric-log-value">${this.escapeHtml(this.formatMetricValue(metric, entry.value))}</td>
        <td class="metric-log-action">
          <button class="metric-delete-btn" type="button" onclick="App.deleteMetricEntry('${metric.id}', ${index})" aria-label="Delete ${this.escapeHtml(entry.date)} entry for ${this.escapeHtml(metric.name)}">Delete</button>
        </td>
      </tr>
    `).join('');
  },

  renderMetricCard(metric) {
    const entries = this.getMetricEntries(metric.id);
    const status = this.metricStatus(metric, entries);
    const trend = this.metricTrend(metric, entries);
    const isExpanded = this.expandedMetricId === metric.id;

    return `
      <article class="metric-card ${metric.featured ? 'featured' : ''}">
        <div class="metric-card-header">
          <div>
            <h3 class="metric-title">${this.escapeHtml(metric.name)}</h3>
            <p class="metric-target">${this.escapeHtml(this.metricTargetText(metric))}</p>
          </div>
          <button class="metric-expand-btn" id="metric-expand-${metric.id}" type="button" onclick="App.toggleMetricExpand('${metric.id}')" aria-expanded="${isExpanded}" aria-controls="metrics-expanded-panel">
            ${isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        <div class="metric-snapshot">
          <div>
            <span class="metric-label">Latest</span>
            <strong class="metric-latest" id="metric-latest-${metric.id}">${this.escapeHtml(this.metricLatestText(metric, entries))}</strong>
          </div>
          <div class="metric-badges">
            <span id="metric-status-${metric.id}">${this.renderMetricBadge(status.label, status.tone)}</span>
            <span id="metric-trend-${metric.id}">${this.renderMetricBadge(trend.label, trend.tone)}</span>
          </div>
        </div>

        <div class="metric-chart-shell" id="chart-${metric.id}">
          ${this.renderMetricChart(metric, entries)}
        </div>

        <form class="metric-entry-form" onsubmit="App.addMetricEntry('${metric.id}'); return false;">
          <label>
            <span>${this.escapeHtml(this.metricPeriodLabel(metric))}</span>
            <input type="date" id="metric-date-${metric.id}" value="${this.getLocalToday()}">
          </label>
          <label>
            <span>Value</span>
            <input type="number" step="any" id="metric-val-${metric.id}" placeholder="${this.escapeHtml(metric.unit)}">
          </label>
          <button type="submit">Add</button>
        </form>

        <details class="metric-log">
          <summary id="metric-summary-${metric.id}">View/Manage Entry History</summary>
          <div class="metric-log-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="metric-tbody-${metric.id}">
                ${this.renderMetricRows(metric, entries)}
              </tbody>
            </table>
          </div>
        </details>
      </article>`;
  },

  renderMetricGroupRows(group) {
    const rows = group.series.flatMap(series => {
      return this.getMetricEntries(series.id).map((entry, index) => ({ series, entry, index }));
    }).sort((a, b) => {
      const byDate = b.entry.date.localeCompare(a.entry.date);
      if (byDate !== 0) return byDate;
      return group.series.findIndex(s => s.id === a.series.id) - group.series.findIndex(s => s.id === b.series.id);
    });

    if (!rows.length) {
      return `<tr><td class="metric-log-empty" colspan="4">No entries yet.</td></tr>`;
    }

    return rows.map(({ series, entry, index }) => `
      <tr>
        <td>${this.escapeHtml(entry.date)}</td>
        <td>
          <span class="metric-series-name">
            <span class="metric-color-dot" style="background:${series.color};"></span>
            ${this.escapeHtml(series.name)}
          </span>
        </td>
        <td class="metric-log-value">${this.escapeHtml(this.formatMetricValue(series, entry.value))}</td>
        <td class="metric-log-action">
          <button class="metric-delete-btn" type="button" onclick="App.deleteMetricGroupEntry('${group.id}', '${series.id}', ${index})" aria-label="Delete ${this.escapeHtml(entry.date)} ${this.escapeHtml(series.name)} entry">Delete</button>
        </td>
      </tr>
    `).join('');
  },

  renderMetricGroupPanel(group) {
    const count = this.metricGroupEntryCount(group);
    const latestDate = this.metricGroupLatestDate(group);
    const isExpanded = this.expandedMetricGroupId === group.id;

    return `
      <article class="metric-group-panel">
        <div class="metric-card-header">
          <div>
            <h3 class="metric-title">${this.escapeHtml(group.name)}</h3>
            <p class="metric-target">${this.escapeHtml(group.description || `Track ${this.metricPeriodLabel(group).toLowerCase()} count`)}</p>
          </div>
          <button class="metric-expand-btn" id="metric-group-expand-${group.id}" type="button" onclick="App.toggleMetricGroupExpand('${group.id}')" aria-expanded="${isExpanded}" aria-controls="metrics-expanded-panel">
            ${isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        <div class="metric-group-snapshot">
          <div>
            <span class="metric-label">Latest ${this.escapeHtml(this.metricPeriodLabel(group))}</span>
            <strong class="metric-latest" id="metric-group-latest-${group.id}">${this.escapeHtml(latestDate || 'No entries yet')}</strong>
          </div>
          <span class="metric-badge neutral" id="metric-group-count-${group.id}">${count} ${count === 1 ? 'value' : 'values'} saved</span>
        </div>

        <div id="metric-group-legend-${group.id}">
          ${this.renderMetricGroupLegend(group)}
        </div>

        <div class="metric-chart-shell metric-group-chart-shell" id="chart-group-${group.id}">
          ${this.renderMetricGroupChart(group)}
        </div>

        <form class="metric-group-entry-form" onsubmit="App.addMetricGroupEntry('${group.id}'); return false;">
          <label class="metric-group-date">
            <span>${this.escapeHtml(this.metricPeriodLabel(group))}</span>
            <input type="date" id="metric-group-date-${group.id}" value="${this.getLocalToday()}">
          </label>
          <div class="metric-group-series-fields">
            ${group.series.map(series => `
              <label>
                <span>${this.escapeHtml(series.name)}</span>
                <input type="number" step="any" id="metric-group-val-${group.id}-${series.id}" placeholder="${this.escapeHtml(series.unit || group.unit)}">
              </label>
            `).join('')}
          </div>
          <button type="submit">Add</button>
        </form>

        <details class="metric-log metric-group-log">
          <summary id="metric-group-summary-${group.id}">Data log (${count} ${count === 1 ? 'value' : 'values'})</summary>
          <div class="metric-log-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Series</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="metric-group-tbody-${group.id}">
                ${this.renderMetricGroupRows(group)}
              </tbody>
            </table>
          </div>
        </details>
      </article>`;
  },

  renderExpandedMetricContent(sl) {
    if (this.expandedMetricGroupId) return this.renderExpandedMetricGroupPanel(sl);
    return this.renderExpandedMetricPanel(sl);
  },

  renderExpandedMetricPanel(sl) {
    if (!this.expandedMetricId) return '';
    const metric = sl.trackedMetrics.find(m => m.id === this.expandedMetricId);
    if (!metric) {
      this.expandedMetricId = null;
      return '';
    }

    const entries = this.getMetricEntries(metric.id);
    const status = this.metricStatus(metric, entries);
    const trend = this.metricTrend(metric, entries);

    return `
      <section class="metric-expanded-panel" id="metric-expanded-panel" tabindex="-1" aria-label="${this.escapeHtml(metric.name)} expanded metric view">
        <div class="metric-expanded-header">
          <div>
            <div class="metric-expanded-eyebrow">Expanded Trend</div>
            <h3>${this.escapeHtml(metric.name)}</h3>
            <p>${this.escapeHtml(this.metricTargetText(metric))}</p>
          </div>
          <button class="metric-expand-btn" type="button" onclick="App.toggleMetricExpand('${metric.id}')">Collapse</button>
        </div>

        <div class="metric-expanded-grid">
          <div class="metric-expanded-chart">
            ${this.renderMetricChart(metric, entries, { variant: 'expanded' })}
          </div>
          <aside class="metric-expanded-summary">
            <div>
              <span class="metric-label">Latest</span>
              <strong>${this.escapeHtml(this.metricLatestText(metric, entries))}</strong>
            </div>
            ${this.renderMetricBadge(status.label, status.tone)}
            ${this.renderMetricBadge(trend.label, trend.tone)}
            <span class="metric-expanded-count">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} saved</span>
          </aside>
        </div>

        <div class="metric-expanded-log">
          <div class="metric-expanded-log-title">Entry History</div>
          <div class="metric-log-table-wrap expanded">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderMetricRows(metric, entries)}
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
  },

  renderExpandedMetricGroupPanel(sl) {
    if (!this.expandedMetricGroupId) return '';
    const group = sl.metricGroups?.find(g => g.id === this.expandedMetricGroupId);
    if (!group) {
      this.expandedMetricGroupId = null;
      return '';
    }

    const count = this.metricGroupEntryCount(group);
    const latestDate = this.metricGroupLatestDate(group);

    return `
      <section class="metric-expanded-panel" id="metric-expanded-panel" tabindex="-1" aria-label="${this.escapeHtml(group.name)} expanded metric view">
        <div class="metric-expanded-header">
          <div>
            <div class="metric-expanded-eyebrow">Expanded Combined Trend</div>
            <h3>${this.escapeHtml(group.name)}</h3>
            <p>${this.escapeHtml(group.description || `Track ${this.metricPeriodLabel(group).toLowerCase()} count`)}</p>
          </div>
          <button class="metric-expand-btn" type="button" onclick="App.toggleMetricGroupExpand('${group.id}')">Collapse</button>
        </div>

        <div class="metric-expanded-grid">
          <div class="metric-expanded-chart">
            ${this.renderMetricGroupChart(group, { variant: 'expanded' })}
          </div>
          <aside class="metric-expanded-summary">
            <div>
              <span class="metric-label">Latest ${this.escapeHtml(this.metricPeriodLabel(group))}</span>
              <strong>${this.escapeHtml(latestDate || 'No entries yet')}</strong>
            </div>
            <span class="metric-badge neutral">${count} ${count === 1 ? 'value' : 'values'} saved</span>
            ${this.renderMetricGroupLegend(group)}
          </aside>
        </div>

        <div class="metric-expanded-log">
          <div class="metric-expanded-log-title">Entry History</div>
          <div class="metric-log-table-wrap expanded">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Series</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderMetricGroupRows(group)}
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
  },

  // ===== HEDIS CUSTOM KPIs & NOTES =====
  getHedisData(slId) {
    return Sync.getHedisData(slId);
  },

  saveHedisData(slId, update) {
    Sync.saveHedisData(slId, update);
  },

  findServiceLine(slId) {
    return FRAMEWORK.serviceLines.find(sl => sl.id === slId);
  },

  refreshHedisSection(slId) {
    const section = document.getElementById(`hedis-section-${slId}`);
    const sl = this.findServiceLine(slId);
    if (!section || !sl) {
      this.route();
      return;
    }

    const wasOpen = document.getElementById(`hedis-${slId}`)?.classList.contains('open');
    section.outerHTML = this.renderHedisDropdown(sl);
    if (wasOpen) {
      const content = document.getElementById(`hedis-${slId}`);
      content?.classList.add('open');
      content?.previousElementSibling?.classList.add('open');
    }
  },

  toggleHedisKpi(slId, index) {
    const data = this.getHedisData(slId);
    const kpis = data.kpis;
    kpis[index] = !kpis[index];
    this.saveHedisData(slId, { kpis });

    const row = document.getElementById(`hedis-kpi-${slId}-${index}`);
    const cb = row?.querySelector('.kpi-checkbox');
    const lb = row?.querySelector('.kpi-label');
    if (row) {
      row.classList.toggle('checked', kpis[index]);
      cb?.classList.toggle('checked', kpis[index]);
      lb?.classList.toggle('checked', kpis[index]);
      if (cb) cb.textContent = kpis[index] ? '✓' : '';
    }
  },

  addHedisCustomKpi(slId) {
    const input = document.getElementById(`new-hedis-kpi-${slId}`);
    if (!input || !input.value.trim()) return;
    const data = this.getHedisData(slId);
    const customKpis = Array.isArray(data.customKpis) ? [...data.customKpis] : [];
    customKpis.push(input.value.trim());
    this.saveHedisData(slId, { customKpis });
    input.value = '';
    this.refreshHedisSection(slId);
  },

  deleteHedisCustomKpi(slId, index) {
    const data = this.getHedisData(slId);
    const customKpis = Array.isArray(data.customKpis) ? [...data.customKpis] : [];
    customKpis.splice(index, 1);
    const kpis = this.reindexCustomKpiChecks(data.kpis || {}, index);
    this.saveHedisData(slId, { customKpis, kpis });
    this.refreshHedisSection(slId);
  },

  saveHedisNotes(slId) {
    const textarea = document.getElementById(`hedis-notes-${slId}`);
    if (textarea) {
      this.saveHedisData(slId, { notes: textarea.value });
      const indicator = document.getElementById(`hedis-notes-saved-${slId}`);
      if (indicator) {
        indicator.classList.add('show');
        setTimeout(() => indicator.classList.remove('show'), 1500);
      }
    }
  },

  renderTrackedMetrics(sl) {
    const metrics = sl.trackedMetrics || [];
    const featured = metrics.filter(metric => metric.featured);
    const standard = metrics.filter(metric => !metric.featured);
    const groups = sl.metricGroups || [];
    const trackerLabel = groups.some(group => group.period === 'day') ? 'Daily Tracked Metrics' : 'Weekly Tracked Metrics';
    const trackerDescription = sl.id === 'pcsl'
      ? 'Track access, care model volume, and virtual care trends by week. Expand a graph for detail or delete an accidental entry from the data log.'
      : `Track ${sl.abbr || sl.name} performance trends. Featured totals stay above combined breakdown graphs, and each accidental value can be deleted from the data log.`;

    return `
      <section class="metrics-section" aria-label="${this.escapeHtml(sl.name)} ${this.escapeHtml(trackerLabel.toLowerCase())}">
        <div class="metrics-header">
          <div>
            <div class="metrics-eyebrow">${this.escapeHtml(trackerLabel)}</div>
            <h2>${this.escapeHtml(sl.abbr || sl.name)} Performance Trackers</h2>
          </div>
          <p>${this.escapeHtml(trackerDescription)}</p>
        </div>
        ${featured.length ? `
          <div class="metrics-featured-grid">
            ${featured.map(m => this.renderMetricCard(m)).join('')}
          </div>
        ` : ''}
        <div class="metrics-grid">
          ${standard.map(m => this.renderMetricCard(m)).join('')}
        </div>
        ${groups.map(group => this.renderMetricGroupPanel(group)).join('')}
        <div class="metrics-expanded-slot" id="metrics-expanded-${sl.id}">
          ${this.renderExpandedMetricContent(sl)}
        </div>
      </section>`;
  },

  // ===== WEEKLY DIALOGUE (running log) =====
  getDialogueEntries(slId) {
    return Sync.getDialogueEntries(slId);
  },

  addDialogueEntry(slId) {
    const ta = document.getElementById(`dialogue-text-${slId}`);
    if (!ta || !ta.value.trim()) return;
    const entries = this.getDialogueEntries(slId);
    entries.unshift({
      date: this.getLocalToday(),
      text: ta.value.trim()
    });
    Sync.saveDialogueEntries(slId, entries);
    ta.value = '';
    this.updateDialogueList(slId, entries);
  },

  deleteDialogueEntry(slId, index) {
    const entries = this.getDialogueEntries(slId);
    entries.splice(index, 1);
    Sync.saveDialogueEntries(slId, entries);
    this.updateDialogueList(slId, entries);
  },

  editDialogueEntry(slId, index) {
    const entries = this.getDialogueEntries(slId);
    const entry = entries[index];
    if (!entry) return;
    
    const container = document.getElementById(`dialogue-entry-${slId}-${index}`);
    if (!container) return;
    
    container.innerHTML = `
      <div class="dialogue-entry-date">Editing: ${this.escapeHtml(entry.date)}</div>
      <textarea id="edit-dialogue-${slId}-${index}" class="dialogue-textarea dialogue-edit-textarea">${this.escapeHtml(entry.text)}</textarea>
      <div class="dialogue-edit-actions">
        <button type="button" class="dialogue-secondary-btn" onclick="App.updateDialogueList('${slId}', App.getDialogueEntries('${slId}'))">Cancel</button>
        <button type="button" class="dialogue-add-btn" onclick="App.saveDialogueEntry('${slId}', ${index})">Save Changes</button>
      </div>
    `;
  },

  saveDialogueEntry(slId, index) {
    const ta = document.getElementById(`edit-dialogue-${slId}-${index}`);
    if (!ta) return;
    const val = ta.value.trim();
    if (!val) {
      this.deleteDialogueEntry(slId, index);
      return;
    }
    const entries = this.getDialogueEntries(slId);
    if (entries[index]) {
      entries[index].text = val;
      Sync.saveDialogueEntries(slId, entries);
    }
    this.updateDialogueList(slId, entries);
  },

  updateDialogueList(slId, entries) {
    const list = document.getElementById(`dialogue-list-${slId}`);
    if (!list) return;
    const countText = `${entries.length} saved ${entries.length === 1 ? 'entry' : 'entries'}`;
    const count = document.getElementById(`dialogue-count-${slId}`);
    const historyCount = document.getElementById(`dialogue-history-count-${slId}`);
    if (count) count.textContent = countText;
    if (historyCount) historyCount.textContent = countText;
    list.innerHTML = this.renderDialogueEntries(slId, entries);
  },

  renderDialogueEntries(slId, entries) {
    if (entries.length === 0) {
      return "<div class=\"dialogue-empty\">No previous entries yet. Add today's update above.</div>";
    }
    return entries.map((e, i) => `
      <div id="dialogue-entry-${slId}-${i}" class="dialogue-entry">
        <div class="dialogue-entry-date">${this.escapeHtml(e.date)}</div>
        <div class="dialogue-entry-text">${this.escapeHtml(e.text)}</div>
        <div class="dialogue-entry-actions">
          <button type="button" class="dialogue-icon-btn" onclick="App.editDialogueEntry('${slId}', ${i})" title="Edit entry">Edit</button>
          <button type="button" class="dialogue-icon-btn" onclick="App.deleteDialogueEntry('${slId}', ${i})" title="Delete entry">Delete</button>
        </div>
      </div>
    `).join('');
  },

  renderWeeklyDialogue(sl) {
    const entries = this.getDialogueEntries(sl.id);
    const today = this.getLocalToday();
    const countText = `${entries.length} saved ${entries.length === 1 ? 'entry' : 'entries'}`;
    return `
      <details class="service-section dialogue-section top-dialogue-section" open>
        <summary class="service-section-summary">
          <span class="service-section-kicker">Today's Dialogue</span>
          <span class="phase-section-title">Weekly Dialogue & Issues</span>
          <span class="service-section-meta" id="dialogue-count-${sl.id}">${countText}</span>
        </summary>
        <div class="service-section-body">
          <div class="dialogue-entry-panel">
            <div class="dialogue-entry-header">
              <div>
                <span class="dialogue-today-label">Today's update</span>
                <strong>${today}</strong>
              </div>
              <span class="dialogue-hint">Saved to this service-line log</span>
            </div>
            <textarea id="dialogue-text-${sl.id}" class="dialogue-textarea" placeholder="Current efforts, roadblocks, decisions, or issues for this week's sync..."></textarea>
            <div class="dialogue-actions">
              <button type="button" class="dialogue-add-btn" onclick="App.addDialogueEntry('${sl.id}')">Save Today's Dialogue</button>
            </div>
          </div>

          <details class="dialogue-history">
            <summary>
              <span>Previous dialogue entries</span>
              <span id="dialogue-history-count-${sl.id}">${countText}</span>
            </summary>
            <div id="dialogue-list-${sl.id}" class="dialogue-list">
              ${this.renderDialogueEntries(sl.id, entries)}
            </div>
          </details>
        </div>
      </details>
    `;
  },

  renderHedisDropdown(sl) {
    if (!sl.hedisMetrics) return '';
    const hedisData = this.getHedisData(sl.id);
    const kpiChecks = hedisData.kpis || {};
    const customKpis = hedisData.customKpis || [];
    const notes = hedisData.notes || '';

    return `
      <div style="margin-bottom:2rem;" class="dropdown-section" id="hedis-section-${sl.id}">
        <button class="dropdown-trigger intro-trigger" onclick="App.toggleDropdown('hedis-${sl.id}')">
          <span style="font-weight:700;">HEDIS Metrics Reference — Goal ≥90%</span>
          <span><span class="dropdown-chevron">›</span></span>
        </button>
        <div class="dropdown-content" id="hedis-${sl.id}">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;">
            ${sl.hedisMetrics.map(h => `
              <div style="padding:10px 12px;background:var(--bg-glass);border:1px solid var(--border-subtle);border-radius:8px;">
                <div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:2px;">${h.name}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">Ages ${h.ages} • Goal: ${h.goal}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;">${h.description}</div>
              </div>
            `).join('')}
          </div>
          
          <hr style="border:none;border-top:1px solid var(--border-subtle);margin:1.5rem 0;">
          
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.5rem;">
            <!-- Custom KPIs -->
            <div>
              <div style="font-size:0.8rem;font-weight:700;color:var(--gold);margin-bottom:12px;letter-spacing:1px;text-transform:uppercase;">HEDIS Action Items</div>
              <div style="margin-bottom:8px;">
                ${customKpis.map((k, i) => {
                  const idx = `custom-${i}`;
                  const checked = !!kpiChecks[idx];
                  return `
                    <div class="kpi-interactive custom-kpi ${checked ? 'checked' : ''}" id="hedis-kpi-${sl.id}-${idx}" onclick="App.toggleHedisKpi('${sl.id}', '${idx}')">
                      <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                      <div class="kpi-label ${checked ? 'checked' : ''}">${this.escapeHtml(k)}</div>
                      <button class="kpi-action-btn danger" type="button" onclick="event.stopPropagation(); App.deleteHedisCustomKpi('${sl.id}', ${i})" title="Delete custom HEDIS action item permanently">Delete</button>
                    </div>`;
                }).join('')}
              </div>
              <form class="kpi-add-form" onsubmit="App.addHedisCustomKpi('${sl.id}'); return false;">
                <input type="text" id="new-hedis-kpi-${sl.id}" placeholder="+ Type a new action item...">
                <button type="submit">Add</button>
              </form>
            </div>
            
            <!-- Notes Scratchpad -->
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="font-size:0.8rem;font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase;">HEDIS Meeting Notes</div>
                <div id="hedis-notes-saved-${sl.id}" style="font-size:0.7rem;color:var(--army-green);opacity:0;transition:opacity 0.3s;">Saved ✓</div>
              </div>
              <textarea id="hedis-notes-${sl.id}" onblur="App.saveHedisNotes('${sl.id}')" placeholder="Type meeting notes here... (auto-saves when you click away)" style="width:100%;min-height:150px;padding:12px;background:rgba(0,0,0,0.2);border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-primary);font-size:0.85rem;font-family:inherit;resize:vertical;line-height:1.6;">${notes}</textarea>
            </div>
          </div>
        </div>
      </div>`;
  },

  renderTraineeCareFlow(sl) {
    if (!sl.traineeCareFlow) return '';
    return `
      <div style="margin-bottom:2rem;">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:1rem;">Trainee Care Pipeline</div>
        <div class="care-flow">
          ${sl.traineeCareFlow.map((step, i) => `
            ${i > 0 ? '<div class="care-flow-arrow">→</div>' : ''}
            <div class="care-flow-step">
              <div class="care-flow-step-num">${step.step}</div>
              <div class="care-flow-step-name">${step.name}</div>
              <div class="care-flow-step-desc">${step.description}</div>
              <div style="margin-top:6px;font-size:0.7rem;color:var(--gold);">${step.capacity}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  },

  // ===== MEETING MODE (Weekly Sync) =====
  toggleMeetingMode() {
    this.togglingMode = true;
    // If presentation mode is active, exit it first
    if (this.isPresentationMode) {
      this.isPresentationMode = false;
      document.body.classList.remove('presentation-mode-active');
      const presBtn = document.getElementById('btn-presentation-mode');
      if (presBtn) presBtn.classList.remove('active');
      this.teardownPresentationListeners();
    }

    this.isMeetingMode = !this.isMeetingMode;
    const body = document.body;
    const btn = document.getElementById('btn-meeting-mode');
    
    if (this.isMeetingMode) {
      const hash = location.hash.slice(1) || '/';
      const parts = hash.split('/').filter(Boolean);
      const isFrameworkRoute = parts[0] === 'framework';
      const serviceLineId = isFrameworkRoute ? parts[1] : null;
      
      if (serviceLineId && FRAMEWORK.serviceLines.some(s => s.id === serviceLineId)) {
        this.meetingActiveServiceLineId = serviceLineId;
      } else if (!this.meetingActiveServiceLineId && FRAMEWORK.serviceLines.length > 0) {
        this.meetingActiveServiceLineId = FRAMEWORK.serviceLines[0].id;
      }
      body.classList.add('meeting-mode-active');
      if (btn) btn.classList.add('active');
    } else {
      body.classList.remove('meeting-mode-active');
      if (btn) btn.classList.remove('active');
    }
    
    this.route();
  },

  renderMeetingMode(el) {
    const activeId = this.meetingActiveServiceLineId || (FRAMEWORK.serviceLines[0] && FRAMEWORK.serviceLines[0].id);
    const activeSL = FRAMEWORK.serviceLines.find(s => s.id === activeId) || FRAMEWORK.serviceLines[0];
    
    el.innerHTML = `
      <div class="meeting-container">
        <div class="meeting-sidebar">
          <div class="meeting-sidebar-header">
            <div class="meeting-sidebar-subtitle">Command View</div>
            <h3>Weekly Sync</h3>
          </div>
          <div class="meeting-sl-list">
            ${FRAMEWORK.serviceLines.map(sl => {
              const isActive = sl.id === activeId;
              return `
                <a class="meeting-sl-link ${isActive ? 'active' : ''}" data-sl-id="${sl.id}" href="javascript:void(0)" onclick="App.setMeetingActiveServiceLine('${sl.id}')">
                  <div class="meeting-sl-link-header">
                    <span class="meeting-sl-name">${this.escapeHtml(sl.name)}</span>
                    <span class="meeting-sl-meta">${this.escapeHtml(sl.abbr || '')}</span>
                  </div>
                  <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom: 4px;">${this.escapeHtml(sl.leader)}</div>
                  ${this.getMeetingStatusRowHtml(sl)}
                </a>
              `;
            }).join('')}
          </div>
        </div>
        <div class="meeting-focus-panel" id="meeting-focus-panel">
          <!-- Focus panel content populated dynamically -->
        </div>
      </div>
    `;
    
    if (activeSL) {
      this.renderMeetingFocusPanel(activeSL);
    }
  },

  getMeetingStatusRowHtml(sl) {
    const dots = [];
    
    // Single metrics
    if (sl.trackedMetrics) {
      sl.trackedMetrics.forEach(m => {
        const entries = this.getMetricEntries(m.id);
        const status = this.metricStatus(m, entries);
        dots.push(`<span class="meeting-status-dot ${status.tone}" title="${this.escapeHtml(m.name)}: ${status.label}"></span>`);
      });
    }
    
    // Group metrics
    if (sl.metricGroups) {
      sl.metricGroups.forEach(g => {
        g.series.forEach(s => {
          const entries = this.getMetricEntries(s.id);
          const status = this.metricStatus(s, entries);
          dots.push(`<span class="meeting-status-dot ${status.tone}" title="${this.escapeHtml(s.name)}: ${status.label}"></span>`);
        });
      });
    }

    const dialogueEntries = this.getDialogueEntries(sl.id);
    let dialogueBadgeHtml = '';
    if (dialogueEntries.length > 0) {
      dialogueBadgeHtml = `
        <span class="dialogue-indicator-badge" style="font-size:0.7rem; color:var(--gold); display:flex; align-items:center; gap:2px;" title="${dialogueEntries.length} dialogue entries">
          💬 ${dialogueEntries.length}
        </span>
      `;
    }
    
    return `
      <div class="meeting-sl-status-row">
        <div style="display: flex; gap: 4px; align-items: center;">
          ${dots.join('')}
        </div>
        ${dialogueBadgeHtml}
      </div>
    `;
  },

  setMeetingActiveServiceLine(slId) {
    this.meetingActiveServiceLineId = slId;
    const sl = FRAMEWORK.serviceLines.find(s => s.id === slId);
    if (sl) {
      const listContainer = document.querySelector('.meeting-sl-list');
      if (listContainer) {
        const links = listContainer.querySelectorAll('.meeting-sl-link');
        links.forEach(link => {
          if (link.getAttribute('data-sl-id') === slId) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
      this.renderMeetingFocusPanel(sl);
    }
  },

  renderMeetingFocusPanel(sl) {
    const container = document.getElementById('meeting-focus-panel');
    if (!container) return;
    
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid var(--border-subtle); padding-bottom:1rem;">
        <div>
          <h2 style="font-family:var(--font-display); font-size:1.5rem; color:var(--gold); margin:0; text-transform:uppercase;">${this.escapeHtml(sl.name)} Sync</h2>
          <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 0 0;">${this.escapeHtml(this.serviceLineFunction(sl))}</p>
        </div>
        <div style="text-align:right; display:flex; align-items:center; gap:12px;">
          <button type="button" class="meeting-brief-btn" onclick="event.stopPropagation(); window.App.generateAIPanelBrief('${sl.id}')">
            ⚡ AI Brief
          </button>
          <div>
            <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary);">${this.escapeHtml(sl.leader)}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${this.escapeHtml(sl.role || 'Service Line Leader')}</div>
          </div>
        </div>
      </div>
      
      <div class="meeting-focus-grid">
        <div class="meeting-focus-top-row">
          ${this.renderMeetingDialogueCard(sl)}
          ${this.renderMeetingMetricQuickEntryCard(sl)}
        </div>
        <div class="meeting-focus-bottom-row">
          ${this.renderMeetingTasksCard(sl)}
        </div>
      </div>
    `;
  },

  renderMeetingDialogueCard(sl) {
    const entries = this.getDialogueEntries(sl.id);
    const today = this.getLocalToday();
    
    return `
      <div class="meeting-card">
        <div class="meeting-card-header">
          <span>Weekly Dialogue & Issues</span>
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;" id="meeting-dialogue-count-${sl.id}">${entries.length} entries</span>
        </div>
        
        <div class="dialogue-entry-panel" style="margin-bottom:1.5rem; background:rgba(0,0,0,0.15); border:1px solid var(--border-subtle); padding:12px; border-radius:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:0.75rem;">
            <strong style="color:var(--text-primary); font-family:var(--font-display);">${today} Update</strong>
            <span style="color:var(--text-muted);">Autosaves on add</span>
          </div>
          <textarea id="meeting-dialogue-text-${sl.id}" class="dialogue-textarea" style="width:100%; min-height:80px; margin-bottom:8px; font-size:0.8rem; background:rgba(0,0,0,0.25); border:1px solid var(--border-subtle); border-radius:4px; padding:8px;" placeholder="Current efforts, roadblocks, decisions, or issues for this week's sync..."></textarea>
          <div style="display:flex; justify-content:flex-end;">
            <button type="button" class="meeting-btn-add" onclick="App.addMeetingDialogueEntry('${sl.id}')">Add Dialogue</button>
          </div>
        </div>
        
        <div class="dialogue-history" style="max-height:220px; overflow-y:auto;" id="meeting-dialogue-list-${sl.id}">
          ${this.renderMeetingDialogueList(sl, entries)}
        </div>
      </div>
    `;
  },

  renderMeetingDialogueList(sl, entries) {
    if (entries.length === 0) {
      return `<div style="text-align:center; padding:1.5rem; color:var(--text-muted); font-size:0.8rem;">No dialogue entries recorded.</div>`;
    }
    
    return entries.map((entry, index) => `
      <div class="dialogue-entry" style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; gap:1rem; align-items:flex-start;">
        <div style="flex:1;">
          <div class="dialogue-entry-date" style="font-size:0.7rem; color:var(--gold); margin-bottom:4px; font-family:var(--font-display); font-weight:700;">${this.escapeHtml(entry.date)}</div>
          <div class="dialogue-entry-text" style="font-size:0.8rem; line-height:1.4; color:var(--text-secondary); white-space:pre-line;">${this.escapeHtml(entry.text)}</div>
        </div>
        <button type="button" class="dialogue-icon-btn" onclick="App.deleteMeetingDialogueEntry('${sl.id}', ${index})" title="Delete entry" style="background:transparent; border:none; color:var(--red); font-size:0.75rem; cursor:pointer; padding:2px 6px;">Delete</button>
      </div>
    `).join('');
  },

  addMeetingDialogueEntry(slId) {
    const ta = document.getElementById(`meeting-dialogue-text-${slId}`);
    if (!ta || !ta.value.trim()) {
      ta?.classList.add('input-error');
      return;
    }
    ta.classList.remove('input-error');
    const entries = this.getDialogueEntries(slId);
    entries.unshift({
      date: this.getLocalToday(),
      text: ta.value.trim()
    });
    Sync.saveDialogueEntries(slId, entries);
    ta.value = '';
    
    const countEl = document.getElementById(`meeting-dialogue-count-${slId}`);
    if (countEl) countEl.textContent = `${entries.length} entries`;
    
    const listEl = document.getElementById(`meeting-dialogue-list-${slId}`);
    if (listEl) listEl.innerHTML = this.renderMeetingDialogueList({ id: slId }, entries);
    
    const activeSL = FRAMEWORK.serviceLines.find(s => s.id === slId);
    if (activeSL) {
      const link = document.querySelector(`.meeting-sl-link[data-sl-id="${slId}"]`);
      if (link) {
        const statusRow = link.querySelector('.meeting-sl-status-row');
        if (statusRow) {
          statusRow.outerHTML = this.getMeetingStatusRowHtml(activeSL);
        }
      }
    }
  },

  deleteMeetingDialogueEntry(slId, index) {
    this.confirmAction("Are you sure you want to delete this dialogue entry?", () => {
      const entries = this.getDialogueEntries(slId);
      if (index >= 0 && index < entries.length) {
        entries.splice(index, 1);
        Sync.saveDialogueEntries(slId, entries);
        
        const countEl = document.getElementById(`meeting-dialogue-count-${slId}`);
        if (countEl) countEl.textContent = `${entries.length} entries`;
        
        const listEl = document.getElementById(`meeting-dialogue-list-${slId}`);
        if (listEl) listEl.innerHTML = this.renderMeetingDialogueList({ id: slId }, entries);
        
        const activeSL = FRAMEWORK.serviceLines.find(s => s.id === slId);
        if (activeSL) {
          const link = document.querySelector(`.meeting-sl-link[data-sl-id="${slId}"]`);
          if (link) {
            const statusRow = link.querySelector('.meeting-sl-status-row');
            if (statusRow) {
              statusRow.outerHTML = this.getMeetingStatusRowHtml(activeSL);
            }
          }
        }
      }
    });
  },

  generateAIPanelBrief(slId) {
    console.log(`[AI Brief] Button clicked for service line ID: "${slId}"`);
    const sl = FRAMEWORK.serviceLines.find(s => s.id === slId);
    if (!sl) {
      console.error(`[AI Brief] Service line "${slId}" not found in FRAMEWORK.`);
      return;
    }
    
    if (!window.AskDrHoltkamp) {
      console.error("[AI Brief] window.AskDrHoltkamp is not defined.");
      alert("Ask Dr. Holtkamp assistant is not loaded yet. Please refresh or try again in a moment.");
      return;
    }
    
    console.log(`[AI Brief] AskDrHoltkamp is ready: ${window.AskDrHoltkamp.isReady}, is open: ${window.AskDrHoltkamp.isOpen}`);
    const prompt = `Give me a concise 1/2 page executive sync brief specifically for the ${sl.name} (${sl.abbr || ''}). Summarize the BLUF, key metric highlights, and the most critical roadblocks.`;
    
    if (!window.AskDrHoltkamp.els || !window.AskDrHoltkamp.els.input) {
      console.warn("[AI Brief] AskDrHoltkamp elements not initialized. Initializing now...");
      window.AskDrHoltkamp.init();
    }
    
    if (!window.AskDrHoltkamp.isOpen) {
      console.log("[AI Brief] Panel is closed. Opening panel...");
      window.AskDrHoltkamp.open();
    }
    
    const inputEl = window.AskDrHoltkamp.els.input;
    if (inputEl) {
      console.log("[AI Brief] Input element found. Setting prompt value...");
      inputEl.value = prompt;
      window.AskDrHoltkamp.autoSizeInput();
      
      if (!window.AskDrHoltkamp.isReady) {
        console.warn("[AI Brief] AskDrHoltkamp is not ready yet. Scheduling auto-send on readiness.");
        
        // Append a user-friendly initialization indicator in the chat message block
        const messagesEl = window.AskDrHoltkamp.els.messages;
        if (messagesEl) {
          const infoMsg = document.createElement("div");
          infoMsg.className = "ask-message assistant";
          infoMsg.innerHTML = `
            <div class="ask-message-label">Dr. Holtkamp persona</div>
            <div class="ask-message-body">
              <em>Initializing connection to the Band-Aid 6 persona... The sync brief will generate automatically as soon as the connection is ready.</em>
            </div>
          `;
          messagesEl.appendChild(infoMsg);
          window.AskDrHoltkamp.scrollToBottom(true);
        }
        
        // Poll for readiness every 250ms, auto-sending once loaded
        const checkInterval = setInterval(() => {
          console.log("[AI Brief] Checking if AskDrHoltkamp is ready...");
          if (window.AskDrHoltkamp.isReady) {
            console.log("[AI Brief] AskDrHoltkamp is ready now! Triggering send...");
            clearInterval(checkInterval);
            
            // Clean up the initialization notice before sending
            const messagesEl = window.AskDrHoltkamp.els.messages;
            if (messagesEl && messagesEl.lastChild && messagesEl.lastChild.innerHTML.includes("Initializing connection")) {
              messagesEl.removeChild(messagesEl.lastChild);
            }
            
            window.AskDrHoltkamp.updateSendButtonState();
            window.AskDrHoltkamp.send();
          }
        }, 250);
        
        // Stop checking after 10 seconds to avoid infinite resource consumption
        setTimeout(() => {
          if (checkInterval) {
            console.error("[AI Brief] Auto-send timed out after 10 seconds. AskDrHoltkamp never became ready.");
            clearInterval(checkInterval);
          }
        }, 10000);
        return;
      }
      
      window.AskDrHoltkamp.updateSendButtonState();
      try {
        console.log("[AI Brief] Triggering window.AskDrHoltkamp.send()...");
        window.AskDrHoltkamp.send();
      } catch (err) {
        console.error("[AI Brief] Failed to send brief automatically:", err);
      }
    } else {
      console.error("[AI Brief] AskDrHoltkamp input element (els.input) not found.");
    }
  },

  renderMeetingTasksCard(sl) {
    const D = FRAMEWORK;
    const phases = [1, 2, 3];
    
    const phaseTasksHtml = phases.map(phaseNum => {
      const phase = D.phases[phaseNum - 1];
      const tasks = (sl.tasks || []).filter(t => t.phase === phaseNum);
      const cc = D.crossCuttingTasks.filter(t => t.phase === phaseNum);
      
      if (tasks.length === 0 && cc.length === 0) return '';
      
      const allTasks = [...tasks, ...cc];
      
      return `
        <div class="meeting-phase-tasks" style="margin-bottom: 1.5rem;">
          <div class="meeting-phase-title" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; border-left:2px solid var(--gold); padding-left:8px;">
            Phase ${phase.id}: ${this.escapeHtml(phase.name)}
          </div>
          ${allTasks.map(task => {
            const saved = this.getTaskData(task.id);
            const currentStatus = saved.status || task.status;
            const kpiChecks = saved.kpis || {};
            const deletedKpis = saved.deletedKpis || {};
            const notes = saved.notes || '';
            const isCrossCutting = !sl.tasks?.some(t => t.id === task.id);
            
            return `
              <div class="meeting-task-card" id="task-${task.id}" style="background:rgba(255, 255, 255, 0.015); border:1px solid var(--border-subtle); border-radius:6px; padding:12px; margin-bottom:8px;">
                <div class="meeting-task-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                  <div class="meeting-task-title" style="font-size:0.85rem; font-weight:600; color:var(--text-primary);">
                    ${isCrossCutting ? '<span style="color:var(--gold); font-size:0.65rem; border:1px solid var(--gold); padding:1px 4px; border-radius:3px; margin-right:4px; text-transform:uppercase; font-family:var(--font-body);">CC</span>' : ''}
                    ${this.escapeHtml(task.title)}
                  </div>
                  <span class="meeting-task-status-badge ${currentStatus}" id="badge-${task.id}">${this.statusLabel(currentStatus)}</span>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; line-height:1.4;">${this.escapeHtml(task.description)}</div>
                
                <!-- Interactive KPIs -->
                <div class="meeting-task-kpis" style="display:flex; flex-direction:column; gap:4px; margin-top:8px;">
                  ${(task.kpis || []).map((k, i) => {
                    const checked = !!kpiChecks[i];
                    const deleted = !!deletedKpis[i];
                    if (deleted) return '';
                    return `
                      <div class="kpi-interactive ${checked ? 'checked' : ''} ${deleted ? 'soft-deleted' : ''}" id="kpi-${task.id}-${i}" onclick="App.toggleKpi('${task.id}', '${i}')">
                        <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                        <div class="kpi-label ${checked ? 'checked' : ''} ${deleted ? 'soft-deleted' : ''}">${this.escapeHtml(k)}</div>
                      </div>`;
                  }).join('')}
                  ${(saved.customKpis || []).map((k, i) => {
                    const idx = `custom-${i}`;
                    const checked = !!kpiChecks[idx];
                    return `
                      <div class="kpi-interactive custom-kpi ${checked ? 'checked' : ''}" id="kpi-${task.id}-${idx}" onclick="App.toggleKpi('${task.id}', '${idx}')">
                        <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                        <div class="kpi-label ${checked ? 'checked' : ''}">${this.escapeHtml(k)}</div>
                      </div>`;
                  }).join('')}
                </div>
                
                <!-- Task Notes and Status Option -->
                <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div class="status-selector" style="display:flex; gap:4px;">
                    <button class="status-option ${currentStatus === 'complete' ? 'active-complete' : ''}" style="font-size:0.65rem; padding:3px 6px;" data-status-task="${task.id}" data-status-value="complete" onclick="App.setTaskStatus('${task.id}','complete')">✓ Complete</button>
                    <button class="status-option ${currentStatus === 'in-progress' ? 'active-in-progress' : ''}" style="font-size:0.65rem; padding:3px 6px;" data-status-task="${task.id}" data-status-value="in-progress" onclick="App.setTaskStatus('${task.id}','in-progress')">◉ In Progress</button>
                    <button class="status-option ${currentStatus === 'not-started' ? 'active-not-started' : ''}" style="font-size:0.65rem; padding:3px 6px;" data-status-task="${task.id}" data-status-value="not-started" onclick="App.setTaskStatus('${task.id}','not-started')">○ Not Started</button>
                  </div>
                  <button class="meeting-task-notes-toggle ${notes ? 'open' : ''}" style="background:transparent; border:none; color:var(--gold-light); font-size:0.7rem; cursor:pointer; padding:0; margin-top:6px; display:inline-block;" id="notes-btn-${task.id}" onclick="App.toggleNotes('${task.id}')">
                    ✎ ${notes ? 'Notes' : '+ Note'}
                  </button>
                </div>
                
                <div id="notes-area-${task.id}" class="meeting-task-notes-area" style="display:${notes ? 'block' : 'none'}; margin-top:6px;">
                  <textarea placeholder="Enter accomplishments, updates, or notes..." style="width:100%; min-height:60px; background:rgba(0, 0, 0, 0.2); border:1px solid var(--border-subtle); color:var(--text-primary); font-size:0.75rem; padding:6px; border-radius:4px; font-family:inherit; resize:vertical;" id="notes-input-${task.id}" oninput="App.saveNotes('${task.id}')">${this.escapeHtml(notes)}</textarea>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('');
    
    return `
      <div class="meeting-card">
        <div class="meeting-card-header">
          <span>Active Tasks Checklist</span>
        </div>
        <div style="max-height:480px; overflow-y:auto; padding-right:4px;">
          ${phaseTasksHtml}
        </div>
      </div>
    `;
  },

  renderMeetingMetricQuickEntryCard(sl) {
    const trackedMetrics = sl.trackedMetrics || [];
    const metricGroups = sl.metricGroups || [];
    
    if (trackedMetrics.length === 0 && metricGroups.length === 0) {
      return `
        <div class="meeting-card">
          <div class="meeting-card-header">
            <span>Metric Quick-Entry</span>
          </div>
          <div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.85rem;">
            No metrics defined for this service line.
          </div>
        </div>
      `;
    }
    
    let html = `
      <div class="meeting-card">
        <div class="meeting-card-header">
          <span>Metric Quick-Entry</span>
        </div>
        <div style="max-height:480px; overflow-y:auto; padding-right:4px;">
    `;
    
    if (trackedMetrics.length > 0) {
      html += `
        <div style="font-size:0.75rem; font-weight:700; color:var(--gold); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">Single Metrics</div>
        <div style="margin-bottom:1.5rem;">
          ${trackedMetrics.map(m => {
            const entries = this.getMetricEntries(m.id);
            return `
              <div class="meeting-metric-row">
                <div class="meeting-metric-info" style="max-width:55%;">
                  <strong>${this.escapeHtml(m.name)}</strong>
                  <span class="meeting-metric-sub">Goal: ${this.escapeHtml(this.metricTargetText(m))} • Latest: ${this.escapeHtml(this.metricLatestText(m, entries))}</span>
                </div>
                <div class="meeting-metric-inputs">
                  <div class="meeting-date-selector">
                    <input type="date" id="meeting-metric-date-${m.id}" value="${this.getLocalToday()}">
                  </div>
                  <input type="number" step="any" id="meeting-metric-val-${m.id}" placeholder="${this.escapeHtml(m.unit)}" style="width:70px;" onkeydown="if(event.key === 'Enter') { App.addMeetingMetric('${m.id}'); event.preventDefault(); }">
                  <button type="button" class="meeting-btn-add" onclick="App.addMeetingMetric('${m.id}')">Add</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    
    if (metricGroups.length > 0) {
      html += `
        <div style="font-size:0.75rem; font-weight:700; color:var(--gold); text-transform:uppercase; letter-spacing:1px; margin-top:1rem; margin-bottom:10px;">Metric Groups</div>
        ${metricGroups.map(group => `
          <div style="margin-bottom:1.5rem; background:rgba(0,0,0,0.1); border:1px solid var(--border-subtle); padding:10px; border-radius:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
              <span style="font-size:0.8rem; font-weight:700; color:var(--text-primary); font-family:var(--font-display);">${this.escapeHtml(group.name)}</span>
              <div class="meeting-date-selector">
                <input type="date" id="meeting-group-date-${group.id}" value="${this.getLocalToday()}">
              </div>
            </div>
            ${group.series.map(series => {
              const entries = this.getMetricEntries(series.id);
              return `
                <div class="meeting-metric-row" style="padding:6px 0;">
                  <div class="meeting-metric-info" style="max-width:60%;">
                    <strong style="font-size:0.8rem;">${this.escapeHtml(series.name)}</strong>
                    <span class="meeting-metric-sub">Latest: ${this.escapeHtml(this.metricLatestText(series, entries))}</span>
                  </div>
                  <div class="meeting-metric-inputs">
                    <input type="number" step="any" id="meeting-group-val-${group.id}-${series.id}" placeholder="${this.escapeHtml(series.unit || group.unit)}" style="width:70px;" onkeydown="if(event.key === 'Enter') { App.addMeetingGroupMetric('${group.id}', '${series.id}'); event.preventDefault(); }">
                    <button type="button" class="meeting-btn-add" onclick="App.addMeetingGroupMetric('${group.id}', '${series.id}')">Add</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}
      `;
    }
    
    html += `
        </div>
      </div>
    `;
    return html;
  },

  addMeetingMetric(metricId) {
    const valInput = document.getElementById(`meeting-metric-val-${metricId}`);
    const dateInput = document.getElementById(`meeting-metric-date-${metricId}`);
    if (!valInput) return;
    
    valInput.classList.remove('input-error');
    if (dateInput) dateInput.classList.remove('input-error');
    
    let hasError = false;
    if (!dateInput || !dateInput.value) {
      if (dateInput) dateInput.classList.add('input-error');
      hasError = true;
    }
    
    const parsedVal = parseFloat(valInput.value);
    if (valInput.value === '' || isNaN(parsedVal)) {
      valInput.classList.add('input-error');
      hasError = true;
    }
    
    if (hasError) return;
    
    const all = this.getMetricStore();
    const entries = all[metricId] || [];
    entries.push({ date: dateInput.value, value: parsedVal });
    entries.sort((a, b) => a.date.localeCompare(b.date));
    all[metricId] = entries;
    this.saveMetricStore(all);
    valInput.value = '';
    
    const sl = FRAMEWORK.serviceLines.find(s => s.trackedMetrics?.some(m => m.id === metricId));
    if (sl) {
      this.setMeetingActiveServiceLine(sl.id);
      
      const link = document.querySelector(`.meeting-sl-link[data-sl-id="${sl.id}"]`);
      if (link) {
        const statusRow = link.querySelector('.meeting-sl-status-row');
        if (statusRow) {
          statusRow.outerHTML = this.getMeetingStatusRowHtml(sl);
        }
      }
    }
  },

  addMeetingGroupMetric(groupId, seriesId) {
    const valInput = document.getElementById(`meeting-group-val-${groupId}-${seriesId}`);
    const dateInput = document.getElementById(`meeting-group-date-${groupId}`);
    if (!valInput) return;
    
    valInput.classList.remove('input-error');
    if (dateInput) dateInput.classList.remove('input-error');
    
    let hasError = false;
    if (!dateInput || !dateInput.value) {
      if (dateInput) dateInput.classList.add('input-error');
      hasError = true;
    }
    
    const parsedVal = parseFloat(valInput.value);
    if (valInput.value === '' || isNaN(parsedVal)) {
      valInput.classList.add('input-error');
      hasError = true;
    }
    
    if (hasError) return;
    
    const all = this.getMetricStore();
    const entries = all[seriesId] || [];
    entries.push({ date: dateInput.value, value: parsedVal });
    entries.sort((a, b) => a.date.localeCompare(b.date));
    all[seriesId] = entries;
    this.saveMetricStore(all);
    valInput.value = '';
    
    const found = this.getMetricGroupDefinition(groupId);
    if (found) {
      const sl = found.serviceLine;
      this.setMeetingActiveServiceLine(sl.id);
      
      const link = document.querySelector(`.meeting-sl-link[data-sl-id="${sl.id}"]`);
      if (link) {
        const statusRow = link.querySelector('.meeting-sl-status-row');
        if (statusRow) {
          statusRow.outerHTML = this.getMeetingStatusRowHtml(sl);
        }
      }
    }
  },

  // ===== PRESENTATION MODE (Command Briefing Deck) =====
  
  togglePresentationMode() {
    this.togglingMode = true;
    // If meeting mode is active, exit it first
    if (this.isMeetingMode) {
      this.isMeetingMode = false;
      document.body.classList.remove('meeting-mode-active');
      const meetBtn = document.getElementById('btn-meeting-mode');
      if (meetBtn) meetBtn.classList.remove('active');
    }

    this.isPresentationMode = !this.isPresentationMode;
    const body = document.body;
    const btn = document.getElementById('btn-presentation-mode');
    
    if (this.isPresentationMode) {
      body.classList.add('presentation-mode-active');
      if (btn) btn.classList.add('active');
      this.presentationActiveIndex = 0;
      this.setupPresentationListeners();
      this.route();
    } else {
      body.classList.remove('presentation-mode-active');
      if (btn) btn.classList.remove('active');
      this.teardownPresentationListeners();
      this.route();
    }
  },

  setupPresentationListeners() {
    this.teardownPresentationListeners();
    this._onPresentationKeydown = this.handlePresentationKeydown.bind(this);
    window.addEventListener('keydown', this._onPresentationKeydown);
  },

  teardownPresentationListeners() {
    if (this._onPresentationKeydown) {
      window.removeEventListener('keydown', this._onPresentationKeydown);
      this._onPresentationKeydown = null;
    }
  },

  handlePresentationKeydown(e) {
    if (!this.isPresentationMode) return;
    const totalSlides = FRAMEWORK.serviceLines.length + 1;
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      this.navigateSlide(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.navigateSlide(-1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.togglePresentationMode();
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.goToSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      this.goToSlide(totalSlides - 1);
    }
  },

  navigateSlide(direction) {
    const totalSlides = FRAMEWORK.serviceLines.length + 1;
    const nextIndex = this.presentationActiveIndex + direction;
    if (nextIndex >= 0 && nextIndex < totalSlides) {
      const transDir = direction > 0 ? 'forward' : 'backward';
      this.goToSlide(nextIndex, transDir);
    }
  },

  goToSlide(index, direction) {
    const totalSlides = FRAMEWORK.serviceLines.length + 1;
    if (index < 0 || index >= totalSlides) return;
    if (index === this.presentationActiveIndex) return;
    
    const updateCallback = () => {
      this.presentationActiveIndex = index;
      const main = document.getElementById('app');
      this.renderPresentationMode(main);
    };

    if (!direction) {
      direction = index > this.presentationActiveIndex ? 'forward' : 'backward';
    }

    try {
      if (document.startViewTransition) {
        document.startViewTransition({
          update: updateCallback,
          types: [direction]
        });
      } else {
        updateCallback();
      }
    } catch (e) {
      try {
        document.startViewTransition(updateCallback);
      } catch (e2) {
        updateCallback();
      }
    }
  },

  // Compute a dynamic headline for each slide based on actual data
  getSlideHeadline(slideIndex) {
    if (slideIndex === 0) {
      // Executive summary: compute overall task completion
      const allTasks = [
        ...FRAMEWORK.serviceLines.flatMap(sl => sl.tasks || []),
        ...FRAMEWORK.crossCuttingTasks
      ];
      const completed = allTasks.filter(t => {
        const saved = this.getTaskData(t.id);
        return (saved.status || t.status) === 'complete';
      }).length;
      const total = allTasks.length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      return `${FRAMEWORK.title} — ${pct}% Tasks Complete`;
    }

    const sl = FRAMEWORK.serviceLines[slideIndex - 1];
    
    // Count metrics on track vs off track
    let onTrack = 0;
    let offTrack = 0;
    let totalMetrics = 0;
    
    (sl.trackedMetrics || []).forEach(m => {
      if (m.goal !== null && m.goal !== undefined) {
        const entries = this.getMetricEntries(m.id);
        if (entries.length) {
          totalMetrics++;
          const latest = entries[entries.length - 1].value;
          const good = m.direction === 'lower' ? latest <= m.goal : latest >= m.goal;
          if (good) onTrack++;
          else offTrack++;
        }
      }
    });
    
    (sl.metricGroups || []).forEach(g => {
      g.series.forEach(s => {
        if (s.goal !== null && s.goal !== undefined) {
          const entries = this.getMetricEntries(s.id);
          if (entries.length) {
            totalMetrics++;
            const latest = entries[entries.length - 1].value;
            const good = s.direction === 'lower' ? latest <= s.goal : latest >= s.goal;
            if (good) onTrack++;
            else offTrack++;
          }
        }
      });
    });

    if (totalMetrics > 0) {
      if (offTrack === 0) return `${sl.name} — All ${totalMetrics} Metrics On Track`;
      return `${sl.name} — ${onTrack}/${totalMetrics} Metrics On Track`;
    }
    
    // Fallback: task completion
    const tasks = [...(sl.tasks || []), ...FRAMEWORK.crossCuttingTasks];
    const done = tasks.filter(t => {
      const saved = this.getTaskData(t.id);
      return (saved.status || t.status) === 'complete';
    }).length;
    return `${sl.name} — ${done}/${tasks.length} Tasks Complete`;
  },

  // Get a metric delta badge showing trend
  getMetricDeltaHtml(metric, entries) {
    if (entries.length < 2) return '';
    const prev = entries[entries.length - 2].value;
    const latest = entries[entries.length - 1].value;
    const delta = Math.round((latest - prev) * 10) / 10;
    if (delta === 0) return `<span class="pres-metric-delta stable">→ Stable</span>`;
    
    const improving = metric.direction === 'lower' ? delta < 0 : delta > 0;
    const arrow = delta > 0 ? '↑' : '↓';
    const cls = improving ? 'improving' : 'declining';
    const label = `${arrow} ${Math.abs(delta)} ${metric.unit || ''}`.trim();
    return `<span class="pres-metric-delta ${cls}">${this.escapeHtml(label)}</span>`;
  },

  // Auto-detect current phase based on today's date
  getCurrentPhaseIndex() {
    const now = new Date();
    // Phase transition dates (end dates for each phase)
    const transitions = [
      new Date('2026-03-01'), // Phase 1 ends
      new Date('2026-08-10'), // Phase 2 ends
      new Date('2027-07-31'), // Phase 3 ends
    ];
    for (let i = 0; i < transitions.length; i++) {
      if (now < transitions[i]) return i; // 0-indexed
    }
    return transitions.length - 1;
  },

  renderTimelineRibbon() {
    const phases = FRAMEWORK.phases;
    const currentIdx = this.getCurrentPhaseIndex();
    const slideIndex = this.presentationActiveIndex;
    const completedKpis = [];

    // Phase date boundaries for coordinate mapping
    const bounds = [
      { start: new Date('2025-08-01'), end: new Date('2026-03-01') },
      { start: new Date('2026-03-01'), end: new Date('2026-08-10') },
      { start: new Date('2026-08-10'), end: new Date('2027-07-31') }
    ];

    // Helper to process task KPIs
    const processTask = (task, slAbbr) => {
      const saved = this.getTaskData(task.id);
      const kpiChecks = saved.kpis || {};
      const kpiDates = saved.kpiDates || {};
      const deletedKpis = saved.deletedKpis || {};
      
      const isExec = slideIndex === 0;
      const majorIndices = task.majorKpiIndices || [];

      // Built-in KPIs
      (task.kpis || []).forEach((kpiText, i) => {
        if (deletedKpis[i]) return;
        if (kpiChecks[i] && kpiDates[i]) {
          const isMajor = majorIndices.includes(i);
          if (!isExec || isMajor) {
            completedKpis.push({
              title: kpiText,
              date: new Date(kpiDates[i]),
              dateStr: kpiDates[i],
              sl: slAbbr,
              taskId: task.id
            });
          }
        }
      });

      // Custom KPIs
      (saved.customKpis || []).forEach((kpiText, i) => {
        const idx = `custom-${i}`;
        if (kpiChecks[idx] && kpiDates[idx]) {
          if (!isExec) {
            completedKpis.push({
              title: kpiText,
              date: new Date(kpiDates[idx]),
              dateStr: kpiDates[idx],
              sl: slAbbr,
              taskId: task.id
            });
          }
        }
      });
    };

    if (slideIndex === 0) {
      FRAMEWORK.serviceLines.forEach(sl => {
        (sl.tasks || []).forEach(t => processTask(t, sl.abbr || sl.name));
      });
      FRAMEWORK.crossCuttingTasks.forEach(t => processTask(t, 'CC'));
    } else {
      const activeSL = FRAMEWORK.serviceLines[slideIndex - 1];
      if (activeSL) {
        (activeSL.tasks || []).forEach(t => processTask(t, activeSL.abbr || activeSL.name));
      }
    }

    const kpiDotsByPhase = { 1: [], 2: [], 3: [] };

    completedKpis.forEach(kpi => {
      const time = kpi.date.getTime();
      if (isNaN(time)) return;

      let phaseId = null;
      let offsetPct = 0;

      for (let pIdx = 0; pIdx < bounds.length; pIdx++) {
        const b = bounds[pIdx];
        if (time >= b.start.getTime() && time <= b.end.getTime()) {
          phaseId = pIdx + 1;
          const range = b.end.getTime() - b.start.getTime();
          offsetPct = ((time - b.start.getTime()) / range) * 100;
          break;
        }
      }

      if (!phaseId) {
        if (time < bounds[0].start.getTime()) {
          phaseId = 1;
          offsetPct = 0;
        } else {
          phaseId = 3;
          offsetPct = 100;
        }
      }

      kpiDotsByPhase[phaseId].push({
        title: kpi.title,
        sl: kpi.sl,
        dateStr: kpi.dateStr,
        offsetPct: Math.max(0, Math.min(100, offsetPct))
      });
    });

    const phaseSegments = phases.map((phase, i) => {
      const isComplete = i < currentIdx;
      const isActive = i === currentIdx;
      const isUpcoming = i > currentIdx;

      let segClass = 'tl-upcoming';
      if (isComplete) segClass = 'tl-complete';
      if (isActive) segClass = 'tl-active';

      // Decisive point marker
      const dp = phase.decisivePoint;
      const dpDone = dp.status === 'complete';
      const dpMarker = `<span class="tl-dp ${dpDone ? 'done' : ''}" title="${this.escapeHtml(dp.name)} — ${this.escapeHtml(dp.date)}">${dpDone ? '◆' : '◇'}</span>`;

      // Calculate Today offset percentage for active phase segment
      let todayMarkerHtml = '';
      if (isActive) {
        const today = new Date();
        const b = bounds[i];
        if (today.getTime() >= b.start.getTime() && today.getTime() <= b.end.getTime()) {
          const range = b.end.getTime() - b.start.getTime();
          const todayOffset = ((today.getTime() - b.start.getTime()) / range) * 100;
          const formattedToday = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          todayMarkerHtml = `
            <div class="timeline-today-marker" style="left: ${todayOffset.toFixed(1)}%;" title="Today: ${formattedToday}">
              <div class="timeline-today-arrow">▼</div>
              <div class="timeline-today-line"></div>
              <div class="timeline-today-text">TODAY</div>
            </div>
          `;
        }
      }

      const dots = kpiDotsByPhase[phase.id] || [];
      const kpiDotsHtml = dots.map(dot => {
        const slClass = (dot.sl || '').toLowerCase().replace('/', '').replace(' ', '-');
        const formattedDate = new Date(dot.dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `
          <span class="timeline-kpi-dot ${slClass}" 
                style="left: ${dot.offsetPct}%;" 
                title="[${this.escapeHtml(dot.sl)}] ${this.escapeHtml(dot.title)} — Completed ${this.escapeHtml(formattedDate)}">
          </span>
        `;
      }).join('');

      return `
        <div class="tl-segment ${segClass}">
          <div class="tl-line-row">
            <span class="tl-dot"></span>
            <span class="tl-line" style="position: relative;">
              ${kpiDotsHtml}
              ${todayMarkerHtml}
            </span>
            ${dpMarker}
            ${i === phases.length - 1 ? '<span class="tl-dot tl-dot-end"></span>' : ''}
          </div>
          <div class="tl-label">
            <span class="tl-phase-name">Phase ${phase.id}: ${this.escapeHtml(phase.name)}</span>
            <span class="tl-phase-date">${this.escapeHtml(phase.dateRange)}</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="timeline-ribbon" aria-label="Operational timeline">
        ${phaseSegments}
      </div>
    `;
  },

  renderPresentationMode(el) {
    if (!el) return;
    
    const slideIndex = this.presentationActiveIndex;
    const totalSlides = FRAMEWORK.serviceLines.length + 1;
    const progressPct = totalSlides > 1 ? Math.round((slideIndex / (totalSlides - 1)) * 100) : 100;
    const slideLabel = slideIndex === 0 ? 'Executive Summary' : `${slideIndex} of ${totalSlides - 1}`;
    const headline = this.getSlideHeadline(slideIndex);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    
    const slideHeaderMeta = slideIndex === 0
      ? FRAMEWORK.hospital
      : `${FRAMEWORK.serviceLines[slideIndex - 1].leader}`;

    const slideContent = this.getSlideHtml(slideIndex);
    const timelineRibbon = this.renderTimelineRibbon();
    
    el.innerHTML = `
      <div class="presentation-container slide-fade-in">
        <header class="presentation-header">
          <div class="presentation-header-left">
            <span class="presentation-header-badge">${slideLabel}</span>
            <span class="presentation-header-headline">${this.escapeHtml(headline)}</span>
          </div>
          <div class="presentation-header-right">
            <span class="presentation-header-meta">${this.escapeHtml(slideHeaderMeta)}</span>
            <span class="presentation-header-date">${today}</span>
          </div>
        </header>

        ${timelineRibbon}

        <div class="presentation-body">
          ${slideContent}
        </div>

        <footer class="presentation-footer-controls">
          <div class="presentation-nav-buttons">
            <button class="presentation-btn" onclick="App.navigateSlide(-1)" ${slideIndex === 0 ? 'disabled' : ''} aria-label="Previous slide">← Prev</button>
            <button class="presentation-btn" onclick="App.navigateSlide(1)" ${slideIndex === totalSlides - 1 ? 'disabled' : ''} aria-label="Next slide">Next →</button>
          </div>
          
          <div class="presentation-jump-tabs">
            <button class="presentation-tab ${slideIndex === 0 ? 'active' : ''}" onclick="App.goToSlide(0)">Executive</button>
            ${FRAMEWORK.serviceLines.map((sl, idx) => `
              <button class="presentation-tab ${slideIndex === idx + 1 ? 'active' : ''}" onclick="App.goToSlide(${idx + 1})">${sl.abbr || sl.name}</button>
            `).join('')}
          </div>

          <div class="presentation-progress-bar" title="Slide ${slideIndex + 1} of ${totalSlides}">
            <div class="presentation-progress-fill" style="width: ${progressPct}%"></div>
          </div>

          <button class="presentation-btn exit" onclick="App.togglePresentationMode()" aria-label="Exit presentation mode">Exit ✕</button>
        </footer>
      </div>
    `;
  },

  getSlideHtml(index) {
    if (index === 0) {
      return this.getExecutiveSlideHtml();
    }
    const sl = FRAMEWORK.serviceLines[index - 1];
    return this.getServiceLineSlideHtml(sl);
  },

  // Compute service line health summary for executive slide
  getServiceLineHealth(sl) {
    let onTrack = 0, offTrack = 0, noData = 0, totalGoalMetrics = 0;

    const checkMetric = (m) => {
      if (m.goal !== null && m.goal !== undefined) {
        const entries = this.getMetricEntries(m.id);
        if (entries.length) {
          totalGoalMetrics++;
          const latest = entries[entries.length - 1].value;
          const good = m.direction === 'lower' ? latest <= m.goal : latest >= m.goal;
          if (good) onTrack++; else offTrack++;
        } else {
          noData++;
        }
      }
    };

    (sl.trackedMetrics || []).forEach(checkMetric);
    (sl.metricGroups || []).forEach(g => g.series.forEach(checkMetric));

    // Task completion
    const allTasks = [...(sl.tasks || []), ...FRAMEWORK.crossCuttingTasks];
    const completedTasks = allTasks.filter(t => {
      const saved = this.getTaskData(t.id);
      return (saved.status || t.status) === 'complete';
    }).length;
    const totalTasks = allTasks.length;
    const taskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Overall status
    let status = 'neutral';
    let statusLabel = 'No Data';
    if (totalGoalMetrics > 0) {
      if (offTrack === 0) { status = 'good'; statusLabel = 'On Track'; }
      else if (offTrack <= onTrack) { status = 'warn'; statusLabel = 'Mixed'; }
      else { status = 'risk'; statusLabel = 'At Risk'; }
    }

    return { onTrack, offTrack, noData, totalGoalMetrics, completedTasks, totalTasks, taskPct, status, statusLabel };
  },

  getExecutiveSlideHtml() {
    // Gather all tasks
    const allTasks = [
      ...FRAMEWORK.serviceLines.flatMap(sl => sl.tasks || []),
      ...FRAMEWORK.crossCuttingTasks
    ];
    const totalTaskCount = allTasks.length;
    const totalCompleted = allTasks.filter(t => {
      const saved = this.getTaskData(t.id);
      return (saved.status || t.status) === 'complete';
    }).length;
    const totalPct = totalTaskCount > 0 ? Math.round((totalCompleted / totalTaskCount) * 100) : 0;

    // Phase-by-phase breakdown
    const currentPhaseIdx = this.getCurrentPhaseIndex();
    const phaseProgressHtml = FRAMEWORK.phases.map((phase, i) => {
      const phaseTasks = allTasks.filter(t => t.phase === phase.id);
      const phaseTotal = phaseTasks.length;
      const phaseDone = phaseTasks.filter(t => {
        const saved = this.getTaskData(t.id);
        return (saved.status || t.status) === 'complete';
      }).length;
      const phasePct = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;

      let barColor = 'var(--text-muted)';
      let statusTag = '';
      if (i < currentPhaseIdx) {
        barColor = 'var(--emerald)';
        statusTag = '<span class="exec-phase-tag complete">COMPLETE</span>';
      } else if (i === currentPhaseIdx) {
        barColor = 'var(--gold)';
        statusTag = '<span class="exec-phase-tag active">ACTIVE</span>';
      } else {
        statusTag = '<span class="exec-phase-tag upcoming">UPCOMING</span>';
      }

      return `
        <div class="exec-phase-row">
          <div class="exec-phase-header">
            <span class="exec-phase-name">Phase ${phase.id}: ${this.escapeHtml(phase.name)}</span>
            <span class="exec-phase-stats">${statusTag} <strong>${phaseDone}/${phaseTotal}</strong> (${phasePct}%)</span>
          </div>
          <div class="exec-progress-bar-outer">
            <div class="exec-progress-bar-inner" style="width: ${phasePct}%; background: ${barColor};"></div>
          </div>
        </div>
      `;
    }).join('');

    // --- Metric Spotlight: find the single biggest WIN across all metrics ---
    let bestWin = null;
    const scanMetric = (metric, slName) => {
      const entries = this.getMetricEntries(metric.id);
      if (entries.length < 2) return;
      const prev = entries[entries.length - 2].value;
      const latest = entries[entries.length - 1].value;
      const delta = latest - prev;
      if (delta === 0) return;
      const improving = metric.direction === 'lower' ? delta < 0 : delta > 0;
      if (!improving) return;
      const magnitude = Math.abs(delta);
      if (!bestWin || magnitude > bestWin.magnitude) {
        bestWin = { metric, slName, delta, magnitude, latest, prev };
      }
    };
    FRAMEWORK.serviceLines.forEach(sl => {
      (sl.trackedMetrics || []).forEach(m => scanMetric(m, sl.abbr || sl.name));
      (sl.metricGroups || []).forEach(g => g.series.forEach(s => scanMetric(s, sl.abbr || sl.name)));
    });

    let spotlightHtml = '';
    if (bestWin) {
      const arrow = bestWin.delta > 0 ? '↑' : '↓';
      const deltaVal = Math.round(Math.abs(bestWin.delta) * 10) / 10;
      const unit = bestWin.metric.unit || '';
      spotlightHtml = `
        <div class="slide-panel-title" style="margin-top: 0.75rem;">
          <span>📈 Metric Spotlight</span>
          <span class="slide-panel-count">Biggest Win</span>
        </div>
        <div class="exec-spotlight-card">
          <div class="exec-spotlight-icon">▲</div>
          <div class="exec-spotlight-body">
            <div class="exec-spotlight-metric">${this.escapeHtml(bestWin.metric.name)}</div>
            <div class="exec-spotlight-detail">${this.escapeHtml(bestWin.slName)} • ${arrow} ${deltaVal} ${this.escapeHtml(unit)}</div>
          </div>
        </div>
      `;
    }

    // --- Next 30-Day Milestones: upcoming decisive points + in-progress tasks ---
    const milestones = [];
    
    // Add upcoming decisive points
    FRAMEWORK.phases.forEach(phase => {
      const dp = phase.decisivePoint;
      if (dp.status !== 'complete') {
        milestones.push({
          type: 'dp',
          label: dp.name,
          detail: dp.date,
          phase: phase.id,
          sort: new Date(dp.date).getTime() || Infinity
        });
      }
    });

    // Add in-progress tasks from current phase
    const currentPhase = FRAMEWORK.phases[currentPhaseIdx];
    if (currentPhase) {
      allTasks.filter(t => t.phase === currentPhase.id).forEach(t => {
        const saved = this.getTaskData(t.id);
        const status = saved.status || t.status;
        if (status === 'in-progress') {
          // Find which SL this belongs to
          const sl = FRAMEWORK.serviceLines.find(s => (s.tasks || []).some(st => st.id === t.id));
          milestones.push({
            type: 'task',
            label: t.title,
            detail: sl ? (sl.abbr || sl.name) : 'Cross-Cutting',
            phase: t.phase,
            sort: t.phase * 1000
          });
        }
      });
    }

    // Cap at 5 items
    const displayMilestones = milestones.sort((a, b) => a.sort - b.sort).slice(0, 5);

    let milestonesHtml = '';
    if (displayMilestones.length > 0) {
      milestonesHtml = `
        <div class="slide-panel-title" style="margin-top: 0.75rem;">
          <span>Next Milestones</span>
          <span class="slide-panel-count">${displayMilestones.length} items</span>
        </div>
        <div class="exec-milestones-list">
          ${displayMilestones.map(m => `
            <div class="exec-milestone-item ${m.type}">
              <span class="exec-milestone-icon">${m.type === 'dp' ? '◇' : '◉'}</span>
              <div class="exec-milestone-body">
                <span class="exec-milestone-label">${this.escapeHtml(m.label)}</span>
                <span class="exec-milestone-detail">${this.escapeHtml(m.detail)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Service line cards with health status
    const slCardsHtml = FRAMEWORK.serviceLines.map((sl, idx) => {
      const health = this.getServiceLineHealth(sl);
      
      return `
        <div class="exec-sl-card" onclick="App.goToSlide(${idx + 1})" title="View ${this.escapeHtml(sl.name)} details">
          <div class="exec-sl-abbr">${this.escapeHtml(sl.abbr || sl.id.toUpperCase())}</div>
          <div class="exec-sl-info">
            <div class="exec-sl-name">${this.escapeHtml(sl.name)}</div>
            <div class="exec-sl-leader">${this.escapeHtml(sl.leader)}</div>
          </div>
          <div class="exec-sl-status">
            <span class="exec-sl-status-badge ${health.status}">${health.statusLabel}</span>
            <span class="exec-sl-task-progress">${health.completedTasks}/${health.totalTasks} tasks</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="exec-layout-grid">
        <!-- Left Column: Command Intent → Total → By Phase → Spotlight → Milestones -->
        <div class="slide-panel">
          <div class="slide-panel-title">
            <span>Command Intent</span>
          </div>
          <div class="exec-mission-box">
            "${this.escapeHtml(FRAMEWORK.mission)}"
          </div>
          
          <div class="slide-panel-title" style="margin-top: 0.75rem;">
            <span>Total Line of Effort Progress</span>
            <span class="slide-panel-count"><strong>${totalCompleted}/${totalTaskCount}</strong> (${totalPct}%)</span>
          </div>
          <div class="exec-progress-bar-outer" style="height: 12px; border-radius: 6px; margin-bottom: 0.25rem;">
            <div class="exec-progress-bar-inner" style="width: ${totalPct}%; border-radius: 6px; background: var(--gold);"></div>
          </div>

          <div class="slide-panel-title" style="margin-top: 0.75rem;">
            <span>Progress by Phase</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 0.25rem;">
            ${phaseProgressHtml}
          </div>

          ${spotlightHtml}
          ${milestonesHtml}
        </div>
        
        <!-- Right Column: Service Line Health -->
        <div class="slide-panel">
          <div class="slide-panel-title">
            <span>Service Line Readiness</span>
            <span class="slide-panel-count">${FRAMEWORK.serviceLines.length} departments</span>
          </div>
          <div class="exec-sl-grid">
            ${slCardsHtml}
          </div>
        </div>
      </div>
    `;
  },

  getServiceLineSlideHtml(sl) {
    // Separate tasks into accomplishments and way forward
    const accomplishments = [];
    const wayForward = [];

    const getTaskKpiSummaryHtml = (task) => {
      if (task.id.startsWith('hedis-action-')) return '';
      const saved = this.getTaskData(task.id);
      const kpiChecks = saved.kpis || {};
      const deletedKpis = saved.deletedKpis || {};
      const customKpis = saved.customKpis || [];
      
      const builtInCount = (task.kpis || []).filter((_, i) => !deletedKpis[i]).length;
      const totalKpis = builtInCount + customKpis.length;
      
      const completedBuiltIn = (task.kpis || []).filter((_, i) => !deletedKpis[i] && kpiChecks[i]).length;
      const completedCustom = customKpis.filter((_, i) => kpiChecks[`custom-${i}`]).length;
      const completedKpisCount = completedBuiltIn + completedCustom;
      
      if (totalKpis === 0) return '';
      return `<span class="slide-list-kpi-badge">${completedKpisCount}/${totalKpis} Milestones</span>`;
    };

    // Include service line tasks and cross-cutting tasks
    const allTasks = [...(sl.tasks || []), ...FRAMEWORK.crossCuttingTasks];

    // Include HEDIS action items for PCSL
    if (sl.id === 'pcsl') {
      const hedisData = this.getHedisData('pcsl');
      const kpiChecks = hedisData.kpis || {};
      const customKpis = hedisData.customKpis || [];
      customKpis.forEach((k, i) => {
        const checked = !!kpiChecks[`custom-${i}`];
        allTasks.push({
          id: `hedis-action-${i}`,
          title: k,
          description: "HEDIS Action Item",
          status: checked ? "complete" : "in-progress",
          kpis: [],
          loe: 1
        });
      });
    }

    allTasks.forEach(task => {
      const saved = this.getTaskData(task.id);
      const currentStatus = saved.status || task.status;
      if (currentStatus === 'complete') {
        accomplishments.push(task);
      } else {
        wayForward.push(task);
      }
    });

    const renderTaskItem = (t, type) => {
      const isCc = t.id.startsWith('cc-');
      const isHedis = t.id.startsWith('hedis-action-');
      let tag = '';
      if (isCc) {
        tag = ` <span class="loe-tag loe-2" style="font-size:0.6rem;padding:1px 5px;border-radius:3px;font-weight:700;">Cross-Cutting</span>`;
      } else if (isHedis) {
        tag = ` <span class="loe-tag loe-1" style="font-size:0.6rem;padding:1px 5px;border-radius:3px;font-weight:700;background:rgba(255,184,28,0.12);border:1px solid var(--border-accent);color:var(--gold);">HEDIS</span>`;
      }
      
      const icon = type === 'accomplishment' ? '✓' : '▶';
      return `
        <div class="slide-list-item ${type}">
          <span class="slide-list-item-icon">${icon}</span>
          <div class="slide-list-item-text">
            <span class="slide-list-item-title">${this.escapeHtml(t.title)}${tag}</span>
            <span class="slide-list-item-desc">${this.escapeHtml(t.description)}</span>
            ${getTaskKpiSummaryHtml(t)}
          </div>
        </div>
      `;
    };

    const accomplishmentsHtml = accomplishments.length > 0 
      ? accomplishments.map(t => renderTaskItem(t, 'accomplishment')).join('')
      : `<div style="text-align:center;color:var(--text-muted);font-style:italic;padding:1rem 0;font-size:0.88rem;">No completed tasks yet.</div>`;

    const wayForwardHtml = wayForward.length > 0
      ? wayForward.map(t => renderTaskItem(t, 'way-forward')).join('')
      : `<div style="text-align:center;color:var(--text-muted);font-style:italic;padding:1rem 0;font-size:0.88rem;">All tasks completed ✓</div>`;

    // Charts with delta badges
    const trackedCharts = (sl.trackedMetrics || []).map(m => {
      const entries = this.getMetricEntries(m.id);
      const deltaHtml = this.getMetricDeltaHtml(m, entries);
      return `
        <div class="presentation-chart-container">
          <div class="presentation-chart-title">${this.escapeHtml(m.name)}${deltaHtml}</div>
          <div class="presentation-chart-pane-svg">
            ${this.renderMetricChart(m, entries, { variant: 'expanded' })}
          </div>
        </div>
      `;
    }).join('');

    const groupCharts = (sl.metricGroups || []).map(g => `
      <div class="presentation-chart-container">
        <div class="presentation-chart-title">${this.escapeHtml(g.name)}</div>
        <div class="presentation-chart-pane-svg">
          ${this.renderMetricGroupChart(g, { variant: 'expanded' })}
        </div>
        <div class="presentation-chart-legend">
          ${this.renderMetricGroupLegend(g)}
        </div>
      </div>
    `).join('');

    const chartsHtml = (trackedCharts + groupCharts) || `
      <div style="text-align:center;color:var(--text-muted);font-style:italic;padding:1.5rem 0;font-size:0.88rem;">No metric data entered yet.</div>
    `;

    // Weekly dialogue (most recent 3)
    const dialogueEntries = this.getDialogueEntries(sl.id).slice(0, 3);
    let dialogueHtml = `
      <div class="dialogue-log-readonly" style="margin-top: 0.25rem;">
        ${dialogueEntries.length > 0 ? dialogueEntries.map(e => `
          <div class="dialogue-item-readonly">
            <div class="dialogue-meta-readonly">${this.escapeHtml(e.date)}</div>
            <div class="dialogue-content-readonly">${this.escapeHtml(e.text)}</div>
          </div>
        `).join('') : `
          <div class="dialogue-empty-readonly">
            No dialogue entries submitted.
          </div>
        `}
      </div>
    `;

    // HEDIS notes for PCSL
    if (sl.id === 'pcsl') {
      const hedisData = this.getHedisData('pcsl');
      const hedisNotes = hedisData.notes || '';
      if (hedisNotes.trim()) {
        dialogueHtml += `
          <div class="slide-panel-title" style="margin-top: 0.75rem;">
            <span>HEDIS Notes</span>
          </div>
          <div class="dialogue-log-readonly" style="margin-top: 0.25rem;">
            <div class="dialogue-item-readonly">
              <div class="dialogue-content-readonly">${this.escapeHtml(hedisNotes)}</div>
            </div>
          </div>
        `;
      }
    }

    // Trainee Care Pipeline for MSCoE
    if (sl.id === 'mscoe' && sl.traineeCareFlow) {
      dialogueHtml += `
        <div class="slide-panel-title" style="margin-top: 0.75rem;">
          <span>Trainee Care Pipeline</span>
        </div>
        <div style="margin-top: 0.25rem; overflow-x: auto;">
          <div style="display:flex;align-items:stretch;gap:4px;flex-wrap:nowrap;min-width:480px;">
            ${sl.traineeCareFlow.map((step, i) => `
              ${i > 0 ? '<div style="align-self:center;font-size:0.75rem;color:var(--gold);padding:0 2px;">→</div>' : ''}
              <div style="flex:1;padding:5px 6px;border:1px solid var(--border-subtle);border-radius:5px;background:var(--bg-primary);min-width:80px;box-shadow:0 1px 3px rgba(0,0,0,0.01);">
                <div style="font-size:0.72rem;font-weight:700;color:var(--gold);margin-bottom:1px;">${step.step}. ${this.escapeHtml(step.name)}</div>
                <div style="font-size:0.62rem;color:var(--text-muted);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${this.escapeHtml(step.description)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="slide-layout">
        <!-- Left Column: Tasks -->
        <div class="slide-panel">
          <div class="slide-panel-title">
            <span>Accomplishments</span>
            <span class="slide-panel-count">${accomplishments.length} completed</span>
          </div>
          <div class="slide-list">
            ${accomplishmentsHtml}
          </div>
          
          <div class="slide-panel-title" style="margin-top: 0.5rem;">
            <span>Way Forward</span>
            <span class="slide-panel-count">${wayForward.length} remaining</span>
          </div>
          <div class="slide-list">
            ${wayForwardHtml}
          </div>
        </div>
        
        <!-- Right Column: Metrics & Dialogue -->
        <div class="slide-panel">
          <div class="slide-panel-title">
            <span>Performance Trends</span>
          </div>
          <div class="presentation-chart-panel">
            ${chartsHtml}
          </div>
          
          <div class="slide-panel-title" style="margin-top: 0.5rem;">
            <span>Command Dialogue</span>
            <span class="slide-panel-count">${dialogueEntries.length} entries</span>
          </div>
          ${dialogueHtml}
        </div>
      </div>
    `;
  },

};

window.App = App;

// Initialize on DOM ready or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}

