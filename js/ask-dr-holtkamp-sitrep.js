// DCCS Monthly Commander SITREP - self-contained module (added 2026-06-19)
// Extends the global AskDrHoltkamp object with a one-click DCCS -> Commander
// situation report. All metric deltas / percentages are pre-computed here so
// the model only narrates the numbers it is handed (it never does arithmetic).
//
// Reports are due the 15th of each month. Coverage window = 15th of the prior
// month through the 14th of the due month. An in-app reminder fires the 13th-15th
// (centered on "due tomorrow" on the 14th).
//
// Isolated by design: this module does NOT modify send(), callWorker(), or the
// command executor in ask-dr-holtkamp.js, and never emits a DCCS_COMMAND block.

Object.assign(AskDrHoltkamp, {
  SITREP_DUE_DAY: 15,
  SITREP_REMINDER_DAYS: [13, 14, 15],
  SITREP_MODEL: "gemini-3.5-flash",            // go-to / primary model for the SITREP
  EVERYDAY_FALLBACK_MODEL: "gemini-3.5-flash", // backup model for the everyday assistant
  SITREP_SERVICE_ORDER: ["pcsl", "emergency", "surgery", "mental-health", "mscoe"],
  SITREP_SECTION_LABEL: {
    "pcsl": "PCSL",
    "emergency": "ER",
    "surgery": "Surgery",
    "mental-health": "Mental Health",
    "mscoe": "MSCoE"
  },

  SITREP_INSTRUCTIONS: `You are writing the MONTHLY COMMANDER SITREP. This is formal correspondence FROM the DCCS (LTC Holtkamp) TO the Hospital and Installation Commander and senior general officers. Write in the first person ("I" / "we") in a confident, BLUF-first military staff voice.

STRICT OUTPUT FORMAT - follow it exactly:
1. Open with a 2-line BLUF (no more than two sentences): the bottom-line posture of medical readiness and performance for the reporting period.
2. Then EXACTLY five body sections, IN THIS ORDER, each label in bold, each 4-5 sentences:
   **PCSL** (Primary Care)
   **ER** (Emergency Department)
   **Surgery** (Surgical Services)
   **Mental Health**
   **MSCoE** (Trainee Care / MSCoE Integration)
   Each section LEADS with the accomplishment, then weaves in 2-3 specific data points from SITREP_DATA with their inline change and percentage (use the provided deltaText, e.g. "176 cases, +12% over the prior period"). State the trend direction in plain words. Build the narrative of each section primarily from that section's "dialogue" entries (my own dated running-log notes for the period) - these are the authoritative account of what happened and why; lead from them and use the metrics as the supporting evidence.
3. Close with ONE forward-looking sentence from the DCCS.

HARD RULES:
- ACCOMPLISHMENTS ONLY. This goes to senior leaders; it is NOT a request for help. If a line is short of where it needs to be, frame it as the SOLUTION already in motion ("we are closing this by..."), never as a problem or an ask.
- Use ONLY the numbers in SITREP_DATA. Every figure and percentage there is pre-computed and authoritative - quote them as given; do NOT recompute, estimate, or invent any number, name, or date.
- State a numeric goal/target ONLY when a metric has showTarget=true (at, near, or achieving goal). Otherwise report the value and its change WITHOUT naming the target.
- For metrics where improved=true, phrase the change as a positive movement even if the raw number went down (e.g. falling wait times are good).
- Do NOT mention internal phase numbers ("Phase 1/2/3") or "LOE" - higher headquarters has no context for them. Speak in plain operational terms.
- If a section has little data this period, briefly note steady-state performance and the key ongoing effort in 2-3 sentences rather than padding.
- The "dialogue" array in each section is MY own dated field notes (the running log from the service-line page) and is the single most important input - it carries the context and the "why" behind the numbers. Lead each section with it, preserve its substance in my voice, and never contradict it or invent context beyond what it and the metrics state. A section with strong dialogue but thin metrics still stands on the dialogue.
- No PII/PHI, no patient details, no raw JSON, and do NOT output any command block or bracketed action tag of any kind.
- Keep it tight and human - a one-page brief the Commander can read in under a minute.`,

  sitrepDateLabel(d) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  },

  getSitrepWindow(cycleOffset) {
    const off = cycleOffset || 0;
    const now = new Date();
    const anchor = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const dueYear = anchor.getFullYear();
    const dueMonth = anchor.getMonth(); // 0-based
    const D = this.SITREP_DUE_DAY;
    const start = new Date(dueYear, dueMonth - 1, D);        // 15th of prior month
    const end = new Date(dueYear, dueMonth, D - 1);          // 14th of due month
    const due = new Date(dueYear, dueMonth, D);              // 15th of due month
    const priorStart = new Date(dueYear, dueMonth - 2, D);   // prior cycle start
    const priorEnd = new Date(dueYear, dueMonth - 1, D - 1); // prior cycle end
    const iso = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
    const todayISO = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    const dialogueEndISO = (off === 0 && todayISO > iso(end)) ? todayISO : iso(end);
    return {
      startISO: iso(start), endISO: iso(end), dialogueEndISO: dialogueEndISO,
      priorStartISO: iso(priorStart), priorEndISO: iso(priorEnd),
      dueISO: iso(due),
      label: this.sitrepDateLabel(start) + " \u2013 " + this.sitrepDateLabel(end),
      dueLabel: this.sitrepDateLabel(due)
    };
  },

  sitrepInWindow(dateStr, startISO, endISO) {
    const d = this.normalizeDate(dateStr);
    return d >= startISO && d <= endISO;
  },

  sitrepAgg(entries, startISO, endISO) {
    const inWin = (entries || []).filter((e) => {
      const d = this.normalizeDate(e.date);
      return d >= startISO && d <= endISO;
    });
    if (inWin.length === 0) return { count: 0, sum: 0, avg: null, last: null, lastDate: null };
    let sum = 0, last = null, lastDate = "";
    inWin.forEach((e) => {
      const v = Number(e.value);
      if (Number.isFinite(v)) sum += v;
      const dd = this.normalizeDate(e.date);
      if (!lastDate || dd >= lastDate) { lastDate = dd; last = Number(e.value); }
    });
    return {
      count: inWin.length,
      sum: Math.round(sum * 10) / 10,
      avg: Math.round((sum / inWin.length) * 10) / 10,
      last: last,
      lastDate: lastDate
    };
  },

  sitrepMetricDelta(metric, metricStore, win) {
    const raw = Array.isArray(metricStore[metric.id]) ? metricStore[metric.id] : [];
    const entries = this.getMetricReportEntries(metric, raw); // handles monthly-sum bucketing
    const hasGoal = metric.goal !== null && metric.goal !== undefined;
    const dir = metric.direction || "neutral";

    let cur, prior, headline, headlinePrior, basis;

    if (metric.entryMode === "monthly-single") {
      const endKey = win.endISO.slice(0, 7);
      const monthly = entries.filter((entry) => String(entry.date).slice(0, 7) <= endKey);
      const curB = monthly[monthly.length - 1] || null;
      const priB = monthly[monthly.length - 2] || null;
      headline = curB ? Number(curB.value) : null;
      headlinePrior = priB ? Number(priB.value) : null;
      cur = curB
        ? { count: 1, sum: headline, avg: headline, last: headline, lastDate: curB.date, label: curB.label }
        : { count: 0, sum: 0, avg: null, last: null };
      prior = priB
        ? { count: 1, sum: headlinePrior, avg: headlinePrior, last: headlinePrior, lastDate: priB.date, label: priB.label }
        : { count: 0, sum: 0, avg: null, last: null };
      basis = "monthly-value";
    } else if (metric.aggregation === "monthly-sum") {
      const endKey = win.endISO.slice(0, 7);
      const buckets = entries.filter((b) => String(b.date).slice(0, 7) <= endKey);
      const curB = buckets[buckets.length - 1] || null;
      const priB = buckets[buckets.length - 2] || null;
      headline = curB ? curB.value : null;
      headlinePrior = priB ? priB.value : null;
      cur = curB ? { count: curB.sourceCount || 1, sum: curB.value, avg: curB.value, last: curB.value, label: curB.label } : { count: 0, sum: 0, avg: null, last: null };
      prior = priB ? { count: priB.sourceCount || 1, sum: priB.value, avg: priB.value, last: priB.value, label: priB.label } : { count: 0, sum: 0, avg: null, last: null };
      basis = "monthly-total";
    } else {
      cur = this.sitrepAgg(entries, win.startISO, win.endISO);
      prior = this.sitrepAgg(entries, win.priorStartISO, win.priorEndISO);
      headline = hasGoal ? cur.avg : cur.sum;
      headlinePrior = hasGoal ? prior.avg : prior.sum;
      basis = hasGoal ? "period-average" : "period-total";
    }

    const precision = Number.isInteger(metric.precision) ? metric.precision : 1;
    const precisionFactor = Math.pow(10, precision);
    let deltaAbs = null, deltaPct = null;
    if (headline !== null && headlinePrior !== null && headlinePrior !== 0) {
      deltaAbs = Math.round((headline - headlinePrior) * precisionFactor) / precisionFactor;
      deltaPct = Math.round(((headline - headlinePrior) / Math.abs(headlinePrior)) * 100);
    } else if (headline !== null && headlinePrior === 0) {
      deltaAbs = Math.round(headline * precisionFactor) / precisionFactor;
    }

    let improved = null;
    if (deltaAbs !== null) {
      if (dir === "lower") improved = deltaAbs < 0;
      else if (dir === "higher") improved = deltaAbs > 0;
    }

    let goalState = "no-goal", showTarget = false;
    if (hasGoal && headline !== null) {
      const g = Number(metric.goal);
      const meets = dir === "lower"
        ? metric.goalInclusive ? headline <= g : headline < g
        : dir === "higher"
          ? metric.goalInclusive === false ? headline > g : headline >= g
          : null;
      const within = Math.abs(headline - g) / (Math.abs(g) || 1) <= 0.1;
      showTarget = !!meets || within;
      goalState = meets ? "meets-goal" : within ? "near-goal" : "tracking";
    }

    const unit = metric.unit || "";
    let deltaText;
    if (deltaPct === null) {
      deltaText = deltaAbs === null ? "no prior baseline" : ((deltaAbs >= 0 ? "+" : "") + deltaAbs + " " + unit).trim();
    } else {
      deltaText = (deltaPct >= 0 ? "+" : "") + deltaPct + "%";
    }

    return {
      id: metric.id, name: metric.name, unit: unit, direction: dir,
      goal: hasGoal ? metric.goal : null, showTarget: showTarget, goalState: goalState,
      entryMode: metric.entryMode || null, precision: precision,
      basis: basis, thisPeriod: cur, priorPeriod: prior,
      headline: headline, headlinePrior: headlinePrior,
      deltaAbs: deltaAbs, deltaPct: deltaPct, deltaText: deltaText, improved: improved
    };
  },

  buildSitrepData(win) {
    const metricStore = this.getMetricStore();
    const taskStore = this.getTaskStore();
    const dialogueStore = this.getDialogueStore();

    const byId = {};
    FRAMEWORK.serviceLines.forEach((sl) => { byId[sl.id] = sl; });

    const collectKpis = (tasks) => {
      const out = [];
      (tasks || []).forEach((task) => {
        const saved = taskStore[task.id] || {};
        const dates = saved.kpiDates || {};
        Object.keys(dates).forEach((key) => {
          if (this.sitrepInWindow(dates[key], win.startISO, win.endISO)) {
            let text;
            if (String(key).indexOf("custom-") === 0) {
              const idx = Number(key.split("-")[1]);
              text = (saved.customKpis && saved.customKpis[idx]) || "";
            } else {
              text = (task.kpis && task.kpis[Number(key)]) || "";
            }
            if (text) out.push({ task: task.title, kpi: text, date: this.normalizeDate(dates[key]) });
          }
        });
      });
      return out;
    };

    const sections = this.SITREP_SERVICE_ORDER.map((slId) => {
      const sl = byId[slId];
      if (!sl) return null;
      const metricDefs = [];
      (sl.trackedMetrics || []).forEach((m) => metricDefs.push(m));
      (sl.metricGroups || []).forEach((grp) => (grp.series || []).forEach((s) => metricDefs.push(s)));
      const metrics = metricDefs
        .map((m) => this.sitrepMetricDelta(m, metricStore, win))
        .filter((md) => md.thisPeriod.count > 0 || md.priorPeriod.count > 0 || md.headline !== null);

      const kpisCompleted = collectKpis(sl.tasks);
      const dialogue = (dialogueStore[slId] || [])
        .filter((e) => this.sitrepInWindow(e.date, win.startISO, win.dialogueEndISO || win.endISO))
        .map((e) => ({ date: this.normalizeDate(e.date), text: this.truncate(e.text || "", 500) }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      return {
        section: this.SITREP_SECTION_LABEL[slId],
        serviceLine: sl.name,
        leader: sl.leader || "",
        metrics: metrics,
        kpisCompleted: kpisCompleted,
        dialogue: dialogue
      };
    }).filter(Boolean);

    const crossCuttingCompleted = collectKpis(FRAMEWORK.crossCuttingTasks)
      .map((x) => ({ task: x.task, kpi: x.kpi }));

    return {
      reportType: "Monthly Commander SITREP",
      from: "DCCS (LTC Holtkamp)",
      hospital: FRAMEWORK.hospital,
      periodCovered: win.label,
      dueDate: win.dueLabel,
      mission: FRAMEWORK.mission,
      sections: sections,
      crossCuttingCompleted: crossCuttingCompleted
    };
  },

  async generateSitrep(cycleOffset) {
    if (!this.isOpen) this.open();
    const win = this.getSitrepWindow(cycleOffset || 0);
    const userLine = "Generate Monthly Commander SITREP \u2014 Period Covered: " + win.label;
    this.history.push({ role: "user", text: userLine });
    this.saveHistory();
    this.createMessage("user", userLine);

    const assistantBody = this.createMessage("assistant", "Thinking...");
    try {
      await this.dependenciesPromise;
      if (!this.isReady) throw new Error(this.els.status.textContent || "Assistant is not ready.");
      const data = this.buildSitrepData(win);
      const reply = await this.callWorkerSitrep(win, data, assistantBody);
      this.history.push({ role: "assistant", text: reply });
      this.saveHistory();
    } catch (error) {
      const msg = "I could not generate the SITREP. " + (error.message || "Check the Worker and shared persona configuration.");
      this.updateMessage(assistantBody, msg);
      this.history.push({ role: "assistant", text: msg });
      this.saveHistory();
    }
  },

  async callWorkerSitrep(win, data, assistantBody) {
    const cfg = window.BANDAID_CONFIG || {};
    const workerUrl = cfg.WORKER_URL;
    // SITREP go-to model is gemini-3.5-flash; falls back to the everyday primary if it errors.
    const model = (cfg && cfg.SITREP_MODEL) || this.SITREP_MODEL;
    const fallbackModel = (cfg && cfg.MODEL) || "gemini-2.5-flash";
    const systemPrompt = window.BANDAID_PERSONA_PROMPT + "\n\n" + this.SITREP_INSTRUCTIONS;

    const userPayload =
      "Write the Monthly Commander SITREP for the period " + win.label + " (report due " + win.dueLabel + ").\n" +
      "Every number below is pre-computed and authoritative - use these figures and percentages verbatim (see each metric's deltaText) and do not calculate your own.\n\n" +
      "SITREP_DATA\n" + JSON.stringify(data, null, 2);

    const headerPrefix =
      "**MONTHLY COMMANDER SITREP**\n" +
      "**Period Covered:** " + win.label + "  \u00b7  **Due:** " + win.dueLabel + "\n" +
      "**From:** DCCS \u2014 " + FRAMEWORK.hospital + "\n\n";

    const stripCmd = (t) => {
      const i = t.indexOf("[DCCS_COMMAND:");
      return (i >= 0 ? t.slice(0, i) : t).trim();
    };

    const streamUrl = workerUrl + (workerUrl.indexOf("?") >= 0 ? "&" : "?") + "stream=1";
    const response = await fetch(streamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model,
        fallbackModel: fallbackModel,
        systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPayload }] }],
        generationConfig: { temperature: 0.45 }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error((errorData && errorData.error && errorData.error.message) || ("HTTP " + response.status));
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.indexOf("text/event-stream") < 0 || !response.body) {
      const json = await response.json();
      const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
      const text = parts ? parts.map((p) => p.text).filter(Boolean).join("") : "";
      const finalText = headerPrefix + (text ? stripCmd(text) : "No SITREP text returned.");
      this.renderSitrepResult(assistantBody, finalText);
      return finalText;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", reply = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      for (const event of events) {
        const lines = event.split(/\r?\n/);
        for (const line of lines) {
          if (line.indexOf("data:") !== 0) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
            const text = parts ? parts.map((p) => p.text).filter(Boolean).join("") : "";
            if (text) {
              reply += text;
              this.updateMessage(assistantBody, headerPrefix + stripCmd(reply), false);
            }
          } catch (_) { /* ignore partial SSE chunks */ }
        }
      }
    }

    const finalText = headerPrefix + (reply ? stripCmd(reply) : "No SITREP text returned.");
    this.renderSitrepResult(assistantBody, finalText);
    return finalText;
  },

  renderSitrepResult(body, text) {
    body.innerHTML = this.renderText(text);
    const bar = document.createElement("div");
    bar.className = "ask-sitrep-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "ask-sitrep-copy";
    copyBtn.textContent = "Copy SITREP";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text.replace(/\*\*/g, ""));
        copyBtn.textContent = "Copied \u2713";
        setTimeout(() => { copyBtn.textContent = "Copy SITREP"; }, 1800);
      } catch (_) {
        copyBtn.textContent = "Copy failed";
      }
    });
    bar.appendChild(copyBtn);
    body.appendChild(bar);
    this.scrollToBottom(true);
  },

  injectSitrepStyles() {
    if (document.getElementById("sitrep-styles")) return;
    const css =
      ".ask-sitrep-row{display:flex;gap:.5rem;align-items:center;padding:0 1.5rem .75rem}" +
      ".ask-sitrep-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:9px 14px;border-radius:10px;border:1px solid var(--border-accent);background:linear-gradient(180deg,var(--gold),#d69a18);color:#080a08;font-size:.78rem;font-weight:800;letter-spacing:.3px;cursor:pointer;transition:var(--transition)}" +
      ".ask-sitrep-btn:hover{filter:brightness(1.06);transform:translateY(-1px)}" +
      ".ask-sitrep-btn:active{transform:translateY(0)}" +
      ".ask-sitrep-btn #ask-sitrep-period{font-weight:700;opacity:.85}" +
      ".ask-sitrep-prev{padding:9px 10px;border-radius:10px;border:1px solid var(--border-subtle);background:rgba(255,255,255,.03);color:var(--text-secondary);font-size:.72rem;font-weight:700;cursor:pointer;transition:var(--transition);white-space:nowrap}" +
      ".ask-sitrep-prev:hover{color:var(--gold);border-color:var(--border-accent)}" +
      ".ask-sitrep-actions{margin-top:.6rem;display:flex;justify-content:flex-end}" +
      ".ask-sitrep-copy{padding:5px 12px;border-radius:8px;border:1px solid var(--border-accent);background:rgba(255,184,28,.08);color:var(--gold);font-size:.72rem;font-weight:800;cursor:pointer;transition:var(--transition)}" +
      ".ask-sitrep-copy:hover{background:rgba(255,184,28,.16)}" +
      ".ask-sitrep-reminder{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin:.85rem 1.5rem 0;padding:.7rem .9rem;border:1px solid var(--border-accent);border-left:3px solid var(--gold);border-radius:10px;background:rgba(255,184,28,.07)}" +
      ".ask-sitrep-reminder-text{flex:1;min-width:160px;color:var(--text-primary);font-size:.78rem;font-weight:700}" +
      ".ask-sitrep-reminder .gen{padding:5px 12px;border-radius:8px;border:none;background:var(--gold);color:#080a08;font-size:.72rem;font-weight:800;cursor:pointer}" +
      ".ask-sitrep-reminder .gen:hover{background:var(--gold-light)}" +
      ".ask-sitrep-reminder .dismiss{padding:5px 10px;border-radius:8px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-muted);font-size:.72rem;font-weight:700;cursor:pointer}" +
      ".ask-sitrep-reminder .dismiss:hover{color:var(--text-primary)}" +
      "#btn-ask-dr-holtkamp.has-sitrep-due{position:relative}" +
      "#btn-ask-dr-holtkamp.has-sitrep-due::after{content:'';position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 2px rgba(8,9,7,.9),0 0 8px var(--gold);animation:ask-status-pulse 1.8s infinite}";
    const style = document.createElement("style");
    style.id = "sitrep-styles";
    style.textContent = css;
    document.head.appendChild(style);
  },

  /* ---------- Model routing: gemini-3.5-flash = SITREP primary + everyday backup ---------- */
  applyModelConfig() {
    const self = this;
    const apply = function () {
      if (window.BANDAID_CONFIG) {
        // Make gemini-3.5-flash the backup for the everyday Ask Dr. Holtkamp assistant.
        window.BANDAID_CONFIG.FALLBACK_MODEL = self.EVERYDAY_FALLBACK_MODEL;
      }
    };
    apply();
    if (this.dependenciesPromise && typeof this.dependenciesPromise.then === "function") {
      this.dependenciesPromise.then(apply, apply);
    }
  },

  /* ---------- Button wiring + monthly due reminder ---------- */
  initSitrep() {
    this.injectSitrepStyles();
    this.applyModelConfig();
    const genBtn = document.getElementById("ask-sitrep");
    const prevBtn = document.getElementById("ask-sitrep-prev");
    const periodSpan = document.getElementById("ask-sitrep-period");
    if (periodSpan) periodSpan.textContent = this.getSitrepWindow(0).label;
    if (genBtn) genBtn.addEventListener("click", () => this.generateSitrep(0));
    if (prevBtn) prevBtn.addEventListener("click", () => this.generateSitrep(-1));
    this.checkSitrepReminder();
  },

  checkSitrepReminder() {
    const now = new Date();
    const day = now.getDate();
    if (this.SITREP_REMINDER_DAYS.indexOf(day) < 0) return;

    const cycleKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const dismissKey = "dccs-sitrep-reminder-dismissed-" + cycleKey;
    let dismissed = false;
    try { dismissed = localStorage.getItem(dismissKey) === "1"; } catch (_) {}
    if (dismissed) return;

    const D = this.SITREP_DUE_DAY;
    const phrase = day < D
      ? (D - day === 1 ? "is due tomorrow" : "is due in " + (D - day) + " days")
      : "is due TODAY";

    const navBtn = document.getElementById("btn-ask-dr-holtkamp");
    if (navBtn) navBtn.classList.add("has-sitrep-due");

    const panel = this.els.panel;
    const messages = this.els.messages;
    if (panel && messages && !document.getElementById("ask-sitrep-reminder")) {
      const banner = document.createElement("div");
      banner.className = "ask-sitrep-reminder";
      banner.id = "ask-sitrep-reminder";
      const textSpan = document.createElement("span");
      textSpan.className = "ask-sitrep-reminder-text";
      textSpan.textContent = "\u23f0 Monthly Commander SITREP " + phrase + " (the 15th).";
      const gen = document.createElement("button");
      gen.type = "button"; gen.className = "gen"; gen.textContent = "Generate now";
      gen.addEventListener("click", () => this.generateSitrep(0));
      const dismiss = document.createElement("button");
      dismiss.type = "button"; dismiss.className = "dismiss"; dismiss.textContent = "Dismiss";
      dismiss.addEventListener("click", () => {
        try { localStorage.setItem(dismissKey, "1"); } catch (_) {}
        banner.remove();
        if (navBtn) navBtn.classList.remove("has-sitrep-due");
      });
      banner.append(textSpan, gen, dismiss);
      panel.insertBefore(banner, messages);
    }
  }
});

// Boot: ask-dr-holtkamp.js runs init() on load (this script loads right after it),
// so els are already set; call initSitrep now, with a DOMContentLoaded fallback.
(function () {
  function startSitrep() {
    if (window.AskDrHoltkamp && AskDrHoltkamp.els && AskDrHoltkamp.els.panel) {
      AskDrHoltkamp.initSitrep();
    } else if (window.AskDrHoltkamp) {
      document.addEventListener("DOMContentLoaded", function () { AskDrHoltkamp.initSitrep(); });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSitrep);
  } else {
    startSitrep();
  }
})();
