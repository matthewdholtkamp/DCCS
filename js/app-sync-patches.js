// DCCS Operational Framework - Remote sync patch application
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
  applyRemoteChange(docId, data, changedKeys = null) {
    if (!this._pendingPatches) {
      this._pendingPatches = [];
    }
    this._pendingPatches.push({ docId, data, changedKeys });
    if (!this._rafScheduled) {
      this._rafScheduled = true;
      requestAnimationFrame(() => this.flushPendingPatches());
    }
  },

  flushPendingPatches() {
    this._rafScheduled = false;
    const patches = this._pendingPatches || [];
    this._pendingPatches = [];

    if (!this._stalePatches) {
      this._stalePatches = {};
    }

    const windowScroll = { x: window.scrollX, y: window.scrollY };

    // Cache activeElement once per flush for consistency
    const ae = document.activeElement;
    const aeEditing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'
      || ae.tagName === 'SELECT' || ae.isContentEditable);

    // Preserve stage scroll position to avoid cinematic jump
    const frameworkStage = document.getElementById('framework-stage');
    const landingStage = document.getElementById('landing-stage');
    const fScroll = frameworkStage ? frameworkStage.scrollTop : 0;
    const lScroll = landingStage ? landingStage.scrollTop : 0;

    // Helper: check if cached activeElement is inside an element
    const hasFocus = (el) => el && aeEditing && el.contains(ae);

    patches.forEach(({ docId, data, changedKeys }) => {
      if (!changedKeys || changedKeys.length === 0) return;

      if (docId === 'tasks') {
        changedKeys.forEach(taskId => {
          const card = document.getElementById(`task-${taskId}`);
          if (!card) return;
          if (hasFocus(card)) {
            this._stalePatches[`task-${taskId}`] = { type: 'task', id: taskId };
            return;
          }
          this.refreshTaskCard(taskId);
        });
        if (typeof this.refreshExsumKpiChart === 'function') this.refreshExsumKpiChart();
      } else if (docId === 'metrics') {
        changedKeys.forEach(metricId => {
          const groupDef = this.getMetricGroupForSeries(metricId);
          if (groupDef) {
            const groupEl = document.getElementById(`metric-group-section-${groupDef.group.id}`);
            if (groupEl) {
              if (hasFocus(groupEl)) {
                this._stalePatches[`metric-group-section-${groupDef.group.id}`] = { type: 'metric-group', id: groupDef.group.id };
                return;
              }
              this.refreshMetricGroupDisplay(groupDef.group.id);
            }
          } else {
            const mDef = this.getMetricDefinition(metricId);
            if (mDef) {
              const displayEl = document.getElementById(`metric-display-${metricId}`);
              if (displayEl) {
                if (hasFocus(displayEl)) {
                  this._stalePatches[`metric-display-${metricId}`] = { type: 'metric', id: metricId };
                  return;
                }
                this.refreshMetricDisplay(metricId);
              }
            }
          }
        });
        if (typeof this.refreshExsumDashboard === 'function') this.refreshExsumDashboard();
      } else if (docId === 'hedis') {
        changedKeys.forEach(slId => {
          const section = document.getElementById(`hedis-section-${slId}`);
          if (!section) return;
          if (hasFocus(section)) {
            this._stalePatches[`hedis-section-${slId}`] = { type: 'hedis', id: slId };
            return;
          }
          this.refreshHedisSection(slId);
        });
      } else if (docId === 'dialogue') {
        changedKeys.forEach(slId => {
          const list = document.getElementById(`dialogue-list-${slId}`);
          if (list) {
            if (hasFocus(list)) {
              this._stalePatches[`dialogue-list-${slId}`] = { type: 'dialogue', id: slId };
              return;
            }
            this.updateDialogueList(slId, Sync.getDialogueEntries(slId));
          }

          const meetingList = document.getElementById(`meeting-dialogue-list-${slId}`);
          if (meetingList) {
            if (hasFocus(meetingList)) {
              this._stalePatches[`meeting-dialogue-list-${slId}`] = { type: 'meeting-dialogue', id: slId };
              return;
            }
            meetingList.innerHTML = this.renderMeetingDialogueList({ id: slId }, Sync.getDialogueEntries(slId));
          }
        });
      }
    });

    window.scrollTo(windowScroll.x, windowScroll.y);
    if (frameworkStage && fScroll > 0) frameworkStage.scrollTop = fScroll;
    if (landingStage && lScroll > 0) landingStage.scrollTop = lScroll;
  },

  applyStalePatches() {
    if (!this._stalePatches || Object.keys(this._stalePatches).length === 0) return;
    const curAe = document.activeElement;
    const curEditing = curAe && (curAe.tagName === 'INPUT' || curAe.tagName === 'TEXTAREA'
      || curAe.tagName === 'SELECT' || curAe.isContentEditable);

    Object.entries(this._stalePatches).forEach(([elId, patch]) => {
      const el = document.getElementById(elId);
      if (el && curEditing && el.contains(curAe)) {
        return;
      }

      delete this._stalePatches[elId];

      if (patch.type === 'task') {
        this.refreshTaskCard(patch.id);
      } else if (patch.type === 'metric-group') {
        this.refreshMetricGroupDisplay(patch.id);
      } else if (patch.type === 'metric') {
        this.refreshMetricDisplay(patch.id);
      } else if (patch.type === 'hedis') {
        this.refreshHedisSection(patch.id);
      } else if (patch.type === 'dialogue') {
        this.updateDialogueList(patch.id, Sync.getDialogueEntries(patch.id));
      } else if (patch.type === 'meeting-dialogue') {
        const meetingList = document.getElementById(`meeting-dialogue-list-${patch.id}`);
        if (meetingList) {
          meetingList.innerHTML = this.renderMeetingDialogueList({ id: patch.id }, Sync.getDialogueEntries(patch.id));
        }
      }
    });
  },
  });

  // ---- Save-state indicator enhancement ----
  // Wraps Sync.setStatus to show richer feedback without modifying sync.js.
  // When offline after a localStorage save, badge shows "Saved locally" briefly.
  const _origSetStatus = Sync.setStatus.bind(Sync);
  let _savedLocallyTimer = null;

  Sync.setStatus = function (newStatus) {
    clearTimeout(_savedLocallyTimer);

    // When transitioning to offline during a save (Firestore disabled/failed but
    // localStorage already written), show reassuring "Saved locally" text briefly.
    if (newStatus === 'offline') {
      const badge = document.getElementById('sync-status');
      const textNode = badge && badge.querySelector('.sync-text');
      if (textNode && !navigator.onLine) {
        _origSetStatus(newStatus);
        textNode.textContent = 'Saved locally';
        badge.title = 'Data saved on this device — will sync when back online';
        _savedLocallyTimer = setTimeout(() => {
          if (Sync.status === 'offline') {
            textNode.textContent = 'Offline';
            badge.title = 'Firebase Connection Status';
          }
        }, 3000);
        return;
      }
    }

    _origSetStatus(newStatus);
  };
}());
