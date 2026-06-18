// DCCS Operational Framework - Core shell, identity, audit, and shared helpers
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
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

  parseLocalDate(s) {
    if (!s) return null;
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    
    let dateStr = s;
    if (typeof s === 'string') {
      if (s.includes('T')) {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) {
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const r = String(dt.getDate()).padStart(2, '0');
          dateStr = `${y}-${m}-${r}`;
        } else {
          dateStr = s.substring(0, 10);
        }
      }
    }
    
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d);
    }
    
    const fallback = new Date(s);
    if (!isNaN(fallback.getTime())) {
      return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
    }
    return fallback;
  },

  // ===== PHASE 4: User Identity =====
  KNOWN_USERS: [
    'LTC Holtkamp',
    'SSG Holloway',
    'MAJ Tobin',
    'LTC Weir',
    'Dr. Fellwock',
    'MAJ Henderson'
  ],

  getCurrentUser() {
    return localStorage.getItem('dccs-user') || 'Unknown';
  },

  setCurrentUser(name) {
    localStorage.setItem('dccs-user', name);
    const el = document.getElementById('nav-user-name');
    if (el) el.textContent = name;
  },

  initUserChip() {
    const chip = document.getElementById('nav-user-chip');
    if (!chip) return;

    const saved = this.getCurrentUser();
    const nameEl = document.getElementById('nav-user-name');
    if (nameEl) nameEl.textContent = saved;

    // Build dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'nav-user-dropdown';
    dropdown.id = 'nav-user-dropdown';

    this.KNOWN_USERS.forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      if (name === saved) btn.classList.add('active');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setCurrentUser(name);
        dropdown.classList.remove('open');
        dropdown.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      dropdown.appendChild(btn);
    });

    // "Other…" free text
    const otherInput = document.createElement('input');
    otherInput.type = 'text';
    otherInput.placeholder = 'Other…';
    otherInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = otherInput.value.trim();
        if (val) {
          this.setCurrentUser(val);
          dropdown.classList.remove('open');
          dropdown.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        }
      }
      e.stopPropagation();
    });
    otherInput.addEventListener('click', (e) => e.stopPropagation());
    dropdown.appendChild(otherInput);

    chip.appendChild(dropdown);

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
    });
  },

  // ===== PHASE 4: Audit Log =====
  async logAudit(action, target, summaryBefore, summaryAfter) {
    const entry = {
      at: new Date().toISOString(),
      by: this.getCurrentUser(),
      action,
      target,
      summaryBefore: String(summaryBefore || '').substring(0, 300),
      summaryAfter: String(summaryAfter || '').substring(0, 300)
    };

    // Store in local memory for the Recent Activity section
    if (!this._auditLog) this._auditLog = [];
    this._auditLog.unshift(entry);
    if (this._auditLog.length > 50) this._auditLog = this._auditLog.slice(0, 50);

    // Write to Firestore if available
    if (window.Sync && Sync.enabled && Sync.db) {
      try {
        await Sync.db.collection('dccs_data').doc('audit').collection('events').add({
          ...entry,
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.warn('DCCS Audit: Failed to write audit log:', e);
      }
    }
  },

  // ===== PHASE 4: Undo Toast =====
  _undoTimer: null,

  showUndoToast(message, undoCallback) {
    let toast = document.getElementById('dccs-undo-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dccs-undo-toast';
      toast.className = 'dccs-undo-toast';
      toast.innerHTML = `
        <span class="toast-msg"></span>
        <button class="toast-undo-btn" type="button">Undo</button>
      `;
      document.body.appendChild(toast);
    }

    if (this._undoTimer) {
      clearTimeout(this._undoTimer);
      this._undoTimer = null;
    }

    const msgEl = toast.querySelector('.toast-msg');
    const undoBtn = toast.querySelector('.toast-undo-btn');
    msgEl.textContent = '✓ ' + message;

    // Clone to remove old listeners
    const newBtn = undoBtn.cloneNode(true);
    undoBtn.parentNode.replaceChild(newBtn, undoBtn);

    newBtn.addEventListener('click', () => {
      toast.classList.remove('visible');
      if (this._undoTimer) clearTimeout(this._undoTimer);
      this._undoTimer = null;
      if (undoCallback) undoCallback();
    });

    toast.classList.add('visible');
    this._undoTimer = setTimeout(() => {
      toast.classList.remove('visible');
      this._undoTimer = null;
    }, 8000);
  },

  formatAuditDate(isoString) {
    if (!isoString) return "";
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return "";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = dt.getDate();
    const month = months[dt.getMonth()];
    const hours = String(dt.getHours()).padStart(2, '0');
    const minutes = String(dt.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${hours}:${minutes}`;
  },

  formatAuditMessage(entry) {
    const timeStr = this.formatAuditDate(entry.at);
    const byStr = entry.by || "Unknown";
    
    let msg = "";
    if (entry.action === 'update_metric') {
      const beforeVal = entry.summaryBefore && entry.summaryBefore.includes(': ') ? entry.summaryBefore.split(': ').slice(-1)[0] : 'None';
      const afterVal = entry.summaryAfter && entry.summaryAfter.includes(': ') ? entry.summaryAfter.split(': ').slice(-1)[0] : 'None';
      msg = `updated ${entry.target}: ${beforeVal} → ${afterVal}`;
    } else if (entry.action === 'undo_metric') {
      const beforeVal = entry.summaryBefore && entry.summaryBefore.includes(': ') ? entry.summaryBefore.split(': ').slice(-1)[0] : 'None';
      const afterVal = entry.summaryAfter && entry.summaryAfter.includes(': ') ? entry.summaryAfter.split(': ').slice(-1)[0] : 'None';
      msg = `undid metric change ${entry.target}: ${beforeVal} → ${afterVal}`;
    } else if (entry.action === 'delete_metric') {
      msg = `deleted metric entry for ${entry.target}`;
    } else if (entry.action === 'add_dialogue') {
      msg = `added dialogue entry for ${entry.target}`;
    } else if (entry.action === 'delete_dialogue') {
      msg = `deleted dialogue entry for ${entry.target}`;
    } else {
      msg = `${entry.action || 'changed'} ${entry.target || ''}`;
      if (entry.summaryBefore && entry.summaryAfter) {
        msg += `: ${entry.summaryBefore} → ${entry.summaryAfter}`;
      }
    }
    
    return `${timeStr} — ${byStr} ${msg}`;
  },

  renderRecentActivityList() {
    const list = this._auditLog || [];
    if (list.length === 0) {
      return `<div class="activity-item" style="border: none; opacity: 0.5;">No recent changes recorded.</div>`;
    }
    return list.slice(0, 15).map(entry => `
      <div class="activity-item">
        ${this.escapeHtml(this.formatAuditMessage(entry))}
      </div>
    `).join('');
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

  });
}());
