// DCCS Weekly Rollup - fast multi-metric data entry + dialogue notes + SITREP launch (2026-06-19)
// New #/rollup route. Writes through the SAME stores as the service-line pages:
//  - metric values via Sync.saveMetricSeries ({date,value,by})
//  - dialogue notes via App.addDialogueEntry -> Sync.saveDialogueEntries ({date,text,by})
// so everything appears on the service line, the Dashboard, and the SITREP instantly.
// Self-contained: injects own CSS.
(function () {
  // Progress vocabulary the Executive Summary lane CSS knows how to colour
  // (.exsum-lane-progress.tone-*). Anything else renders unstyled, so the model
  // is constrained to these four and the reply is normalised against them.
  const CAMPAIGN_PROGRESS = ['On Track', 'Sustain', 'At Risk', 'Off Track'];

  const CAMPAIGN_BRIEF_INSTRUCTIONS = [
    'You are writing the monthly Access-to-Care campaign brief for the DCCS Executive Summary.',
    'You receive one entry per campaign lane containing pre-computed metric figures and the',
    'commander\'s dated dialogue notes for the period. Every number is authoritative: quote the',
    'figures you are given verbatim and never calculate, extrapolate, or invent one.',
    '',
    'For each lane return exactly three fields:',
    '  progress - one of: ' + CAMPAIGN_PROGRESS.join(' | ') + '. Judge it against the lane targetOutcome.',
    '             Use "Sustain" when the target is already met and holding.',
    '  evidence - the single strongest supporting figure, under 60 characters, e.g. "Acute 0.8h vs <24h goal".',
    '  update   - 2 to 3 sentences of plain command narrative: what moved this period, what the notes',
    '             attribute it to, and the next action. No markdown, no bullets, no headings.',
    '',
    'If a lane has no metric values and no notes, set progress to "At Risk", evidence to',
    '"No data reported this period", and say so plainly in the update.',
    'Return only the JSON object described by the schema.'
  ].join('\n');

  // Errors reach us from three layers (fetch, the Worker, and Gemini) and only
  // the innermost one is a string. Flattening here is what keeps the failure
  // message from rendering as "[object Object]".
  function briefErrorText(err) {
    if (err === null || err === undefined) return 'unknown error';
    if (typeof err === 'string') return err.trim() || 'unknown error';
    if (typeof err.message === 'string') return err.message.trim() || 'unknown error';
    if (err.message) return briefErrorText(err.message);
    if (err.error) return briefErrorText(err.error);
    try { return JSON.stringify(err); } catch (e) { return String(err); }
  }

  // Gemini honours responseMimeType, but a fallback model or a Worker that
  // strips generationConfig can still hand back fenced or prose-wrapped JSON.
  function parseBriefJson(text) {
    const cleaned = String(text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(cleaned); } catch (e) { /* fall through to brace scan */ }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('the model did not return usable JSON');
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  // The BAND-AID 6 Worker always answers as text/event-stream, even without
  // ?stream=1, so the reply has to be reassembled from SSE frames. The plain
  // JSON branch is kept in case the Worker ever returns a buffered response.
  async function readGeminiText(response) {
    const partsText = (json) => {
      const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
      return parts ? parts.map(p => p.text).filter(Boolean).join('') : '';
    };
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.indexOf('text/event-stream') < 0 || !response.body) {
      return partsText(await response.json());
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', text = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      events.forEach(event => {
        event.split(/\r?\n/).forEach(line => {
          if (line.indexOf('data:') !== 0) return;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') return;
          try { text += partsText(JSON.parse(payload)); } catch (e) { /* partial SSE frame */ }
        });
      });
    }
    return text;
  }

  function normalizeProgress(value) {
    const want = String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    const hit = CAMPAIGN_PROGRESS.find(p => p.toLowerCase().replace(/\s+/g, '-') === want);
    return hit || 'At Risk';
  }

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

    // Compact, bounded payload for the campaign brief: only the four
    // Access-to-Care lanes, only their headline metric figures, and only the
    // newest notes. Deliberately capped so a month of long dialogue entries
    // cannot inflate the request.
    buildCampaignBriefPayload(win) {
      const ask = window.AskDrHoltkamp;
      const metricStore = this.getMetricStore();
      const lanes = (typeof this.getAccessCampaignLanes === 'function' && this.getAccessCampaignLanes()) || [];

      return lanes.map(lane => {
        const sl = (FRAMEWORK.serviceLines || []).find(s => s.id === lane.id) || null;
        const metrics = sl ? this.rollupServiceMetrics(sl)
          .map(m => ask.sitrepMetricDelta(m, metricStore, win))
          .filter(d => d.headline !== null && d.headline !== undefined)
          .map(d => ({
            name: d.name,
            latest: d.headline,
            unit: d.unit,
            goal: d.goal,
            betterWhen: d.direction,
            basis: d.basis,
            changeVsPrior: d.deltaText,
            goalState: d.goalState
          })) : [];

        const all = this.getDialogueEntries(lane.id) || []; // newest-first
        const inWindow = all.filter(e => ask.sitrepInWindow(e.date, win.startISO, win.dialogueEndISO || win.endISO));
        const picked = inWindow.length ? inWindow.slice(0, 6) : all.slice(0, 2);
        const notes = picked.map(e => ({
          date: e.date,
          inPeriod: inWindow.indexOf(e) >= 0,
          text: String(e.text || '').slice(0, 400)
        }));

        return {
          laneId: lane.id,
          service: lane.service,
          owner: lane.owner,
          targetOutcome: lane.outcome,
          milestone: lane.date,
          standingAction: lane.actionLabel + ': ' + lane.action,
          metrics: metrics,
          notes: notes
        };
      });
    },

    // Generates the brief client-side through the BAND-AID 6 Gemini proxy (the
    // same path the SITREP uses) and publishes it to Firestore, which the
    // Executive Summary is already subscribed to. There is no server-side
    // brief route to call.
    async rollupGenerateCampaignBrief() {
      if (!window.confirm('Regenerate the monthly Access-to-Care campaign brief from current Rollup data? This replaces the brief shown on the Executive Summary.')) return;
      const flash = (msg) => { this._rollupFlash = msg; this.renderRollup(document.getElementById('app')); };
      flash('Refreshing the monthly campaign brief\u2026');

      try {
        const ask = window.AskDrHoltkamp;
        if (!ask || typeof ask.getSitrepWindow !== 'function') throw new Error('the BAND-AID 6 assistant has not finished loading \u2014 try again in a moment');
        if (ask.dependenciesPromise) { try { await ask.dependenciesPromise; } catch (e) {} }
        if (typeof Sync === 'undefined' || !Sync.db) throw new Error('the shared database is not connected yet');

        const cfg = window.BANDAID_CONFIG || {};
        const workerUrl = cfg.WORKER_URL || 'https://bandaid6.mholtkamp.workers.dev';
        // Follow the app's configured routing first, then fall back client-side.
        // The Worker's own fallbackModel does not reliably rescue a 503 from the
        // primary, so the brief walks the chain itself rather than failing outright.
        const modelChain = [cfg.SITREP_MODEL || ask.SITREP_MODEL, 'gemini-3.5-flash-lite', 'gemini-2.5-flash']
          .filter((m, i, arr) => m && arr.indexOf(m) === i);
        const win = ask.getSitrepWindow(0);
        const lanes = this.buildCampaignBriefPayload(win);
        if (!lanes.length) throw new Error('no Access-to-Care lanes are configured');

        const laneSchema = {
          type: 'OBJECT',
          properties: {
            progress: { type: 'STRING', enum: CAMPAIGN_PROGRESS },
            evidence: { type: 'STRING' },
            update: { type: 'STRING' }
          },
          required: ['progress', 'evidence', 'update']
        };
        const responseSchema = {
          type: 'OBJECT',
          properties: lanes.reduce((acc, lane) => { acc[lane.laneId] = laneSchema; return acc; }, {}),
          required: lanes.map(lane => lane.laneId)
        };

        const systemPrompt = (window.BANDAID_PERSONA_PROMPT ? window.BANDAID_PERSONA_PROMPT + '\n\n' : '') + CAMPAIGN_BRIEF_INSTRUCTIONS;
        const userPayload = 'Write the monthly Access-to-Care campaign brief for the period ' + win.label + '.\n' +
          'One object per lane, keyed by laneId.\n\nCAMPAIGN_DATA\n' + JSON.stringify({ periodCovered: win.label, hospital: FRAMEWORK.hospital, lanes: lanes }, null, 2);

        let text = '', model = '', lastError = null;
        for (let i = 0; i < modelChain.length && !text.trim(); i++) {
          const candidate = modelChain[i];
          if (i > 0) flash('Model ' + modelChain[i - 1] + ' is unavailable \u2014 retrying the brief on ' + candidate + '\u2026');
          try {
            const response = await fetch(workerUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: candidate,
                fallbackModel: 'gemini-3.5-flash-lite',
                systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPayload }] }],
                generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: responseSchema }
              })
            });
            if (!response.ok) {
              const errorPayload = await response.json().catch(() => null);
              throw new Error(errorPayload && errorPayload.error ? briefErrorText(errorPayload.error) : 'HTTP ' + response.status);
            }
            const candidateText = await readGeminiText(response);
            if (!candidateText.trim()) throw new Error('the model returned an empty brief');
            text = candidateText;
            model = candidate;
          } catch (attemptError) {
            lastError = attemptError;
          }
        }
        if (!text.trim()) throw new Error(briefErrorText(lastError));
        const parsed = parseBriefJson(text);

        const laneMap = {};
        let written = 0;
        lanes.forEach(lane => {
          const entry = parsed && parsed[lane.laneId];
          if (!entry || !entry.evidence || !entry.update) return;
          laneMap[lane.laneId] = {
            progress: normalizeProgress(entry.progress),
            evidence: String(entry.evidence).trim().slice(0, 90),
            update: String(entry.update).trim().slice(0, 900)
          };
          written++;
        });
        if (!written) throw new Error('the model returned no usable lane updates');

        await Sync.db.collection('dccs_data').doc('campaign_briefs').collection('snapshots').doc('current').set({
          generatedAt: new Date().toISOString(),
          generatedBy: (this.getCurrentUser && this.getCurrentUser()) || 'DCCS',
          period: 'month',
          model: model,
          sourceWindow: { start: win.startISO, end: win.dialogueEndISO || win.endISO, label: win.label },
          lanes: laneMap
        });

        flash('Monthly campaign brief refreshed for ' + win.label + ' \u2014 ' + written + ' of ' + lanes.length + ' lanes updated on the Executive Summary.');
      } catch (err) {
        flash('Campaign brief refresh failed: ' + briefErrorText(err) + '. The last published brief stays visible.');
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
