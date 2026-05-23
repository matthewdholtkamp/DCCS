// DCCS Ask Dr. Holtkamp assistant
// Reuses the BAND-AID 6 persona and Gemini Worker from the sibling Bandaid6 app.
const AskDrHoltkamp = {
  isOpen: false,
  isReady: false,
  dependenciesPromise: null,
  history: [],
  els: {},

  DCCS_CONTEXT_RULES: `You are embedded inside the DCCS Operational Framework portal. Use the DCCS_CONTEXT block attached to the latest user message as the authoritative source for current DCCS goals, service-line status, KPI completion, metric trends, HEDIS action items, and meeting-sync context.

Answer in the BAND-AID 6 voice, but stay grounded in the DCCS_CONTEXT. If the context does not contain the requested status, say that plainly and tell the user where the gap is. Do not invent metric values, completion percentages, names, or dates. Do not expose raw JSON. Summarize operationally: BLUF, what it means, what needs attention, and what you would do next.

The context may include only summarized dialogue or notes to reduce sensitive data exposure. Never ask the user to enter patient information, PII, PHI, or classified/sensitive operational details into this chat.`,

  CLINICAL_REFUSAL: "I can't answer clinical or medical questions here. For medical emergencies, call 911. For non-emergency medical issues at General Leonard Wood Army Community Hospital, contact the appropriate GLWACH clinical channel. This assistant is for DCCS operations, goals, KPIs, access systems, quality, staff care, and leadership questions only.",

  CLINICAL_PATTERNS: [
    /\b(pain|ache|hurts?|sore|swollen|bleeding|numb|dizzy|nausea|vomit|fever|rash|cough|sore throat|headache|migraine|chest pain|shortness of breath|symptoms?)\b/i,
    /\b(diagnos(e|is)|treat(ment)?|medication|medicine|dose|dosage|prescription|antibiotic|vaccine|surgery|lab result|x-?ray|mri|ct scan)\b/i,
    /\b(diabetes|hypertension|cancer|infection|covid|flu|pregnan(t|cy)|fracture|sprain|ptsd|depression|anxiety)\b/i,
    /\b(should i take|do i need|what should i do about|is it normal|is it safe|how do i treat)\b/i
  ],
  init() {
    this.els = {
      button: document.getElementById("btn-ask-dr-holtkamp"),
      panel: document.getElementById("ask-dr-holtkamp-panel"),
      backdrop: document.getElementById("ask-backdrop"),
      close: document.getElementById("ask-close"),
      status: document.getElementById("ask-status"),
      messages: document.getElementById("ask-messages"),
      form: document.getElementById("ask-form"),
      input: document.getElementById("ask-input"),
      send: document.getElementById("ask-send")
    };

    if (!this.els.button || !this.els.panel || !this.els.form) return;

    this.history = this.loadHistory();
    this.renderHistory();
    this.updateSendButtonState();

    this.els.button.addEventListener("click", () => this.toggle());
    this.els.close.addEventListener("click", () => this.close());
    this.els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.send();
    });
    this.els.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.send();
      }
    });
    this.els.input.addEventListener("input", () => {
      this.autoSizeInput();
      this.updateSendButtonState();
    });
    this.els.panel.querySelectorAll("[data-ask-prompt]").forEach((button) => {
      button.addEventListener("click", () => {
        this.els.input.value = button.getAttribute("data-ask-prompt") || "";
        this.autoSizeInput();
        this.updateSendButtonState();
        this.els.input.focus();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen) this.close();
    });
    document.addEventListener("click", (event) => {
      if (!this.isOpen) return;
      if (this.els.panel.contains(event.target) || this.els.button.contains(event.target) || this.els.backdrop?.contains(event.target)) return;
      this.close();
    });

    this.dependenciesPromise = this.loadDependencies();
  },

  loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem("dccs-ask-history") || "[]");
      return Array.isArray(parsed) ? parsed.slice(-12) : [];
    } catch (_) {
      return [];
    }
  },

  saveHistory() {
    this.history = this.history.slice(-12);
    localStorage.setItem("dccs-ask-history", JSON.stringify(this.history));
  },

  toggle() {
    this.isOpen ? this.close() : this.open();
  },

  open() {
    this.isOpen = true;
    this.els.panel.classList.add("open");
    this.els.backdrop.classList.add("open");
    this.els.button.classList.add("active");
    this.els.button.setAttribute("aria-expanded", "true");
    setTimeout(() => this.els.input.focus(), 200);
  },

  close() {
    this.isOpen = false;
    this.els.panel.classList.remove("open");
    this.els.backdrop.classList.remove("open");
    this.els.button.classList.remove("active");
    this.els.button.setAttribute("aria-expanded", "false");
  },

  updateSendButtonState() {
    if (!this.els.send) return;
    const hasText = this.els.input.value.trim().length > 0;
    this.els.send.disabled = !hasText || !this.isReady;
  },

  autoSizeInput() {
    const input = this.els.input;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 170)}px`;
  },

  async loadDependencies() {
    this.setStatus("Loading shared BAND-AID 6 persona...");

    await Promise.all([
      window.BANDAID_CONFIG ? Promise.resolve(true) : this.loadScriptCandidates("config.js"),
      window.BANDAID_PERSONA_PROMPT ? Promise.resolve(true) : this.loadScriptCandidates("persona.js")
    ]);

    if (!window.BANDAID_PERSONA_PROMPT) {
      this.setStatus("Shared persona not loaded. Check that Bandaid6/persona.js is published.", "error");
      return;
    }

    if (!window.BANDAID_CONFIG?.WORKER_URL) {
      this.setStatus("Gemini Worker config not loaded. Check Bandaid6/config.js.", "error");
      return;
    }

    this.isReady = true;
    this.updateSendButtonState();
    this.setStatus("Ready - using shared BAND-AID 6 persona and DCCS portal data.", "ready");
  },

  async loadScriptCandidates(fileName) {
    const sibling = new URL(`../Bandaid6/${fileName}`, window.location.href).href;
    const hosted = `https://matthewdholtkamp.github.io/Bandaid6/${fileName}`;
    const localSibling = `../Bandaid6/${fileName}`;
    const candidates = [sibling, localSibling, hosted];

    for (const src of candidates) {
      try {
        await this.loadScript(src);
        return true;
      } catch (_) {
        // Try the next candidate.
      }
    }
    return false;
  },

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((script) => script.dataset.askShared === src);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.askShared = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  setStatus(text, tone = "") {
    if (!this.els.status) return;
    this.els.status.textContent = text;
    this.els.status.className = `ask-status ${tone}`.trim();
  },

  renderHistory() {
    this.els.messages.innerHTML = "";
    if (this.history.length === 0) {
      this.createMessage("assistant", "Ask about DCCS goals, KPI status, service lines, meeting prep, or what needs attention next.");
      return;
    }
    this.history.forEach((message) => {
      this.createMessage(message.role === "user" ? "user" : "assistant", message.text);
    });
  },

  createMessage(role, text) {
    const item = document.createElement("div");
    item.className = `ask-message ${role === "user" ? "user" : "assistant"}`;

    const label = document.createElement("div");
    label.className = "ask-message-label";
    label.textContent = role === "user" ? "You" : "Dr. Holtkamp persona";

    const body = document.createElement("div");
    body.className = "ask-message-body";
    if (role === "assistant" && text === "Thinking...") {
      body.innerHTML = `
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      `;
    } else {
      body.innerHTML = this.renderText(text);
    }

    item.append(label, body);
    this.els.messages.appendChild(item);
    this.scrollToBottom(true);
    return body;
  },

  updateMessage(body, text) {
    if (text === "Thinking...") {
      body.innerHTML = `
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      `;
    } else {
      body.innerHTML = this.renderText(text);
    }
    this.scrollToBottom(false);
  },

  scrollToBottom(smooth = false) {
    this.els.messages.scrollTo({
      top: this.els.messages.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    });
  },

  renderText(text) {
    const escaped = this.escapeHtml(String(text || ""));
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n/g, "<br>");
  },

  escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  },

  isClinicalQuestion(text) {
    return this.CLINICAL_PATTERNS.some((pattern) => pattern.test(text));
  },

  async send() {
    const question = this.els.input.value.trim();
    if (!question || this.els.send.disabled) return;

    this.els.input.value = "";
    this.autoSizeInput();
    this.updateSendButtonState();
    this.history.push({ role: "user", text: question });
    this.saveHistory();
    this.createMessage("user", question);

    if (this.isClinicalQuestion(question)) {
      this.history.push({ role: "assistant", text: this.CLINICAL_REFUSAL });
      this.saveHistory();
      this.createMessage("assistant", this.CLINICAL_REFUSAL);
      return;
    }

    this.els.send.disabled = true;
    const assistantBody = this.createMessage("assistant", "Thinking...");

    try {
      await this.dependenciesPromise;
      if (!this.isReady) throw new Error(this.els.status.textContent || "Assistant is not ready.");

      const reply = await this.callWorker(question, assistantBody);
      this.history.push({ role: "assistant", text: reply });
      this.saveHistory();
    } catch (error) {
      const message = `I could not reach the shared BAND-AID 6 assistant yet. ${error.message || "Check the Worker and shared persona configuration."}`;
      this.updateMessage(assistantBody, message);
      this.history.push({ role: "assistant", text: message });
      this.saveHistory();
    } finally {
      this.updateSendButtonState();
    }
  },

  async callWorker(question, assistantBody) {
    const cfg = window.BANDAID_CONFIG || {};
    const workerUrl = cfg.WORKER_URL;
    const model = cfg.MODEL || "gemini-3.1-flash-lite";
    const fallbackModel = cfg.FALLBACK_MODEL || "gemini-2.5-flash";
    const temperature = typeof cfg.TEMPERATURE === "number" ? cfg.TEMPERATURE : 0.4;
    const thinkingBudget = typeof cfg.THINKING_BUDGET === "number" ? cfg.THINKING_BUDGET : -1;
    const systemPrompt = `${window.BANDAID_PERSONA_PROMPT}\n\n${this.DCCS_CONTEXT_RULES}`;
    const contextBlock = this.buildDccsContext(question);
    const recentHistory = this.history.slice(-10).map((message) => ({
      role: message.role === "user" ? "user" : "model",
      parts: [{ text: message.text }]
    }));

    const latest = recentHistory[recentHistory.length - 1];
    if (latest?.role === "user") {
      latest.parts.push({ text: contextBlock });
    }

    const generationConfig = { temperature };
    if (!Number.isNaN(thinkingBudget)) {
      generationConfig.thinkingConfig = { thinkingBudget };
    }

    const streamUrl = workerUrl + (workerUrl.includes("?") ? "&" : "?") + "stream=1";
    const response = await fetch(streamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        fallbackModel,
        systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
        contents: recentHistory,
        generationConfig
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType.includes("text/event-stream") || !response.body) {
      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("") || "";
      this.updateMessage(assistantBody, text || "No response text returned.");
      return text || "No response text returned.";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";

      for (const event of events) {
        const lines = event.split(/\r?\n/);
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const text = json?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("") || "";
            if (text) {
              reply += text;
              this.updateMessage(assistantBody, reply);
            }
          } catch (_) {
            // Ignore partial or non-JSON SSE chunks.
          }
        }
      }
    }

    if (!reply) {
      reply = "No response text returned.";
      this.updateMessage(assistantBody, reply);
    }
    return reply;
  },

  buildDccsContext(question) {
    const includeNotes = /\b(dialogue|note|notes|roadblock|barrier|issue|sync|decision|update|meeting|hedis)\b/i.test(question);
    const metricStore = this.getMetricStore();
    const taskStore = this.getTaskStore();
    const hedisStore = this.getHedisStore();
    const dialogueStore = this.getDialogueStore();
    const activeServiceLineId = this.getActiveServiceLineId();

    const context = {
      generatedAt: new Date().toISOString(),
      page: {
        url: window.location.href,
        activeServiceLineId,
        source: "DCCS GitHub Pages portal runtime data"
      },
      framework: {
        title: FRAMEWORK.title,
        hospital: FRAMEWORK.hospital,
        installation: FRAMEWORK.installation,
        mission: FRAMEWORK.mission,
        vision: FRAMEWORK.vision,
        motto: FRAMEWORK.motto,
        currentPhase: FRAMEWORK.currentPhase,
        phases: FRAMEWORK.phases,
        linesOfEffort: FRAMEWORK.loes,
        priorityPopulations: FRAMEWORK.priorityPopulations
      },
      serviceLines: FRAMEWORK.serviceLines.map((serviceLine) => this.summarizeServiceLine(serviceLine, {
        metricStore,
        taskStore,
        hedisStore,
        dialogueStore,
        includeNotes
      })),
      crossCuttingTasks: FRAMEWORK.crossCuttingTasks.map((task) => this.summarizeTask(task, taskStore[task.id] || {})),
      safety: {
        notesIncluded: includeNotes,
        notesPolicy: includeNotes
          ? "Only brief operational notes/dialogue excerpts are included. Patient information should never be entered."
          : "Dialogue and notes omitted unless the question asks for them."
      }
    };

    return `DCCS_CONTEXT\n${JSON.stringify(context, null, 2)}`;
  },

  summarizeServiceLine(serviceLine, stores) {
    const trackedMetrics = (serviceLine.trackedMetrics || []).map((metric) => this.summarizeMetric(metric, stores.metricStore));
    const metricGroups = (serviceLine.metricGroups || []).map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      period: group.period,
      series: (group.series || []).map((series) => this.summarizeMetric(series, stores.metricStore))
    }));
    const tasks = (serviceLine.tasks || []).map((task) => this.summarizeTask(task, stores.taskStore[task.id] || {}));
    const hedis = stores.hedisStore[serviceLine.id] || {};
    const dialogue = stores.dialogueStore[serviceLine.id] || [];

    return {
      id: serviceLine.id,
      name: serviceLine.name,
      abbreviation: serviceLine.abbr,
      leader: serviceLine.leader,
      clinics: serviceLine.clinics || [],
      trackedMetrics,
      metricGroups,
      tasks,
      hedis: serviceLine.hedisMetrics ? this.summarizeHedis(serviceLine, hedis, stores.includeNotes) : undefined,
      dialogue: stores.includeNotes ? this.summarizeDialogue(dialogue) : { entryCount: dialogue.length }
    };
  },

  summarizeTask(task, saved) {
    const builtInKpis = (task.kpis || []).map((kpi, index) => ({
      text: kpi,
      checked: !!saved.kpis?.[index],
      deleted: !!saved.deletedKpis?.[index]
    })).filter((kpi) => !kpi.deleted);
    const customKpis = Array.isArray(saved.customKpis)
      ? saved.customKpis.map((kpi, index) => ({
          text: kpi,
          checked: !!saved.kpis?.[`custom-${index}`],
          custom: true
        }))
      : [];
    const visibleKpis = [...builtInKpis, ...customKpis];
    const completed = visibleKpis.filter((kpi) => kpi.checked).length;

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      phase: task.phase,
      lineOfEffort: task.loe,
      status: saved.status || task.status || "not-reviewed",
      kpiProgress: `${completed}/${visibleKpis.length}`,
      kpis: visibleKpis,
      notes: saved.notes ? this.truncate(saved.notes, 600) : undefined
    };
  },

  summarizeMetric(metric, metricStore) {
    const entries = Array.isArray(metricStore[metric.id]) ? [...metricStore[metric.id]] : [];
    entries.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    const latest = entries[entries.length - 1] || null;
    const previous = entries[entries.length - 2] || null;
    const goalStatus = latest ? this.metricGoalStatus(metric, latest.value) : "no-data";

    return {
      id: metric.id,
      name: metric.name,
      unit: metric.unit,
      goal: metric.goal ?? null,
      direction: metric.direction || "neutral",
      period: metric.period || null,
      entryCount: entries.length,
      latest,
      previous,
      goalStatus,
      recentEntries: entries.slice(-4)
    };
  },

  metricGoalStatus(metric, value) {
    if (metric.goal === null || metric.goal === undefined) return "no-goal-set";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "invalid-value";
    if (metric.direction === "lower") return numeric <= Number(metric.goal) ? "meets-goal" : "above-goal";
    if (metric.direction === "higher") return numeric >= Number(metric.goal) ? "meets-goal" : "below-goal";
    return "tracked";
  },

  summarizeHedis(serviceLine, saved, includeNotes) {
    return {
      measures: serviceLine.hedisMetrics || [],
      checkedItems: saved.kpis || {},
      customKpis: saved.customKpis || [],
      notes: includeNotes && saved.notes ? this.truncate(saved.notes, 1000) : undefined
    };
  },

  summarizeDialogue(entries) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    return {
      entryCount: safeEntries.length,
      recentEntries: safeEntries.slice(0, 2).map((entry) => ({
        date: entry.date,
        text: this.truncate(entry.text || "", 700)
      }))
    };
  },

  truncate(value, maxLength) {
    const text = String(value || "").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
  },

  getTaskStore() {
    try {
      return Sync?.getTaskStore?.() || {};
    } catch (_) {
      return {};
    }
  },

  getMetricStore() {
    try {
      return Sync?.getMetricStore?.() || {};
    } catch (_) {
      return {};
    }
  },

  getHedisStore() {
    try {
      return Sync?.getHedisStore?.() || {};
    } catch (_) {
      return {};
    }
  },

  getDialogueStore() {
    try {
      return Sync?.getDialogueStore?.() || {};
    } catch (_) {
      return {};
    }
  },

  getActiveServiceLineId() {
    const parts = (location.hash.slice(1) || "/").split("/").filter(Boolean);
    return parts[0] === "framework" ? parts[1] || null : null;
  }
};

window.AskDrHoltkamp = AskDrHoltkamp;
document.addEventListener("DOMContentLoaded", () => AskDrHoltkamp.init());
