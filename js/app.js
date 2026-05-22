// DCCS Operational Framework — Main Application
const App = {
  expandedMetricId: null,
  expandedMetricGroupId: null,

  init() {
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  route() {
    const hash = location.hash.slice(1) || '/';
    const main = document.getElementById('app');
    const parts = hash.split('/').filter(Boolean);
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
          <div style="display:flex;justify-content:center;gap:3rem;flex-wrap:wrap;">
            <div style="text-align:center;">
              <div class="landing-footer-name">${D.leader.name}</div>
              <div class="landing-footer-title">${D.leader.title}</div>
            </div>
            <div style="text-align:center;">
              <div class="landing-footer-name">${D.assistant.name}</div>
              <div class="landing-footer-title">${D.assistant.title}</div>
            </div>
          </div>
          <div style="margin-top:12px;font-size:0.75rem;color:var(--text-muted);">
            Motto: <span style="color:var(--gold);font-weight:600;">${D.motto}</span>
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
                <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:400;margin-top:6px;max-width:85%;">${loe.description}</span>
              </div>
            `).join('')}
          </div>

          <div class="state-box desired">
            <div class="state-label desired">2027 Desired State</div>
            <div class="state-text">${D.desiredState}</div>
          </div>
        </div>

        <div class="progression-map">
          <div class="progression-title">Operational Timeline — <span style="color:var(--gold);">Progression Map</span></div>
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
                <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;">${phase.description}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">HQ: ${phase.hq}</div>
                <div class="timeline-dp">
                  <span class="timeline-dp-icon">${phase.decisivePoint.status === 'complete' ? '✓' : '★'}</span>
                  <div>
                    <div style="font-weight:600;font-size:0.8rem;">Decisive Point: ${phase.decisivePoint.name}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${phase.decisivePoint.date}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="margin:2rem 0;text-align:center;">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:1rem;">Priority Populations</div>
          <div style="display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;">
            ${D.priorityPopulations.map((p, i) => `
              <div style="padding:8px 16px;background:var(--bg-card);border:1px solid ${i===0?'var(--border-accent)':'var(--border-subtle)'};border-radius:var(--radius);font-size:0.85rem;${i===0?'color:var(--gold);font-weight:700;':'color:var(--text-secondary);'}">
                ${i+1}. ${p}
              </div>
              ${i < D.priorityPopulations.length - 1 ? '<span style="color:var(--text-muted);">›</span>' : ''}
            `).join('')}
          </div>
        </div>

        <div style="margin-top:2rem;padding:1.25rem;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius);">
          <div style="font-size:0.85rem;font-weight:600;color:var(--gold);margin-bottom:4px;">Cross-Cutting Tasks (LOE 2: Ready Medical Force)</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);">${D.crossCuttingTasks.length} tasks apply across all service lines and remain visible within each service line detail view.</div>
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
        <div class="sl-detail-clinics" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:2rem;">
          ${sl.clinics.map(c => `<span class="clinic-tag">${c}</span>`).join('<span style="color:var(--border-subtle);">•</span>')}
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
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <span class="phase-badge ${phase.status}" style="font-size:11px;">${phase.status === 'complete' ? '✓' : phase.status === 'active' ? '★' : '◇'} Phase ${phase.id}: ${phase.name}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${phase.dateRange}</span>
                  </div>
                  ${phase.status === 'active' ? '<div class="timeline-you-are-here" style="font-size:11px;padding:4px 10px;margin-bottom:8px;">Current Phase</div>' : ''}
                  <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">${phaseTasks.length} service line tasks${phaseCC.length > 0 ? ' + ' + phaseCC.length + ' cross-cutting' : ''}</div>
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
    kpis[kpiIndex] = !kpis[kpiIndex];
    this.saveTaskData(taskId, { kpis });

    const row = document.getElementById(`kpi-${taskId}-${kpiIndex}`);
    const cb = row?.querySelector('.kpi-checkbox');
    const lb = row?.querySelector('.kpi-label');
    if (row) {
      row.classList.toggle('checked', kpis[kpiIndex]);
      cb?.classList.toggle('checked', kpis[kpiIndex]);
      lb?.classList.toggle('checked', kpis[kpiIndex]);
      if (cb) cb.textContent = kpis[kpiIndex] ? '✓' : '';
    }
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
    
    this.saveTaskData(taskId, { customKpis, kpis });
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
    const textarea = document.getElementById(`notes-input-${taskId}`);
    if (textarea) {
      this.saveTaskData(taskId, { notes: textarea.value });
      const indicator = document.getElementById(`notes-saved-${taskId}`);
      if (indicator) {
        indicator.classList.add('show');
        setTimeout(() => indicator.classList.remove('show'), 1500);
      }
    }
  },

  renderTaskCard(task) {
    const saved = this.getTaskData(task.id);
    const currentStatus = saved.status || task.status;
    const kpiChecks = saved.kpis || {};
    const deletedKpis = saved.deletedKpis || {};
    const notes = saved.notes || '';

    return `
      <div class="task-card" id="task-${task.id}">
        <div class="task-header">
          <div class="task-title">${task.title}</div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
            <span class="loe-tag loe-${task.loe}">LOE ${task.loe}</span>
            <span class="status-badge ${currentStatus}" id="badge-${task.id}">${this.statusLabel(currentStatus)}</span>
          </div>
        </div>
        <div class="task-desc">${task.description}</div>

        <!-- Interactive KPIs -->
        <div style="margin-top:8px;">
          ${(task.kpis || []).map((k, i) => {
            const checked = !!kpiChecks[i];
            const deleted = !!deletedKpis[i];
            return `
              <div class="kpi-interactive ${checked ? 'checked' : ''} ${deleted ? 'soft-deleted' : ''}" id="kpi-${task.id}-${i}" onclick="App.toggleKpi('${task.id}', '${i}')">
                <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                <div class="kpi-label ${checked ? 'checked' : ''} ${deleted ? 'soft-deleted' : ''}">${this.escapeHtml(k)}</div>
                <button class="kpi-action-btn" type="button" onclick="event.stopPropagation(); App.toggleBuiltInKpiDeleted('${task.id}', '${i}')" title="${deleted ? 'Restore framework KPI' : 'Line out framework KPI'}">${deleted ? 'Restore' : 'Line out'}</button>
              </div>`;
          }).join('')}
          ${(saved.customKpis || []).map((k, i) => {
            const idx = `custom-${i}`;
            const checked = !!kpiChecks[idx];
            return `
              <div class="kpi-interactive custom-kpi ${checked ? 'checked' : ''}" id="kpi-${task.id}-${idx}" onclick="App.toggleKpi('${task.id}', '${idx}')">
                <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                <div class="kpi-label ${checked ? 'checked' : ''}">${this.escapeHtml(k)}</div>
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
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
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
    if (!valInput || !valInput.value) return;
    const all = this.getMetricStore();
    const entries = all[metricId] || [];
    entries.push({ date: dateInput?.value || new Date().toISOString().slice(0, 10), value: parseFloat(valInput.value) });
    entries.sort((a, b) => a.date.localeCompare(b.date));
    all[metricId] = entries;
    this.saveMetricStore(all);
    valInput.value = '';
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
    const date = dateInput?.value || new Date().toISOString().slice(0, 10);
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
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isExpanded ? 4.5 : 3.5}" class="metric-chart-point">
        <title>Date: ${this.escapeHtml(p.entry.date)}&#10;Value: ${this.escapeHtml(this.formatMetricValue(metric, p.entry.value))}</title>
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
        <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${isExpanded ? 4.5 : 3.5}" class="metric-chart-point" style="fill:${series.color};">
          <title>${this.escapeHtml(series.name)}&#10;Date: ${this.escapeHtml(point.entry.date)}&#10;Value: ${this.escapeHtml(this.formatMetricValue(series, point.entry.value))}</title>
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
    const confirmed = window.confirm(`Delete the ${entry.date} entry for ${metricName}?`);
    if (!confirmed) return;

    entries.splice(entryIndex, 1);
    all[metricId] = entries;
    this.saveMetricStore(all);
    this.refreshMetricDisplay(metricId);
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

    const confirmed = window.confirm(`Delete the ${entry.date} ${series.name} entry?`);
    if (!confirmed) return;

    entries.splice(entryIndex, 1);
    all[series.id] = entries;
    this.saveMetricStore(all);
    this.refreshMetricGroupDisplay(groupId);
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
            <input type="date" id="metric-date-${metric.id}" value="${new Date().toISOString().slice(0, 10)}">
          </label>
          <label>
            <span>Value</span>
            <input type="number" step="any" id="metric-val-${metric.id}" placeholder="${this.escapeHtml(metric.unit)}">
          </label>
          <button type="submit">Add</button>
        </form>

        <details class="metric-log">
          <summary id="metric-summary-${metric.id}">Data log (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})</summary>
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
            <input type="date" id="metric-group-date-${group.id}" value="${new Date().toISOString().slice(0, 10)}">
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
      date: new Date().toISOString().slice(0, 10),
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
    const today = new Date().toISOString().slice(0, 10);
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

};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
