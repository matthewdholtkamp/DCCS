// DCCS Operational Framework - Meeting mode
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
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
        const entries = this.getMetricDisplayEntries(m);
        const status = this.metricStatus(m, entries);
        dots.push(`<span class="meeting-status-dot ${status.tone}" title="${this.escapeHtml(m.name)}: ${status.label}"></span>`);
      });
    }
    
    // Group metrics
    if (sl.metricGroups) {
      sl.metricGroups.forEach(g => {
        g.series.forEach(s => {
          const entries = this.getMetricDisplayEntries({ ...s, period: g.period });
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
    
    const prompt = `Give me a concise 1/2 page executive sync brief specifically for the ${sl.name} (${sl.abbr || ''}). Summarize the BLUF, key metric highlights, and the most critical roadblocks.`;
    
    if (!window.AskDrHoltkamp.els || !window.AskDrHoltkamp.els.input) {
      console.warn("[AI Brief] AskDrHoltkamp elements not initialized. Initializing now...");
      window.AskDrHoltkamp.init();
    }
    
    if (!window.AskDrHoltkamp.isOpen) {
      window.AskDrHoltkamp.open();
    }
    
    const inputEl = window.AskDrHoltkamp.els.input;
    if (inputEl) {
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
          if (window.AskDrHoltkamp.isReady) {
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
            let currentStatus = saved.status || task.status;
            if (currentStatus === 'not-started') {
              currentStatus = 'not-reviewed';
            }
            const kpiChecks = saved.kpis || {};
            const kpiDates = saved.kpiDates || {};
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
                    const dateInput = checked
                      ? this.renderKpiDateControl(task.id, i, kpiDates[i] || '')
                      : '';
                    if (deleted) return '';
                    return `
                      <div class="kpi-interactive ${checked ? 'checked' : ''} ${deleted ? 'soft-deleted' : ''}" id="kpi-${task.id}-${i}" onclick="App.toggleKpi('${task.id}', '${i}')">
                        <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                        <div class="kpi-label ${checked ? 'checked' : ''} ${deleted ? 'soft-deleted' : ''}">${this.escapeHtml(k)}</div>
                        ${dateInput}
                      </div>`;
                  }).join('')}
                  ${(saved.customKpis || []).map((k, i) => {
                    const idx = `custom-${i}`;
                    const checked = !!kpiChecks[idx];
                    const dateInput = checked
                      ? this.renderKpiDateControl(task.id, idx, kpiDates[idx] || '')
                      : '';
                    return `
                      <div class="kpi-interactive custom-kpi ${checked ? 'checked' : ''}" id="kpi-${task.id}-${idx}" onclick="App.toggleKpi('${task.id}', '${idx}')">
                        <div class="kpi-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                        <div class="kpi-label ${checked ? 'checked' : ''}">${this.escapeHtml(k)}</div>
                        ${dateInput}
                      </div>`;
                  }).join('')}
                </div>
                
                <!-- Task Notes and Status Option -->
                <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div class="status-selector" style="display:flex; gap:4px;">
                    <button class="status-option ${currentStatus === 'complete' ? 'active-complete' : ''}" style="font-size:0.65rem; padding:3px 6px;" data-status-task="${task.id}" data-status-value="complete" onclick="App.setTaskStatus('${task.id}','complete')">✓ Complete</button>
                    <button class="status-option ${currentStatus === 'in-progress' ? 'active-in-progress' : ''}" style="font-size:0.65rem; padding:3px 6px;" data-status-task="${task.id}" data-status-value="in-progress" onclick="App.setTaskStatus('${task.id}','in-progress')">◉ In Progress</button>
                    <button class="status-option ${currentStatus === 'not-reviewed' ? 'active-not-started' : ''}" style="font-size:0.65rem; padding:3px 6px;" data-status-task="${task.id}" data-status-value="not-reviewed" onclick="App.setTaskStatus('${task.id}','not-reviewed')">○ Not Started</button>
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
            const entries = this.getMetricDisplayEntries(m);
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
              const entries = this.getMetricDisplayEntries({ ...series, period: group.period });
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
    
    const all = { ...this.getMetricStore() };
    const entries = Array.isArray(all[metricId]) ? [...all[metricId]] : [];
    entries.push({ date: dateInput.value, value: parsedVal });
    entries.sort((a, b) => a.date.localeCompare(b.date));
    all[metricId] = entries;
    Sync.saveMetricSeries([metricId], all);
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
    
    const all = { ...this.getMetricStore() };
    const entries = Array.isArray(all[seriesId]) ? [...all[seriesId]] : [];
    entries.push({ date: dateInput.value, value: parsedVal });
    entries.sort((a, b) => a.date.localeCompare(b.date));
    all[seriesId] = entries;
    Sync.saveMetricSeries([seriesId], all);
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
  });
}());
