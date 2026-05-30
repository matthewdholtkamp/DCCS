// DCCS Ask Dr. Holtkamp assistant
// Reuses the BAND-AID 6 persona and Gemini Worker from the sibling Bandaid6 app.
const AskDrHoltkamp = {
  isOpen: false,
  isReady: false,
  dependenciesPromise: null,
  history: [],
  els: {},
  DCCS_CONTEXT_RULES: `You are embedded inside the DCCS Operational Framework portal. Use the DCCS_CONTEXT block attached to the latest user message as the authoritative source for current DCCS goals, service-line status, KPI completion, metric trends, HEDIS action items, and meeting-sync context.

You have access to the complete history of dialogue comments and metric data points in the context. Analyze long-term performance trends and directly correlate metric fluctuations with the operational roadblocks, decisions, or notes recorded on corresponding dates.

Answer in the BAND-AID 6 voice, but stay grounded in the DCCS_CONTEXT. If the context does not contain the requested status, say that plainly and tell the user where the gap is. Do not invent metric values, completion percentages, names, or dates. Do not expose raw JSON. Summarize operationally: BLUF, what it means, what needs attention, and what you would do next.

The context may include only summarized dialogue or notes to reduce sensitive data exposure. Never ask the user to enter patient information, PII, PHI, or classified/sensitive operational details into this chat.

============================================================
DATA WRITING / PORTAL UPDATING CAPABILITY
============================================================
If the user asks you to update, add, change, check, clear, or record any data (such as a metric value, a weekly dialogue comment/roadblock, a task status, or a KPI checkmark), you MUST perform this change by appending a structured command block at the very end of your response text.

IMPORTANT: The portal has an active client-side executor (the "bridge" is fully functional). When you output a command block, the portal JavaScript immediately intercepts it, writes it to the local cache/Firestore database, and updates the screen. Therefore, you CAN and DO save data to the page! Confidently tell the user that the data has been recorded and updated on the dashboard. Do not tell the user that you cannot write to the database or that they have to do it manually. When asked if you saved it, verify if the value is in the DCCS_CONTEXT; if it is, confirm to the user that it is saved and visible on the screen.

Format the command block exactly as:
[DCCS_COMMAND: <JSON_ARRAY_OF_COMMANDS>]

Available commands inside the JSON array:
1. Update Metric Value:
   { "action": "update_metric", "metricId": "<metric-id>", "value": <number>, "date": "YYYY-MM-DD" }
   * Updates or inserts a value for a metric. "metricId" must match the ID from the context. Valid IDs are:
     - PCSL: "pcsl-acute", "pcsl-followup", "pcsl-medic", "pcsl-nursing", "pcsl-virtual"
     - Surgery (3SL): "surgery-total", "surgery-obgyn", "surgery-general", "surgery-ortho"
     - Mental Health (MH): "mh-active-duty-off-post", "mh-brave-usage"
     - Emergency Department (ED): "er-total-census", "er-total-trainees", "er-esi-1-2", "er-esi-3", "er-esi-4-5", "er-lwobs"
     - MSCoE Model: "mscoe-total-trainees", "mscoe-self-care", "mscoe-adtmc-medic-care"
   * Date MUST be in "YYYY-MM-DD" format. If the user doesn't specify a date, default to the current local date (today).
2. Add Weekly Dialogue / Roadblock Entry:
   { "action": "add_dialogue", "serviceLineId": "<service-line-id>", "text": "<entry-text>", "date": "YYYY-MM-DD" }
   * Appends a new dialogue comment to the service line ("pcsl", "surgery", "mental-health", "emergency", "mscoe").
   * Text should be the operational roadblock or update provided by the user.
3. Update Task Status:
   { "action": "update_task_status", "taskId": "<task-id>", "status": "not-reviewed" | "in-progress" | "complete" }
    * Updates the overall completion state of a task (e.g. "pcsl-p1-1", "surg-p2-1", etc.).
4. Check/Uncheck Task KPI:
   { "action": "update_task_kpi", "taskId": "<task-id>", "kpiKey": "<kpi-key>", "checked": true | false }
   * Checks or unchecks a KPI under a specific task. "kpiKey" must be the exact key string (e.g., "0", "1", "custom-0") provided in the DCCS_CONTEXT KPI list.

Always confirm in a direct, command-intent voice that you have applied the requested changes, explaining what was updated, and append the command block. Do not output raw JSON tags in your conversational response text; keep the [DCCS_COMMAND: ...] block as the very last line.`,
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

    this.history = [];
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
    return [];
  },

  saveHistory() {
    // Strictly in-memory session history
  },

  toggle() {
    this.isOpen ? this.close() : this.open();
  },

  open() {
    this.isOpen = true;
    this.history = []; // Reset history for a fresh session
    this.renderHistory(); // Re-render greeting message
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
    if (role === "user") {
      body.innerHTML = this.renderText(text);
    } else {
      this.processIncomingText(body, text);
    }

    item.append(label, body);
    this.els.messages.appendChild(item);
    this.scrollToBottom(true);
    return body;
  },

  updateMessage(body, text) {
    this.processIncomingText(body, text);
    this.scrollToBottom(false);
  },

  processIncomingText(body, text) {
    if (text === "Thinking...") {
      body.innerHTML = `
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      `;
      return;
    }

    // Check for DCCS command block using substring search for ultimate bracket nesting resilience
    const commandMarker = "[DCCS_COMMAND:";
    const markerIndex = text.indexOf(commandMarker);

    let cleanText = text;
    let commands = null;

    if (markerIndex >= 0) {
      cleanText = text.substring(0, markerIndex).trim();
      const commandString = text.substring(markerIndex + commandMarker.length).trim();

      const startIdx = commandString.indexOf("[");
      if (startIdx >= 0) {
        const jsonCandidatePart = commandString.substring(startIdx);
        // Find all indices of ']' in the substring
        const bracketIndices = [];
        let pos = jsonCandidatePart.indexOf("]");
        while (pos !== -1) {
          bracketIndices.push(pos);
          pos = jsonCandidatePart.indexOf("]", pos + 1);
        }

        // Try parsing from the rightmost ']' to the leftmost
        for (let i = bracketIndices.length - 1; i >= 0; i--) {
          const endIdx = bracketIndices[i];
          let candidate = jsonCandidatePart.substring(0, endIdx + 1).trim();
          // Strip markdown code block formatting (like ```json ... ```)
          candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

          try {
            commands = JSON.parse(candidate);
            if (commands) break; // Found valid commands!
          } catch (_) {
            // Try the next bracket index
          }
        }
      }
    }

    body.innerHTML = this.renderText(cleanText);

    // If we have parsed commands, execute them!
    if (commands) {
      this.executeCommands(commands, body);
    }
  },

  executeCommands(commands, body) {
    const commandsArray = Array.isArray(commands) ? commands : [commands];
    const results = [];

    commandsArray.forEach((cmd) => {
      try {
        switch (cmd.action) {
          case "update_metric": {
            const mappedId = this.validateAndMapMetricId(cmd.metricId);
            this.updateMetricLocal(mappedId, cmd.value, cmd.date);
            results.push(`Updated metric "${mappedId}" to ${cmd.value}`);
            break;
          }
          case "add_dialogue":
            this.addDialogueLocal(cmd.serviceLineId, cmd.text, cmd.date);
            results.push(`Added dialogue entry to ${cmd.serviceLineId.toUpperCase()}`);
            break;
          case "update_task_status":
            this.updateTaskStatusLocal(cmd.taskId, cmd.status);
            results.push(`Updated task "${cmd.taskId}" status to ${cmd.status}`);
            break;
          case "update_task_kpi": {
            const key = cmd.kpiKey !== undefined ? cmd.kpiKey : cmd.kpiIndex;
            this.updateTaskKpiLocal(cmd.taskId, key, cmd.checked);
            results.push(`${cmd.checked ? "Checked" : "Unchecked"} KPI "${key}" in task "${cmd.taskId}"`);
            break;
          }
          default:
            console.warn("Unknown command action:", cmd.action);
        }
      } catch (err) {
        console.error("Error executing command:", cmd, err);
        results.push(`Failed update for ${cmd.action}: ${err.message}`);
      }
    });

    if (results.length > 0) {
      const systemLog = document.createElement("div");
      systemLog.className = "ask-system-log";
      systemLog.innerHTML = results.map(r => `<div>✓ ${r}</div>`).join("");
      body.appendChild(systemLog);

      if (window.App && typeof window.App.route === "function") {
        window.App.route();
      }
    }
  },

  normalizeDate(dateString) {
    if (!dateString) {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const trimmed = String(dateString).trim();
    const yyyymmddRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (yyyymmddRegex.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.toLowerCase() === "today" || trimmed.toLowerCase() === "now") {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    try {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (_) {}

    // Fallback to local today
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  validateAndMapMetricId(metricId) {
    const validIds = [
      "pcsl-acute", "pcsl-followup", "pcsl-medic", "pcsl-nursing", "pcsl-virtual", 
      "surgery-total", "surgery-obgyn", "surgery-general", "surgery-ortho",
      "mh-active-duty-off-post", "mh-brave-usage",
      "er-total-census", "er-total-trainees", "er-esi-1-2", "er-esi-3", "er-esi-4-5", "er-lwobs",
      "mscoe-total-trainees", "mscoe-self-care", "mscoe-adtmc-medic-care"
    ];

    const lowerId = String(metricId || "").trim().toLowerCase();

    if (validIds.includes(lowerId)) return lowerId;

    // Legacy prompt/hallucinated ID mappings
    const mappings = {
      "pcsl-wait-time": "pcsl-acute",
      "pcsl-satisfaction": "pcsl-acute",
      "pcsl-enrollees": "pcsl-virtual",
      "tsl-wait-time": "pcsl-acute",
      "mscoe-clinic-wait": "mscoe-total-trainees",
      "mscoe-physical-wait": "mscoe-total-trainees",
      "mscoe-pt-wait": "mscoe-total-trainees"
    };

    if (mappings[lowerId]) {
      console.warn(`DCCS Ask: Auto-mapping mismatched metric ID "${metricId}" to "${mappings[lowerId]}"`);
      return mappings[lowerId];
    }

    // Closest match search
    for (const valid of validIds) {
      if (valid.includes(lowerId) || lowerId.includes(valid)) {
        return valid;
      }
    }

    throw new Error(`Metric ID "${metricId}" is invalid. Please use a valid ID from the context.`);
  },

  updateMetricLocal(metricId, value, dateString) {
    const date = this.normalizeDate(dateString);
    const val = Number(value);
    if (Number.isNaN(val)) throw new Error("Invalid metric value");

    const store = { ...Sync.getMetricStore() };
    const entries = Array.isArray(store[metricId]) ? [...store[metricId]] : [];
    
    const existingIndex = entries.findIndex(e => e.date === date);
    if (existingIndex >= 0) {
      entries[existingIndex].value = val;
    } else {
      entries.push({ date, value: val });
    }

    // Chronologically sort entries to prevent layout/drawing jank
    entries.sort((a, b) => a.date.localeCompare(b.date));

    store[metricId] = entries;
    Sync.saveMetricStore(store);
  },

  addDialogueLocal(serviceLineId, text, dateString) {
    const date = this.normalizeDate(dateString);
    const entries = [...Sync.getDialogueEntries(serviceLineId)];
    
    entries.unshift({ date, text });
    
    // Sort reverse-chronologically so it displays correctly on the UI
    entries.sort((a, b) => b.date.localeCompare(a.date));

    Sync.saveDialogueEntries(serviceLineId, entries);
  },

  updateTaskStatusLocal(taskId, status) {
    if (!["not-reviewed", "in-progress", "complete"].includes(status)) {
      throw new Error("Invalid task status");
    }
    Sync.saveTaskData(taskId, { status });
  },

  updateTaskKpiLocal(taskId, kpiKey, checked) {
    const taskData = Sync.getTaskData(taskId) || {};
    const kpis = { ...taskData.kpis };
    const kpiDates = { ...taskData.kpiDates };
    kpis[kpiKey] = !!checked;
    if (checked) {
      kpiDates[kpiKey] = this.normalizeDate();
    } else {
      delete kpiDates[kpiKey];
    }
    Sync.saveTaskData(taskId, { kpis, kpiDates });
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
    const includeNotes = true;
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
        notesIncluded: true,
        notesPolicy: "Only brief operational notes/dialogue excerpts are included. Patient information should never be entered."
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
      key: String(index),
      text: kpi,
      checked: !!saved.kpis?.[index],
      deleted: !!saved.deletedKpis?.[index]
    })).filter((kpi) => !kpi.deleted);
    const customKpis = Array.isArray(saved.customKpis)
      ? saved.customKpis.map((kpi, index) => ({
          key: `custom-${index}`,
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
      recentEntries: entries
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
      recentEntries: safeEntries.map((entry) => ({
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
