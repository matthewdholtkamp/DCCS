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
      const entries = this.getMetricDisplayEntries(metric);
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
      let currentStatus = saved.status || task.status;
      if (currentStatus === 'not-started') {
        currentStatus = 'not-reviewed';
      }
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

    // Charts — ED gets Chart.js canvases, others keep SVG
    let trackedCharts = '';
    let groupCharts = '';

    if (sl.id === 'emergency') {
      trackedCharts = `
        <div class="presentation-chart-container">
          <div class="presentation-chart-title">Trends Over Time — Full History</div>
          <div class="er-chart-canvas-wrap" style="height:220px;position:relative;">
            <canvas id="pres-er-full-history"></canvas>
          </div>
          <div class="er-chart-insight" id="pres-er-full-insight"></div>
        </div>
        <div class="presentation-chart-container">
          <div class="presentation-chart-title">Trends Over Time — Last 30 Days</div>
          <div class="er-chart-canvas-wrap" style="height:220px;position:relative;">
            <canvas id="pres-er-last30"></canvas>
          </div>
          <div class="er-chart-insight" id="pres-er-last30-insight"></div>
        </div>
      `;
      // Schedule Chart.js draw after DOM is rendered
      setTimeout(() => this.drawEmergencyCharts('pres-'), 0);
    } else if (sl.id === 'mscoe') {
      trackedCharts = `
        <div class="presentation-chart-container">
          <div class="presentation-chart-title">Unit Volume Over Time — BDE / BN / CO Drill-Down</div>
          <div class="er-chart-canvas-wrap" style="height:220px;position:relative;">
            <canvas id="pres-mscoe-unit-volume"></canvas>
          </div>
          <div class="er-chart-insight" id="pres-mscoe-unit-volume-insight"></div>
        </div>
      `;
      setTimeout(() => {
        const store = this.getMetricStore();
        this.allPatients = (store['er-patients'] || []).map(p => ({ ...p, date: this.parseLocalDate(p.date) }));
        
        // Reset state for presentation slide
        this.uvState = {
          level:    'bde',
          bde:      null,
          bn:       null,
          gran:     'auto',
          loIdx:    null,
          hiIdx:    null,
        };
        
        // Initialize date bounds
        const set = new Set();
        this.allPatients.forEach(pat => {
          if (!pat.date) return;
          set.add(new Date(pat.date.getFullYear(), pat.date.getMonth(), pat.date.getDate()).getTime());
        });
        this.uvDateList = Array.from(set).sort((a,b)=>a-b);
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
    } else {
      trackedCharts = (sl.trackedMetrics || []).map(m => {
        const entries = this.getMetricDisplayEntries(m);
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

      groupCharts = (sl.metricGroups || []).map(g => `
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
    }

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
  });
}());
