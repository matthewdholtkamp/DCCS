// DCCS Weekly Rollup - fast multi-metric data entry + dialogue notes + SITREP launch (2026-06-19)
// New #/rollup route. Writes through the SAME stores as the service-line pages:
//  - metric values via Sync.saveMetricSeries ({date,value,by})
//  - dialogue notes via App.addDialogueEntry -> Sync.saveDialogueEntries ({date,text,by})
// so everything appears on the service line, the Dashboard, and the SITREP instantly.
// Self-contained: injects own CSS.
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
    rollupServiceMetrics(sl) {
      const defs = [];
      (sl.trackedMetrics || []).forEach(m => defs.push(m));
      (sl.metricGroups || []).forEach(g => (g.series || []).forEach(s => defs.push({ ...s, period: g.period, groupId: g.id })));
      return defs;
    },

    renderRollupNotes(sl) {
      const esc = (s) => this.escapeHtml(String(s == null ? '' : s));
      const notes = (this.getDialogueEntries(sl.id) || []).slice(0, 3); // newest-first
      const list = notes.length
        ? notes.map(n => `
            <div class="roll-note">
              <span class="roll-note-date">${esc(n.date)}</span>
              <span class="roll-note-text">${esc(n.text)}</span>
            </div>`).join('')
        : `<div class="roll-note-empty">No dialogue notes yet for this line.</div>`;
      return `
        <div class="roll-notes">
          <div class="roll-notes-head">Recent dialogue \u00b7 feeds the SITREP</div>
          ${list}
          <div class="roll-note-add">
            <textarea id="dialogue-text-${esc(sl.id)}" class="roll-note-input" placeholder="Add a dated note for ${esc(sl.abbr || sl.name)} \u2014 saves to the thread + SITREP..."></textarea>
            <button type="button" class="roll-note-btn" onclick="App.addRollupNote('${esc(sl.id)}')">Add note</button>
          </div>
        </div>`;
    },

    renderRollupSection(sl) {
      const esc = (s) => this.escapeHtml(String(s == null ? '' : s));
      const metrics = this.rollupServiceMetrics(sl);
      const rowsHtml = metrics.length ? metrics.map(m => {
        const disp = this.getMetricDisplayEntries(m);
        const last = disp.length ? disp[disp.length - 1] : null;
        const prior = last ? this.formatMetricValue(m, last.value) : '\u2014';
        const priorDate = last ? (last.label || last.date) : '';
        const st = this.metricStatus(m, disp);
        const goal = (m.goal != null) ? `${this.metricGoalSymbol(m)} ${this.formatMetricValue(m, m.goal)}` : '\u2014';
        return `
          <div class="roll-row">
            <div class="roll-metric">
              <span class="roll-dot tone-${st.tone}"></span>
              <span class="roll-mname" title="${esc(m.name)}">${esc(m.name)}</span>
            </div>
            <div class="roll-prior" title="Most recent entry">${esc(prior)}${priorDate ? `<span class="roll-prior-date"> \u00b7 ${esc(priorDate)}</span>` : ''}</div>
            <div class="roll-goal">${esc(goal)}</div>
            <div class="roll-input"><input type="number" step="${this.metricInputStep(m)}"${m.min !== null && m.min !== undefined ? ` min="${esc(m.min)}"` : ''} id="rollup-val-${esc(m.id)}" placeholder="new ${esc(m.unit || 'value')}"${this.metricIsMonthlySingle(m) ? ' title="Saving replaces the value for the selected month"' : ''}></div>
          </div>`;
      }).join('') : '';
      const rowsBlock = metrics.length ? `
          <div class="roll-row roll-row-head">
            <div class="roll-metric">Metric</div><div class="roll-prior">Latest</div><div class="roll-goal">Goal</div><div class="roll-input">New value</div>
          </div>
          ${rowsHtml}` : '';
      return `
        <div class="roll-card">
          <div class="roll-card-head">
            <span class="roll-card-name">${esc(sl.name)}</span>
            <span class="roll-card-leader">${esc(sl.leader || '')}</span>
          </div>
          ${this.renderRollupNotes(sl)}
          ${rowsBlock}
        </div>`;
    },

    renderRollup(el) {
      this.injectRollupStyles();
      const today = String((this.getLocalToday && this.getLocalToday()) || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const flash = this._rollupFlash; this._rollupFlash = null;
      const sections = (FRAMEWORK.serviceLines || []).map(sl => this.renderRollupSection(sl)).join('');
      el.innerHTML = `
        <section class="roll-wrap">
          <header class="roll-head">
            <div>
              <h1 class="roll-title">Weekly Rollup</h1>
              <p class="roll-sub">Enter this period's values and add your dialogue notes. Updates the service lines, Dashboard, and SITREP instantly.</p>
            </div>
            <div class="roll-actions">
              <label class="roll-date-label">Entry date
                <input type="date" id="rollup-date" class="roll-date" value="${today}">
              </label>
              <button type="button" class="roll-save" onclick="App.saveRollupAll()">Save all entries</button>
              <button type="button" class="roll-sitrep" onclick="App.rollupGenerateSitrep()">\ud83d\udccb Generate SITREP</button>
              <button type="button" class="roll-campaign" onclick="App.rollupGenerateCampaignBrief()">\ud83d\udce1 Refresh Campaign Brief</button>
            </div>
          </header>
          ${flash ? `<div class="roll-flash">\u2713 ${this.escapeHtml(flash)}</div>` : ''}
          <div class="roll-sections">${sections}</div>
        </section>`;
    },

    addRollupNote(slId) {
      const ta = document.getElementById('dialogue-text-' + slId);
      if (!ta || !ta.value.trim()) return;
      this.addDialogueEntry(slId); // real save ({date,text,by}, newest-first) + audit + undo toast
      const sl = (FRAMEWORK.serviceLines || []).find(s => s.id === slId);
      this._rollupFlash = 'Note added to ' + (sl ? sl.name : 'service line') + ' \u2014 it will appear in the next SITREP.';
      this.renderRollup(document.getElementById('app'));
    },

    saveRollupAll() {
      const dateEl = document.getElementById('rollup-date');
      const date = dateEl ? dateEl.value : '';
      if (dateEl) dateEl.classList.remove('input-error');
      if (!date) { if (dateEl) dateEl.classList.add('input-error'); return; }

      const all = { ...this.getMetricStore() };
      const user = (this.getCurrentUser && this.getCurrentUser()) || 'DCCS';
      const changed = [];
      let count = 0, badInput = false;

      (FRAMEWORK.serviceLines || []).forEach(sl => {
        this.rollupServiceMetrics(sl).forEach(m => {
          const input = document.getElementById('rollup-val-' + m.id);
          if (!input) return;
          input.classList.remove('input-error');
          const raw = input.value.trim();
          if (raw === '') return;
          const v = Number(raw);
          if (!this.metricValueIsValid(m, v)) { input.classList.add('input-error'); badInput = true; return; }
          const saved = this.saveMetricEntryToStore(all, m, date, v, user);
          if (!saved) { input.classList.add('input-error'); badInput = true; return; }
          changed.push(m.id);
          const beforeValue = saved.beforeEntry ? saved.beforeEntry.value : 'None';
          if (this.logAudit) this.logAudit('update_metric', m.id, `${m.id} on ${saved.date}: ${beforeValue}`, `${m.id} on ${saved.date}: ${saved.nextEntry.value}`);
          count++;
        });
      });

      if (badInput) return;
      if (count === 0) { this._rollupFlash = 'Enter at least one value before saving.'; this.renderRollup(document.getElementById('app')); return; }
      Sync.saveMetricSeries(changed, all);
      this._rollupFlash = `Saved ${count} ${count === 1 ? 'entry' : 'entries'} for ${date}.`;
      this.renderRollup(document.getElementById('app'));
    },

    rollupGenerateSitrep() {
      if (window.AskDrHoltkamp && typeof AskDrHoltkamp.generateSitrep === 'function') {
        AskDrHoltkamp.generateSitrep(0);
      } else {
        this._rollupFlash = 'SITREP generator is still loading - try again in a moment.';
        this.renderRollup(document.getElementById('app'));
      }
    },

    async rollupGenerateCampaignBrief() {
      if (!window.confirm('Regenerate the monthly Access-to-Care campaign brief from current Rollup data? This replaces the brief shown on the Executive Summary.')) return;
      const flash = (msg) => { this._rollupFlash = msg; this.renderRollup(document.getElementById('app')); };
      flash('Refreshing the monthly campaign brief\u2026');
      try {
        if (window.AskDrHoltkamp && AskDrHoltkamp.dependenciesPromise) { try { await AskDrHoltkamp.dependenciesPromise; } catch (e) {} }
        const raw = (window.BANDAID_CONFIG && window.BANDAID_CONFIG.WORKER_URL) || 'https://bandaid6.mholtkamp.workers.dev';
        const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
        const body = { source: 'rollup', period: 'month' };
        if (window.AskDrHoltkamp && typeof AskDrHoltkamp.getSitrepWindow === 'function') {
          try { body.window = AskDrHoltkamp.getSitrepWindow(0); } catch (e) {}
        }
        const res = await fetch(base + '/campaign-brief/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || (res.status === 409 ? 'A brief is already generating \u2014 try again shortly.' : 'Campaign brief refresh failed (' + res.status + ').'));
        flash('Monthly campaign brief refreshed \u2014 the Executive Summary will update.');
      } catch (err) {
        flash('Campaign brief refresh failed: ' + (err.message || 'unknown error') + '. The last published brief stays visible.');
      }
    },

    injectRollupStyles() {
      if (document.getElementById('rollup-styles')) return;
      const css = `
.roll-wrap{max-width:1100px;margin:0 auto;padding:32px 24px 64px}
.roll-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.roll-title{font-family:var(--font-display,inherit);font-size:1.9rem;font-weight:800;color:var(--text-primary);margin:0}
.roll-sub{color:var(--text-muted);font-size:.9rem;margin:4px 0 0;max-width:560px}
.roll-actions{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
.roll-date-label{display:flex;flex-direction:column;gap:4px;font-size:.7rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.roll-date{padding:8px 10px;border-radius:8px;border:1px solid var(--border-subtle);background:rgba(255,255,255,0.04);color:var(--text-primary);font-family:inherit;font-size:.85rem}
.roll-date.input-error{border-color:#e0564d}
.roll-save{padding:9px 16px;border-radius:8px;border:none;background:linear-gradient(180deg,var(--gold),#d69a18);color:#080a08;font-weight:800;font-size:.8rem;cursor:pointer;transition:var(--transition)}
.roll-save:hover{filter:brightness(1.06);transform:translateY(-1px)}
.roll-sitrep{padding:9px 14px;border-radius:8px;border:1px solid var(--border-accent);background:rgba(255,184,28,0.08);color:var(--gold);font-weight:800;font-size:.8rem;cursor:pointer;transition:var(--transition)}
.roll-sitrep:hover{background:rgba(255,184,28,0.16)}
.roll-campaign{padding:9px 14px;border-radius:8px;border:1px solid rgba(90,169,230,0.5);background:rgba(90,169,230,0.10);color:#7cc0f0;font-weight:800;font-size:.8rem;cursor:pointer;transition:var(--transition)}
.roll-campaign:hover{background:rgba(90,169,230,0.18)}
.roll-flash{margin:0 0 16px;padding:10px 14px;border:1px solid rgba(92,184,116,0.45);background:rgba(92,184,116,0.1);color:#7fd498;border-radius:10px;font-weight:700;font-size:.85rem}
.roll-sections{display:flex;flex-direction:column;gap:16px}
.roll-card{background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);border-radius:14px;padding:14px 16px}
.roll-card-head{display:flex;align-items:baseline;gap:10px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)}
.roll-card-name{font-weight:800;font-size:1rem;color:var(--text-primary)}
.roll-card-leader{font-size:.72rem;color:var(--text-muted)}
.roll-notes{margin:0 0 12px;padding:10px 12px;background:rgba(255,255,255,0.02);border:1px solid var(--border-subtle);border-radius:10px}
.roll-notes-head{font-size:.64rem;text-transform:uppercase;letter-spacing:.06em;color:var(--gold);font-weight:800;margin-bottom:7px}
.roll-note{display:flex;gap:8px;padding:3px 0;font-size:.78rem;align-items:baseline}
.roll-note-date{color:var(--text-muted);font-weight:700;font-size:.68rem;white-space:nowrap;min-width:78px}
.roll-note-text{color:var(--text-secondary);line-height:1.45}
.roll-note-empty{font-size:.74rem;color:var(--text-muted);font-style:italic}
.roll-note-add{display:flex;gap:8px;margin-top:8px}
.roll-note-input{flex:1;min-height:40px;padding:7px 9px;border-radius:7px;border:1px solid var(--border-subtle);background:rgba(255,255,255,0.05);color:var(--text-primary);font-family:inherit;font-size:.8rem;resize:vertical;line-height:1.45}
.roll-note-input:focus{outline:none;border-color:var(--gold)}
.roll-note-btn{align-self:flex-start;padding:7px 12px;border-radius:7px;border:1px solid var(--border-accent);background:rgba(255,184,28,0.08);color:var(--gold);font-weight:800;font-size:.74rem;cursor:pointer;white-space:nowrap;transition:var(--transition)}
.roll-note-btn:hover{background:rgba(255,184,28,0.16)}
.roll-row{display:grid;grid-template-columns:1fr 140px 110px 160px;gap:10px;align-items:center;padding:6px 0}
.roll-row-head{font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);font-weight:700;border-bottom:1px solid var(--border-subtle);padding-bottom:6px}
.roll-metric{display:flex;align-items:center;gap:8px;min-width:0}
.roll-mname{font-size:.84rem;color:var(--text-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.roll-dot{width:8px;height:8px;border-radius:50%;flex:none;background:#8a8f98}
.roll-dot.tone-good{background:#5cb874}
.roll-dot.tone-warn{background:#e0a23d}
.roll-dot.tone-neutral{background:#8a8f98}
.roll-prior{font-size:.8rem;color:var(--text-secondary);font-weight:600}
.roll-prior-date{color:var(--text-muted);font-weight:500;font-size:.72rem}
.roll-goal{font-size:.8rem;color:var(--text-muted);font-weight:600}
.roll-input input{width:100%;padding:7px 9px;border-radius:7px;border:1px solid var(--border-subtle);background:rgba(255,255,255,0.05);color:var(--text-primary);font-family:inherit;font-size:.84rem}
.roll-input input.input-error{border-color:#e0564d}
.roll-input input:focus{outline:none;border-color:var(--gold)}
@media (max-width:640px){
.roll-row{grid-template-columns:1fr 1fr;gap:6px}
.roll-row-head{display:none}
.roll-goal{display:none}
.roll-prior{text-align:right}
.roll-input{grid-column:1 / -1}
.roll-actions{width:100%}
.roll-note-date{min-width:64px}
}
`;
      const style = document.createElement('style');
      style.id = 'rollup-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }
  });
}());
