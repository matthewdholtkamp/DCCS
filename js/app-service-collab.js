// DCCS Operational Framework - HEDIS, tracked metric container, dialogue, and service collaboration widgets
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
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
    // Custom Chart.js/table renderers
    if (sl.id === 'emergency') {
      return this.renderEmergencyTrackedMetrics(sl);
    }
    if (sl.id === 'mscoe') {
      return this.renderMscoeTrackedMetrics(sl);
    }

    const metrics = sl.trackedMetrics || [];
    const featured = metrics.filter(metric => metric.featured);
    const standard = metrics.filter(metric => !metric.featured);
    const groups = sl.metricGroups || [];
    const periods = [...metrics.map(metric => metric.period), ...groups.map(group => group.period)].filter(Boolean);
    const trackerLabel = groups.some(group => group.period === 'day') || periods.every(period => period === 'day')
      ? 'Daily Tracked Metrics'
      : periods.length && periods.every(period => period === 'month')
        ? 'Monthly Tracked Metrics'
        : periods.includes('month')
          ? 'Tracked Metrics'
          : 'Weekly Tracked Metrics';
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
    const text = ta.value.trim();
    const entries = this.getDialogueEntries(slId);
    
    // Capture before state
    const beforeState = entries.map(e => ({ ...e }));
    
    const user = this.getCurrentUser();
    entries.unshift({
      date: this.getLocalToday(),
      text: text,
      by: user
    });
    Sync.saveDialogueEntries(slId, entries);
    ta.value = '';
    this.updateDialogueList(slId, entries);
    
    this.logAudit('add_dialogue', slId, '', text);
    this.showUndoToast(`Added dialogue entry`, () => {
      Sync.saveDialogueEntries(slId, beforeState);
      this.updateDialogueList(slId, beforeState);
      this.logAudit('undo_dialogue', slId, text, 'restored previous state');
    });
  },

  deleteDialogueEntry(slId, index) {
    const entries = this.getDialogueEntries(slId);
    const beforeState = entries.map(e => ({ ...e }));
    const removed = entries[index];
    if (!removed) return;
    
    entries.splice(index, 1);
    Sync.saveDialogueEntries(slId, entries);
    this.updateDialogueList(slId, entries);
    
    this.logAudit('delete_dialogue', slId, removed.text, '');
    this.showUndoToast(`Deleted dialogue entry`, () => {
      Sync.saveDialogueEntries(slId, beforeState);
      this.updateDialogueList(slId, beforeState);
      this.logAudit('undo_dialogue', slId, 'restored deleted entry', removed.text);
    });
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
    const beforeState = entries.map(e => ({ ...e }));
    if (entries[index]) {
      const beforeText = entries[index].text;
      const user = this.getCurrentUser();
      entries[index] = { ...entries[index], text: val, by: user };
      Sync.saveDialogueEntries(slId, entries);
      
      this.logAudit('edit_dialogue', slId, beforeText, val);
      this.showUndoToast(`Updated dialogue entry`, () => {
        Sync.saveDialogueEntries(slId, beforeState);
        this.updateDialogueList(slId, beforeState);
        this.logAudit('undo_dialogue', slId, val, beforeText);
      });
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

  });
}());
