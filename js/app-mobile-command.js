// Mobile-first DCCS capture tools. Records meeting audio and routes it to Gemini.
// Desktop app behavior is left unchanged.
(function () {
  const MobileCommand = {
    els: {},
    mediaRecorder: null,
    chunks: [],
    audioBlob: null,
    audioMime: "",
    stream: null,
    wakeLock: null,
    isRecording: false,
    startedAt: 0,
    timerId: null,

    init() {
      this.els = {
        askAction: document.getElementById("mobile-ask-action"),
        recordAction: document.getElementById("mobile-record-action"),
        recorder: document.getElementById("mobile-recorder"),
        close: document.getElementById("mobile-recorder-close"),
        scope: document.getElementById("mobile-recorder-scope"),
        timer: document.getElementById("mobile-recorder-timer"),
        state: document.getElementById("mobile-recorder-state"),
        transcript: document.getElementById("mobile-recorder-transcript"),
        start: document.getElementById("mobile-recorder-start"),
        stop: document.getElementById("mobile-recorder-stop"),
        submit: document.getElementById("mobile-recorder-submit"),
        home: document.getElementById("ask-home")
      };

      if (!this.els.askAction || !this.els.recordAction || !this.els.recorder) return;

      this.populateServiceLineOptions();
      this.detectSupport();

      this.els.askAction.addEventListener("click", () => this.openAsk());
      this.els.recordAction.addEventListener("click", () => this.openRecorder());
      this.els.close.addEventListener("click", () => this.closeRecorder());
      this.els.start.addEventListener("click", () => this.startRecording());
      this.els.stop.addEventListener("click", () => this.stopRecording());
      this.els.submit.addEventListener("click", () => this.submitRecording());
      this.els.transcript.addEventListener("input", () => this.updateSubmitState());
      if (this.els.home) this.els.home.addEventListener("click", () => this.goHome());
      document.addEventListener("visibilitychange", () => this.handleVisibility());
    },

    populateServiceLineOptions() {
      if (!this.els.scope || typeof FRAMEWORK === "undefined") return;
      const all = document.createElement("option");
      all.value = "";
      all.textContent = "All service lines (auto-route)";
      this.els.scope.appendChild(all);
      (FRAMEWORK.serviceLines || []).forEach((sl) => {
        const option = document.createElement("option");
        option.value = sl.id;
        option.textContent = `${sl.name}${sl.abbr ? ` (${sl.abbr})` : ""}`;
        this.els.scope.appendChild(option);
      });
      this.els.scope.value = "";
    },

    detectSupport() {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        this.setState("Recording isn't supported here - type or paste notes, then Summarize.");
      } else {
        this.setState("Ready. Tap Start, set the phone down, keep this screen on.");
      }
    },

    pickMime() {
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"];
      for (const t of types) {
        try { if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; } catch (_) {}
      }
      return "";
    },

    openAsk() {
      if (!window.AskDrHoltkamp) return;
      AskDrHoltkamp.open();
      if (AskDrHoltkamp.els && AskDrHoltkamp.els.input) {
        AskDrHoltkamp.els.input.placeholder = "Ask about a service line, metric, KPI, or next action...";
      }
    },

    openRecorder() {
      this.resetRecorderState();
      this.els.recorder.classList.add("open");
      this.els.recorder.setAttribute("aria-hidden", "false");
      this.updateSubmitState();
      setTimeout(() => this.els.start.focus(), 50);
    },

    closeRecorder() {
      this.stopRecording(false);
      this.els.recorder.classList.remove("open");
      this.els.recorder.setAttribute("aria-hidden", "true");
    },

    resetRecorderState() {
      this.audioBlob = null;
      this.chunks = [];
      if (this.els.timer) this.els.timer.textContent = "00:00";
      if (this.els.start) this.els.start.disabled = false;
      if (this.els.stop) this.els.stop.disabled = true;
      this.detectSupport();
    },

    async startRecording() {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        this.setState("Recording unsupported here - type or paste notes.");
        this.els.transcript.focus();
        return;
      }
      if (window.AskDrHoltkamp && AskDrHoltkamp.stopMic) AskDrHoltkamp.stopMic();

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn("DCCS Mobile Recorder: mic blocked:", err);
        this.setState("Microphone blocked. Allow mic access in the browser, or type/paste notes.");
        return;
      }

      this.audioMime = this.pickMime();
      this.chunks = [];
      this.audioBlob = null;
      try {
        this.mediaRecorder = this.audioMime
          ? new MediaRecorder(this.stream, { mimeType: this.audioMime })
          : new MediaRecorder(this.stream);
      } catch (_) {
        this.mediaRecorder = new MediaRecorder(this.stream);
      }

      this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        const type = this.audioMime || (this.mediaRecorder && this.mediaRecorder.mimeType) || "audio/webm";
        this.audioBlob = this.chunks.length ? new Blob(this.chunks, { type }) : null;
        this.updateSubmitState();
      };

      try {
        this.mediaRecorder.start();
      } catch (err) {
        console.warn("DCCS Mobile Recorder: could not start:", err);
        this.setState("Mic could not start. Type or paste notes.");
        return;
      }

      this.isRecording = true;
      this.startedAt = Date.now();
      this.els.start.disabled = true;
      this.els.stop.disabled = false;
      this.els.submit.disabled = true;
      this.setState("Recording... keep this screen on.");
      this.tickTimer();
      this.timerId = window.setInterval(() => this.tickTimer(), 1000);
      this.requestWakeLock();
    },

    stopRecording(updateState = true) {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        try { this.mediaRecorder.stop(); } catch (_) {}
      }
      if (this.stream) {
        try { this.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
        this.stream = null;
      }
      this.releaseWakeLock();
      this.isRecording = false;
      window.clearInterval(this.timerId);
      this.timerId = null;
      if (this.els.start) this.els.start.disabled = false;
      if (this.els.stop) this.els.stop.disabled = true;
      if (updateState) this.setState("Stopped. Tap Summarize to transcribe and route.");
      this.updateSubmitState();
    },

    async requestWakeLock() {
      try {
        if ("wakeLock" in navigator) this.wakeLock = await navigator.wakeLock.request("screen");
      } catch (_) {}
    },

    releaseWakeLock() {
      try { if (this.wakeLock) { this.wakeLock.release(); this.wakeLock = null; } } catch (_) {}
    },

    handleVisibility() {
      if (document.visibilityState === "visible" && this.isRecording && !this.wakeLock) {
        this.requestWakeLock();
      }
    },

    tickTimer() {
      const elapsed = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
      const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const seconds = String(elapsed % 60).padStart(2, "0");
      this.els.timer.textContent = `${minutes}:${seconds}`;
    },

    setState(text) {
      if (this.els.state) this.els.state.textContent = text;
    },

    updateSubmitState() {
      if (!this.els.submit || this.isRecording) return;
      const hasAudio = !!(this.audioBlob && this.audioBlob.size > 0);
      const hasText = this.els.transcript.value.trim().length >= 12;
      this.els.submit.disabled = !(hasAudio || hasText);
    },

    blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result || "");
          const i = s.indexOf(",");
          resolve(i >= 0 ? s.slice(i + 1) : s);
        };
        r.onerror = () => reject(new Error("Could not read audio"));
        r.readAsDataURL(blob);
      });
    },

    async submitRecording() {
      this.stopRecording(false);
      const selected = this.els.scope.value;
      const sl = selected && typeof FRAMEWORK !== "undefined"
        ? FRAMEWORK.serviceLines.find((item) => item.id === selected)
        : null;
      const focus = sl ? `${sl.name} (${sl.id})` : "all DCCS service lines";

      if (this.audioBlob && this.audioBlob.size > 0 && window.AskDrHoltkamp && AskDrHoltkamp.sendMeetingAudio) {
        this.setState("Transcribing the meeting...");
        let base64;
        try { base64 = await this.blobToBase64(this.audioBlob); }
        catch (_) { this.setState("Could not read the recording. Try again or paste notes."); return; }
        this.closeRecorder();
        AskDrHoltkamp.sendMeetingAudio(base64, this.audioBlob.type || this.audioMime || "audio/webm", focus);
        return;
      }

      const transcript = this.els.transcript.value.trim();
      if (!transcript) { this.setState("No audio or notes to summarize yet."); return; }
      const date = window.App && App.getLocalToday ? App.getLocalToday() : new Date().toISOString().slice(0, 10);
      const prompt = [
        "MEETING_RECORDER_INPUT",
        `Date: ${date}`,
        `Focus: ${focus}`,
        "",
        "You are reviewing a mobile meeting/input transcript for the DCCS portal.",
        "Summarize the BLUF, decisions, roadblocks, metric updates, task/KPI updates, and follow-up items.",
        "Route each relevant item to the correct service line / metric / task / KPI.",
        "Only create DCCS command actions when the destination, date, metric/task/KPI, and value/text are clear.",
        "List anything ambiguous under 'Needs user confirmation' without a command.",
        "",
        "Transcript:",
        transcript
      ].join("\n");
      this.closeRecorder();
      this.sendPromptViaAsk(prompt);
    },

    goHome() {
      if (window.AskDrHoltkamp && AskDrHoltkamp.close) AskDrHoltkamp.close();
      this.closeRecorder();
      this.resetRecorderState();
      const home = document.getElementById("mobile-command-center");
      if (home) home.scrollTop = 0;
      window.scrollTo(0, 0);
    },

    sendPromptViaAsk(prompt) {
      if (!window.AskDrHoltkamp) return;
      if (!AskDrHoltkamp.els || !AskDrHoltkamp.els.input) AskDrHoltkamp.init();
      AskDrHoltkamp.open();
      AskDrHoltkamp.els.input.value = prompt;
      AskDrHoltkamp.autoSizeInput();

      const sendWhenReady = () => {
        AskDrHoltkamp.updateSendButtonState();
        AskDrHoltkamp.send();
      };

      if (AskDrHoltkamp.isReady) { sendWhenReady(); return; }

      this.setState("Ask Dr. Holtkamp is loading...");
      const started = Date.now();
      const interval = window.setInterval(() => {
        if (AskDrHoltkamp.isReady) {
          window.clearInterval(interval);
          sendWhenReady();
        } else if (Date.now() - started > 10000) {
          window.clearInterval(interval);
          AskDrHoltkamp.updateSendButtonState();
        }
      }, 250);
    }
  };

  window.MobileCommand = MobileCommand;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => MobileCommand.init());
  } else {
    MobileCommand.init();
  }
}());
