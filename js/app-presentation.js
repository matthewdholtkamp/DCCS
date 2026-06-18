// DCCS Operational Framework - Presentation mode
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
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

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    
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
        const entries = this.getMetricDisplayEntries(m);
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
          const entries = this.getMetricDisplayEntries({ ...s, period: g.period });
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

  getPresentationTaskStatus(task) {
    const saved = this.getTaskData(task.id);
    let status = saved.status || task.status || 'not-reviewed';
    if (status === 'not-started') status = 'not-reviewed';
    return status;
  },

  getPresentationTaskKpiSummary(task) {
    if (task.id.startsWith('hedis-action-')) {
      return { completed: 0, total: 0, label: '' };
    }

    const saved = this.getTaskData(task.id);
    const kpiChecks = saved.kpis || {};
    const deletedKpis = saved.deletedKpis || {};
    const customKpis = saved.customKpis || [];
    const builtIns = task.kpis || [];
    const visibleBuiltIns = builtIns.filter((_, i) => !deletedKpis[i]);
    const completedBuiltIns = builtIns.filter((_, i) => !deletedKpis[i] && kpiChecks[i]).length;
    const completedCustom = customKpis.filter((_, i) => kpiChecks[`custom-${i}`]).length;
    const total = visibleBuiltIns.length + customKpis.length;
    const completed = completedBuiltIns + completedCustom;
    return {
      completed,
      total,
      label: total > 0 ? `${completed}/${total} milestones` : ''
    };
  },

  getPresentationTasks(sl) {
    const tasks = [
      ...(sl.tasks || []).map(task => ({ ...task, _briefSource: 'service' })),
      ...(FRAMEWORK.crossCuttingTasks || []).map(task => ({ ...task, _briefSource: 'cross' }))
    ];

    if (sl.id === 'pcsl') {
      const hedisData = this.getHedisData('pcsl');
      const kpiChecks = hedisData.kpis || {};
      const customKpis = hedisData.customKpis || [];
      const currentPhase = FRAMEWORK.currentPhase || (this.getCurrentPhaseIndex() + 1);
      customKpis.forEach((title, i) => {
        const checked = !!kpiChecks[`custom-${i}`];
        tasks.push({
          id: `hedis-action-${i}`,
          title,
          description: 'HEDIS action item',
          status: checked ? 'complete' : 'in-progress',
          phase: currentPhase,
          loe: 1,
          kpis: [],
          _briefSource: 'hedis'
        });
      });
    }

    return tasks;
  },

  sortPresentationTasks(tasks) {
    const statusRank = { 'in-progress': 0, 'not-reviewed': 1, 'upcoming': 2, 'complete': 3 };
    return [...tasks].sort((a, b) => {
      const aMajor = (a.majorKpiIndices || []).length > 0 ? 0 : 1;
      const bMajor = (b.majorKpiIndices || []).length > 0 ? 0 : 1;
      if (aMajor !== bMajor) return aMajor - bMajor;
      const aStatus = statusRank[this.getPresentationTaskStatus(a)] ?? 4;
      const bStatus = statusRank[this.getPresentationTaskStatus(b)] ?? 4;
      if (aStatus !== bStatus) return aStatus - bStatus;
      return (a.phase || 9) - (b.phase || 9);
    });
  },

  renderPresentationTaskList(tasks, tone, emptyText, limit = 3) {
    if (!tasks.length) {
      return `<div class="brief-empty">${this.escapeHtml(emptyText)}</div>`;
    }

    const visible = this.sortPresentationTasks(tasks).slice(0, limit);
    const hiddenCount = Math.max(0, tasks.length - visible.length);

    return `
      <div class="brief-task-list ${tone}">
        ${visible.map(task => {
          const kpi = this.getPresentationTaskKpiSummary(task);
          const sourceClass = task._briefSource || (task.id.startsWith('cc-') ? 'cross' : 'service');
          const sourceLabel = sourceClass === 'cross' ? 'Cross-cutting' : sourceClass === 'hedis' ? 'HEDIS' : `Phase ${task.phase || '-'}`;
          return `
            <div class="brief-task-item ${tone}">
              <div class="brief-task-main">
                <span class="brief-task-title">${this.escapeHtml(task.title)}</span>
                <span class="brief-task-desc">${this.escapeHtml(task.description || '')}</span>
              </div>
              <div class="brief-task-meta">
                <span class="brief-task-tag ${sourceClass}">${this.escapeHtml(sourceLabel)}</span>
                ${kpi.label ? `<span class="brief-task-kpi">${this.escapeHtml(kpi.label)}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
        ${hiddenCount > 0 ? `<div class="brief-more">+${hiddenCount} more</div>` : ''}
      </div>
    `;
  },

  getCurrentPresentationPhase() {
    return FRAMEWORK.phases[this.getCurrentPhaseIndex()] || FRAMEWORK.phases.find(phase => phase.status === 'active') || FRAMEWORK.phases[0];
  },

  getPresentationMetricItems(sl) {
    const items = [];
    (sl.trackedMetrics || []).forEach(metric => {
      items.push({
        metric,
        entries: this.getMetricDisplayEntries(metric),
        label: metric.name,
        accent: metric.color || 'var(--gold)'
      });
    });

    (sl.metricGroups || []).forEach(group => {
      (group.series || []).forEach(series => {
        const metric = { ...series, period: group.period, aggregation: series.aggregation || group.aggregation };
        items.push({
          metric,
          entries: this.getMetricDisplayEntries(metric),
          label: series.name,
          groupName: group.name,
          accent: series.color || 'var(--gold)'
        });
      });
    });

    return items;
  },

  getPresentationMetricGoalText(metric) {
    if (metric.goal === null || metric.goal === undefined) {
      if (metric.direction === 'higher') return 'End state: higher is better';
      if (metric.direction === 'lower') return 'End state: lower is better';
      return 'Tracked for trend';
    }
    if (metric.direction === 'lower') return `End state: under ${this.formatMetricValue(metric, metric.goal)}`;
    if (metric.direction === 'higher') return `End state: at least ${this.formatMetricValue(metric, metric.goal)}`;
    return `Goal: ${this.formatMetricValue(metric, metric.goal)}`;
  },

  formatPresentationDelta(metric, delta) {
    if (!Number.isFinite(delta)) return 'No delta';
    if (delta === 0) return `0 ${this.metricUnitLabel(metric, 0)}`.trim();
    const sign = delta > 0 ? '+' : '-';
    return `${sign}${this.formatMetricValue(metric, Math.abs(delta))}`;
  },

  getPresentationDeltaTone(metric, delta) {
    if (!Number.isFinite(delta) || delta === 0) return 'stable';
    if (metric.direction === 'lower') return delta < 0 ? 'improving' : 'declining';
    if (metric.direction === 'higher') return delta > 0 ? 'improving' : 'declining';
    return 'tracked';
  },

  getPresentationMetricMovement(metric, entries) {
    const baseline = entries[0] || null;
    const latest = entries[entries.length - 1] || null;
    const previous = entries[entries.length - 2] || null;
    const baselineDelta = baseline && latest ? Math.round((Number(latest.value) - Number(baseline.value)) * 10) / 10 : NaN;
    const lastDelta = previous && latest ? Math.round((Number(latest.value) - Number(previous.value)) * 10) / 10 : NaN;
    const tone = this.getPresentationDeltaTone(metric, baselineDelta);
    return {
      baseline,
      latest,
      previous,
      baselineDelta,
      lastDelta,
      tone,
      goalText: this.getPresentationMetricGoalText(metric)
    };
  },

  renderPresentationMetricMovementCard(item) {
    const metric = item.metric;
    const movement = this.getPresentationMetricMovement(metric, item.entries);
    const style = item.accent ? ` style="--metric-accent:${item.accent};"` : '';

    if (!movement.latest) {
      return `
        <article class="brief-metric-card no-data"${style}>
          <div class="brief-metric-head">
            <span>${this.escapeHtml(item.label)}</span>
            ${item.groupName ? `<em>${this.escapeHtml(item.groupName)}</em>` : ''}
          </div>
          <strong>No data entered</strong>
          <small>${this.escapeHtml(movement.goalText)}</small>
        </article>
      `;
    }

    const baselineLabel = movement.baseline ? this.metricEntryDateLabel(movement.baseline) : 'Start';
    const latestLabel = this.metricEntryDateLabel(movement.latest);
    const baselineValue = movement.baseline ? this.formatMetricValue(metric, movement.baseline.value) : 'No baseline';
    const latestValue = this.formatMetricValue(metric, movement.latest.value);
    const baselineDelta = Number.isFinite(movement.baselineDelta) ? this.formatPresentationDelta(metric, movement.baselineDelta) : 'Need 2 points';
    const lastDelta = Number.isFinite(movement.lastDelta) ? this.formatPresentationDelta(metric, movement.lastDelta) : 'Need 2 points';

    return `
      <article class="brief-metric-card ${movement.tone}"${style}>
        <div class="brief-metric-head">
          <span>${this.escapeHtml(item.label)}</span>
          ${item.groupName ? `<em>${this.escapeHtml(item.groupName)}</em>` : ''}
        </div>
        <div class="brief-metric-values">
          <div>
            <span>Start</span>
            <strong>${this.escapeHtml(baselineValue)}</strong>
            <small>${this.escapeHtml(baselineLabel)}</small>
          </div>
          <div>
            <span>Now</span>
            <strong>${this.escapeHtml(latestValue)}</strong>
            <small>${this.escapeHtml(latestLabel)}</small>
          </div>
        </div>
        <div class="brief-metric-deltas">
          <span class="${movement.tone}">From start: ${this.escapeHtml(baselineDelta)}</span>
          <span>Last move: ${this.escapeHtml(lastDelta)}</span>
        </div>
        <div class="brief-metric-goal">${this.escapeHtml(movement.goalText)}</div>
      </article>
    `;
  },

  renderPresentationMetricMovementGrid(sl) {
    const items = this.getPresentationMetricItems(sl);
    if (!items.length) {
      return `
        <div class="brief-empty metric-empty">
          No tracked movement metrics entered for this section yet.
        </div>
      `;
    }
    return `
      <div class="brief-metric-grid">
        ${items.map(item => this.renderPresentationMetricMovementCard(item)).join('')}
      </div>
    `;
  },

  getServiceLineBriefModel(sl) {
    const currentPhase = this.getCurrentPresentationPhase();
    const currentPhaseId = currentPhase?.id || FRAMEWORK.currentPhase || 2;
    const tasks = this.getPresentationTasks(sl);
    const phaseOneTasks = tasks.filter(task => task.phase === 1);
    const completedPhaseOne = phaseOneTasks.filter(task => this.getPresentationTaskStatus(task) === 'complete');
    const completedTasks = tasks.filter(task => this.getPresentationTaskStatus(task) === 'complete');
    const currentTasks = tasks.filter(task => task.phase === currentPhaseId);
    const currentOpenTasks = currentTasks.filter(task => this.getPresentationTaskStatus(task) !== 'complete');
    const futureOpenTasks = tasks.filter(task => (task.phase || currentPhaseId) >= currentPhaseId && this.getPresentationTaskStatus(task) !== 'complete');

    return {
      tasks,
      currentPhase,
      startTasks: completedPhaseOne.length ? completedPhaseOne : phaseOneTasks,
      nowTasks: currentOpenTasks.length ? currentOpenTasks : currentTasks.filter(task => this.getPresentationTaskStatus(task) === 'complete'),
      endTasks: futureOpenTasks.length ? futureOpenTasks : tasks.filter(task => (task.phase || 0) >= currentPhaseId),
      completedTasks,
      completedCount: completedTasks.length,
      totalCount: tasks.length
    };
  },

  renderPresentationCharts(sl) {
    if (sl.id === 'emergency') {
      setTimeout(() => this.drawEmergencyCharts('pres-'), 0);
      return `
        <div class="presentation-chart-container">
          <div class="presentation-chart-title">Trends Over Time - Full History</div>
          <div class="er-chart-canvas-wrap" style="height:220px;position:relative;">
            <canvas id="pres-er-full-history"></canvas>
          </div>
          <div class="er-chart-insight" id="pres-er-full-insight"></div>
        </div>
        <div class="presentation-chart-container">
          <div class="presentation-chart-title">Trends Over Time - Last 30 Days</div>
          <div class="er-chart-canvas-wrap" style="height:220px;position:relative;">
            <canvas id="pres-er-last30"></canvas>
          </div>
          <div class="er-chart-insight" id="pres-er-last30-insight"></div>
        </div>
      `;
    }

    if (sl.id === 'mscoe') {
      setTimeout(() => {
        const store = this.getMetricStore();
        this.allPatients = (store['er-patients'] || []).map(p => ({ ...p, date: this.parseLocalDate(p.date) }));
        this.uvState = {
          level: 'bde',
          bde: null,
          bn: null,
          gran: 'auto',
          loIdx: null,
          hiIdx: null,
        };

        const set = new Set();
        this.allPatients.forEach(pat => {
          if (!pat.date) return;
          set.add(new Date(pat.date.getFullYear(), pat.date.getMonth(), pat.date.getDate()).getTime());
        });
        this.uvDateList = Array.from(set).sort((a, b) => a - b);
        if (this.uvDateList.length) {
          const maxIdx = this.uvDateList.length - 1;
          const lastTs = this.uvDateList[maxIdx];
          const cutoffTs = lastTs - 29 * 24 * 60 * 60 * 1000;
          let defLo = 0;
          for (let i = 0; i <= maxIdx; i++) {
            if (this.uvDateList[i] >= cutoffTs) { defLo = i; break; }
          }
          this.uvState.loIdx = defLo;
          this.uvState.hiIdx = maxIdx;
        } else {
          this.uvState.loIdx = this.uvState.hiIdx = 0;
        }

        this.renderUnitVolumeChart('pres-');
      }, 0);

      return `
        <div class="presentation-chart-container">
          <div class="presentation-chart-title">Unit Volume Over Time - BDE / BN / CO Drill-Down</div>
          <div class="er-chart-canvas-wrap" style="height:220px;position:relative;">
            <canvas id="pres-mscoe-unit-volume"></canvas>
          </div>
          <div class="er-chart-insight" id="pres-mscoe-unit-volume-insight"></div>
        </div>
      `;
    }

    const trackedCharts = (sl.trackedMetrics || []).map(metric => {
      const entries = this.getMetricDisplayEntries(metric);
      return `
        <div class="presentation-chart-container">
          <div class="presentation-chart-title">${this.escapeHtml(metric.name)}${this.getMetricDeltaHtml(metric, entries)}</div>
          <div class="presentation-chart-pane-svg">
            ${this.renderMetricChart(metric, entries, { variant: 'expanded' })}
          </div>
        </div>
      `;
    }).join('');

    const groupCharts = (sl.metricGroups || []).map(group => `
      <div class="presentation-chart-container">
        <div class="presentation-chart-title">${this.escapeHtml(group.name)}</div>
        <div class="presentation-chart-pane-svg">
          ${this.renderMetricGroupChart(group, { variant: 'expanded' })}
        </div>
        <div class="presentation-chart-legend">
          ${this.renderMetricGroupLegend(group)}
        </div>
      </div>
    `).join('');

    return (trackedCharts + groupCharts) || `
      <div class="brief-empty metric-empty">
        No metric data entered yet.
      </div>
    `;
  },

  renderPresentationDialogue(sl) {
    const dialogueEntries = this.getDialogueEntries(sl.id).slice(0, 3);
    let dialogueHtml = `
      <div class="dialogue-log-readonly brief-dialogue-log">
        ${dialogueEntries.length > 0 ? dialogueEntries.map(entry => `
          <div class="dialogue-item-readonly">
            <div class="dialogue-meta-readonly">${this.escapeHtml(entry.date)}</div>
            <div class="dialogue-content-readonly">${this.escapeHtml(entry.text)}</div>
          </div>
        `).join('') : `
          <div class="dialogue-empty-readonly">
            No dialogue entries submitted.
          </div>
        `}
      </div>
    `;

    if (sl.id === 'pcsl') {
      const hedisData = this.getHedisData('pcsl');
      const hedisNotes = hedisData.notes || '';
      if (hedisNotes.trim()) {
        dialogueHtml += `
          <div class="slide-panel-title compact-title">
            <span>HEDIS Notes</span>
          </div>
          <div class="dialogue-log-readonly brief-dialogue-log">
            <div class="dialogue-item-readonly">
              <div class="dialogue-content-readonly">${this.escapeHtml(hedisNotes)}</div>
            </div>
          </div>
        `;
      }
    }

    if (sl.id === 'mscoe' && sl.traineeCareFlow) {
      dialogueHtml += `
        <div class="slide-panel-title compact-title">
          <span>Trainee Care Pipeline</span>
        </div>
        <div class="brief-care-flow">
          ${sl.traineeCareFlow.map((step, i) => `
            ${i > 0 ? '<div class="brief-care-arrow">-&gt;</div>' : ''}
            <div class="brief-care-step">
              <strong>${step.step}. ${this.escapeHtml(step.name)}</strong>
              <span>${this.escapeHtml(step.description)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    return { dialogueHtml, count: dialogueEntries.length };
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
      <div class="presentation-container slide-fade-in" tabindex="-1">
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

    const resetPresentationScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      el.scrollTop = 0;
      const container = el.querySelector('.presentation-container');
      const presentationBody = el.querySelector('.presentation-body');
      if (container) container.scrollTop = 0;
      if (container && typeof container.focus === 'function') container.focus({ preventScroll: true });
      if (presentationBody) presentationBody.scrollTop = 0;
    };
    resetPresentationScroll();
    requestAnimationFrame(resetPresentationScroll);
    setTimeout(resetPresentationScroll, 50);
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
        const entries = this.getMetricDisplayEntries(m);
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
    const allTasks = [
      ...FRAMEWORK.serviceLines.flatMap(sl => (sl.tasks || []).map(task => ({ ...task, _briefSource: 'service' }))),
      ...(FRAMEWORK.crossCuttingTasks || []).map(task => ({ ...task, _briefSource: 'cross' }))
    ];
    const totalTaskCount = allTasks.length;
    const totalCompleted = allTasks.filter(task => this.getPresentationTaskStatus(task) === 'complete').length;
    const totalPct = totalTaskCount > 0 ? Math.round((totalCompleted / totalTaskCount) * 100) : 0;
    const currentPhase = this.getCurrentPresentationPhase();
    const currentPhaseIdx = this.getCurrentPhaseIndex();

    const phaseProgressHtml = FRAMEWORK.phases.map((phase, i) => {
      const phaseTasks = allTasks.filter(task => task.phase === phase.id);
      const phaseTotal = phaseTasks.length;
      const phaseDone = phaseTasks.filter(task => this.getPresentationTaskStatus(task) === 'complete').length;
      const phasePct = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;
      const statusClass = i < currentPhaseIdx ? 'complete' : i === currentPhaseIdx ? 'active' : 'upcoming';
      const statusLabel = statusClass === 'complete' ? 'Complete' : statusClass === 'active' ? 'Active' : 'Upcoming';

      return `
        <div class="exec-phase-row ${statusClass}">
          <div class="exec-phase-header">
            <span class="exec-phase-name">Phase ${phase.id}: ${this.escapeHtml(phase.name)}</span>
            <span class="exec-phase-stats"><span class="exec-phase-tag ${statusClass}">${statusLabel}</span><strong>${phaseDone}/${phaseTotal}</strong> (${phasePct}%)</span>
          </div>
          <p>${this.escapeHtml(phase.description || '')}</p>
          <div class="exec-progress-bar-outer">
            <div class="exec-progress-bar-inner ${statusClass}" style="width: ${phasePct}%;"></div>
          </div>
        </div>
      `;
    }).join('');

    const nextTasks = allTasks.filter(task => {
      const status = this.getPresentationTaskStatus(task);
      return status !== 'complete' && (task.phase || currentPhase?.id || 1) >= (currentPhase?.id || 1);
    });

    const slCardsHtml = FRAMEWORK.serviceLines.map((sl, idx) => {
      const health = this.getServiceLineHealth(sl);
      const metrics = this.getPresentationMetricItems(sl);
      const metricsWithData = metrics.filter(item => item.entries.length > 0).length;
      const metricText = metrics.length ? `${metricsWithData}/${metrics.length} metrics` : 'chart-only section';

      return `
        <button class="exec-sl-card" type="button" onclick="App.goToSlide(${idx + 1})" title="View ${this.escapeHtml(sl.name)} details">
          <div class="exec-sl-abbr">${this.escapeHtml(sl.abbr || sl.id.toUpperCase())}</div>
          <div class="exec-sl-info">
            <div class="exec-sl-name">${this.escapeHtml(sl.name)}</div>
            <div class="exec-sl-leader">${this.escapeHtml(sl.leader)}</div>
          </div>
          <div class="exec-sl-status">
            <span class="exec-sl-status-badge ${health.status}">${this.escapeHtml(health.statusLabel)}</span>
            <span class="exec-sl-task-progress">${health.completedTasks}/${health.totalTasks} tasks | ${this.escapeHtml(metricText)}</span>
          </div>
        </button>
      `;
    }).join('');

    return `
      <div class="exec-brief-layout">
        <section class="slide-panel exec-story-panel">
          <div class="brief-hero">
            <span class="brief-overline">Commander Brief</span>
            <h2>Start State to Desired End State</h2>
            <p>${this.escapeHtml(FRAMEWORK.mission)}</p>
          </div>

          <div class="brief-state-row exec-state-row">
            <article class="brief-state-card start">
              <span>Starting State</span>
              <p>${this.escapeHtml(FRAMEWORK.currentState)}</p>
            </article>
            <article class="brief-state-card now">
              <span>Now</span>
              <strong>Phase ${currentPhase?.id || '-'}: ${this.escapeHtml(currentPhase?.name || 'Current')}</strong>
              <p>${this.escapeHtml(currentPhase?.description || '')}</p>
              <div class="brief-stat-line">
                <strong>${totalPct}%</strong>
                <span>${totalCompleted}/${totalTaskCount} campaign tasks complete</span>
              </div>
            </article>
            <article class="brief-state-card end">
              <span>Desired End State</span>
              <p>${this.escapeHtml(FRAMEWORK.desiredState)}</p>
            </article>
          </div>
        </section>

        <section class="slide-panel exec-progress-panel">
          <div class="slide-panel-title">
            <span>Campaign Movement</span>
            <span class="slide-panel-count">${totalCompleted}/${totalTaskCount} complete</span>
          </div>
          <div class="exec-progress-bar-outer executive-total">
            <div class="exec-progress-bar-inner active" style="width: ${totalPct}%;"></div>
          </div>
          <div class="exec-phase-stack">
            ${phaseProgressHtml}
          </div>
          <div class="slide-panel-title compact-title">
            <span>Next Commander Attention</span>
            <span class="slide-panel-count">${Math.min(nextTasks.length, 4)} shown</span>
          </div>
          ${this.renderPresentationTaskList(nextTasks, 'now', 'No open commander-attention items.', 4)}
        </section>

        <section class="slide-panel exec-service-panel">
          <div class="slide-panel-title">
            <span>Service-Line Readiness</span>
            <span class="slide-panel-count">${FRAMEWORK.serviceLines.length} sections</span>
          </div>
          <div class="exec-sl-grid">
            ${slCardsHtml}
          </div>
        </section>
      </div>
    `;
  },

  getServiceLineSlideHtml(sl) {
    const model = this.getServiceLineBriefModel(sl);
    const progressPct = model.totalCount > 0 ? Math.round((model.completedCount / model.totalCount) * 100) : 0;
    const metricItems = this.getPresentationMetricItems(sl);
    const metricDataCount = metricItems.filter(item => item.entries.length > 0).length;
    const dialogue = this.renderPresentationDialogue(sl);

    return `
      <div class="service-brief-layout">
        <section class="slide-panel service-story-panel">
          <div class="service-brief-heading">
            <span class="brief-overline">${this.escapeHtml(sl.abbr || sl.name)} Commander Update</span>
            <h2>${this.escapeHtml(this.serviceLineFunction(sl))}</h2>
            <div class="brief-stat-line">
              <strong>${progressPct}%</strong>
              <span>${model.completedCount}/${model.totalCount} tasks complete | ${metricDataCount}/${metricItems.length || 0} metric series populated</span>
            </div>
          </div>

          <div class="service-state-stack">
            <article class="brief-state-card start">
              <span>Start</span>
              <p>Baseline and phase-one stabilization work that defined the initial problem set.</p>
              ${this.renderPresentationTaskList(model.startTasks, 'start', 'No phase-one baseline tasks defined.', 3)}
            </article>

            <article class="brief-state-card now">
              <span>Now</span>
              <strong>Phase ${model.currentPhase?.id || '-'}: ${this.escapeHtml(model.currentPhase?.name || 'Current')}</strong>
              <p>${this.escapeHtml(model.currentPhase?.description || '')}</p>
              ${this.renderPresentationTaskList(model.nowTasks, 'now', 'No current-phase work open.', 3)}
            </article>

            <article class="brief-state-card end">
              <span>End State</span>
              <p>Active and upcoming KPIs that define movement toward the desired operating model.</p>
              ${this.renderPresentationTaskList(model.endTasks, 'end', 'No remaining end-state tasks.', 3)}
            </article>
          </div>

          <div class="slide-panel-title compact-title">
            <span>Command Dialogue</span>
            <span class="slide-panel-count">${dialogue.count} entries</span>
          </div>
          ${dialogue.dialogueHtml}
        </section>

        <section class="slide-panel service-metrics-panel">
          <div class="slide-panel-title">
            <span>Metric Movement</span>
            <span class="slide-panel-count">start -> now -> end state</span>
          </div>
          ${this.renderPresentationMetricMovementGrid(sl)}

          <div class="slide-panel-title compact-title">
            <span>Trend Evidence</span>
            <span class="slide-panel-count">existing charts</span>
          </div>
          <div class="presentation-chart-panel brief-chart-panel">
            ${this.renderPresentationCharts(sl)}
          </div>
        </section>
      </div>
    `;
  },
  });
}());
