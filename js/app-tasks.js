// DCCS Operational Framework - Task persistence, KPIs, status, notes, and cards
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
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

  renderKpiDateControl(taskId, kpiIndex, dateValue = '') {
    return `<span class="kpi-date-container" onclick="event.stopPropagation();">
      <span class="kpi-date-label">Completed:</span>
      <input class="kpi-date-picker" type="date" value="${this.escapeHtml(dateValue)}" onchange="App.changeKpiDate('${taskId}', '${kpiIndex}', this.value)" title="Change completion date">
    </span>`;
  },

  updateTaskKpiRow(taskId, kpiIndex, checked, dateValue = '') {
    const row = document.getElementById(`kpi-${taskId}-${kpiIndex}`);
    if (!row) return;

    const windowScroll = { x: window.scrollX, y: window.scrollY };
    const scrollParents = [];
    for (let parent = row.parentElement; parent; parent = parent.parentElement) {
      if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
        scrollParents.push({ element: parent, left: parent.scrollLeft, top: parent.scrollTop });
      }
    }
    const restoreScrollPosition = () => {
      scrollParents.forEach(({ element, left, top }) => {
        element.scrollLeft = left;
        element.scrollTop = top;
      });
      window.scrollTo(windowScroll.x, windowScroll.y);
    };
    const restoreSettledScrollPosition = () => {
      restoreScrollPosition();
      requestAnimationFrame(restoreScrollPosition);
    };

    const checkbox = row.querySelector('.kpi-checkbox');
    const label = row.querySelector('.kpi-label');
    let dateContainer = row.querySelector('.kpi-date-container');

    row.classList.toggle('checked', checked);
    checkbox?.classList.toggle('checked', checked);
    label?.classList.toggle('checked', checked);
    if (checkbox) checkbox.textContent = checked ? '✓' : '';

    if (!checked) {
      dateContainer?.remove();
      restoreSettledScrollPosition();
      return;
    }

    if (!dateContainer) {
      const actionButton = row.querySelector('.kpi-action-btn');
      if (actionButton) {
        actionButton.insertAdjacentHTML('beforebegin', this.renderKpiDateControl(taskId, kpiIndex, dateValue));
      } else {
        row.insertAdjacentHTML('beforeend', this.renderKpiDateControl(taskId, kpiIndex, dateValue));
      }
      dateContainer = row.querySelector('.kpi-date-container');
    }

    const dateInput = dateContainer?.querySelector('.kpi-date-picker');
    if (dateInput) dateInput.value = dateValue;
    restoreSettledScrollPosition();
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
    this.updateTaskKpiRow(taskId, kpiIndex, kpis[kpiIndex], kpiDates[kpiIndex] || '');
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
    this.updateTaskKpiRow(taskId, kpiIndex, true, kpiDates[kpiIndex] || '');
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
        btn.classList.add(status === 'not-reviewed' ? 'active-not-started' : 'active-' + status);
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
    let currentStatus = saved.status || task.status;
    if (currentStatus === 'not-started') {
      currentStatus = 'not-reviewed';
    }
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
              ? this.renderKpiDateControl(task.id, i, kpiDates[i] || '')
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
              ? this.renderKpiDateControl(task.id, idx, kpiDates[idx] || '')
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
              <button class="status-option ${currentStatus === 'not-reviewed' ? 'active-not-started' : ''}" data-status-task="${task.id}" data-status-value="not-reviewed" onclick="App.setTaskStatus('${task.id}','not-reviewed')">○ Not Started</button>
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

  });
}());
