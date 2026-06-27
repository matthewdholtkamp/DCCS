// Mobile-first DCCS capture tools. Uses browser speech recognition to build
// a recoverable meeting transcript; no audio file is stored or uploaded.
(function () {
  const MobileCommand = {
    DRAFT_KEY: "dccs-mobile-transcript-draft",
    DRAFT_VERSION: 1,
    checkpointIntervalMs: 15000,
    draftSaveDelayMs: 400,
    restartBaseDelayMs: 300,
    restartMaxDelayMs: 5000,
    els: {},
    recognition: null,
    recognitionActive: false,
    recognitionStartedAt: 0,
    restartAttempts: 0,
    isRecording: false,
    stopRequested: false,
    fatalRecognitionError: false,
    resumeOnVisible: false,
    wakeLock: null,
    startedAt: 0,
    elapsedSeconds: 0,
    timerId: null,
    restartTimerId: null,
    checkpointTimerId: null,
    draftSaveTimerId: null,
    visibilityResumeTimerId: null,

    now() {
      return Date.now();
    },

    init() {
      this.els = {
        askAction: document.getElementById("mobile-ask-action"),
        recordAction: document.getElementById("mobile-record-action"),
        recorder: document.getElementById("mobile-recorder"),
        close: document.getElementById("mobile-recorder-close"),
        timer: document.getElementById("mobile-recorder-timer"),
        state: document.getElementById("mobile-recorder-state"),
        transcript: document.getElementById("mobile-recorder-transcript"),
        toggle: document.getElementById("mobile-recorder-toggle"),
        submit: document.getElementById("mobile-recorder-submit"),
        clear: document.getElementById("mobile-recorder-clear"),
        wakeStatus: document.getElementById("mobile-recorder-wake-status"),
        draftStatus: document.getElementById("mobile-recorder-draft-status"),
        home: document.getElementById("ask-home")
      };
      if (!this.els.askAction || !this.els.recordAction || !this.els.recorder) return;

      this.initSpeechRecognition();
      this.restoreDraft();
      this.els.askAction.addEventListener("click", () => this.openAsk());
      this.els.recordAction.addEventListener("click", () => this.openRecorder());
      this.els.close.addEventListener("click", () => this.closeRecorder());
      if (this.els.toggle) this.els.toggle.addEventListener("click", () => this.toggleRecording());
      if (this.els.submit) this.els.submit.addEventListener("click", () => this.submitTranscript());
      if (this.els.clear) this.els.clear.addEventListener("click", () => this.confirmClearTranscript());
      if (this.els.transcript) {
        this.els.transcript.addEventListener("input", () => {
          this.updateSubmitState();
          this.scheduleDraftSave();
        });
      }
      if (this.els.home) this.els.home.addEventListener("click", () => this.goHome());
      document.addEventListener("visibilitychange", () => this.handleVisibilityChange());
      window.addEventListener("pagehide", () => this.saveDraft());
      this.updateDurabilityStatus();
      this.updateSubmitState();
    },

    initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.setState("Live transcription is unavailable here. Type, paste, or use your phone keyboard's dictation below.");
        return;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.lang = "en-US";
      this.recognition.interimResults = true;
      this.recognition.continuous = true;

      this.recognition.onstart = () => {
        this.recognitionActive = true;
        this.recognitionStartedAt = this.now();
        if (this.isRecording) this.setState("Listening... keep this page open and in the foreground.");
      };

      this.recognition.onresult = (event) => {
        const finalParts = [];
        const interimParts = [];

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const text = String(event.results[i][0]?.transcript || "").trim();
          if (!text) continue;
          if (event.results[i].isFinal) finalParts.push(text);
          else interimParts.push(text);
        }

        if (finalParts.length) {
          this.restartAttempts = 0;
          this.appendTranscript(finalParts.join(" "));
        }
        if (!this.isRecording) return;
        this.setState(
          interimParts.length
            ? `Listening... ${interimParts.join(" ")}`
            : "Listening... keep this page open and in the foreground."
        );
      };

      this.recognition.onerror = (event) => {
        const error = event.error || "unknown";
        if (error === "aborted" && this.stopRequested) return;
        if (error === "no-speech" && this.isRecording) {
          this.setState("Listening... waiting for speech.");
          return;
        }

        const permissionError = error === "not-allowed" || error === "service-not-allowed";
        const captureError = error === "audio-capture";
        const languageError = error === "language-not-supported";
        this.fatalRecognitionError = permissionError || captureError || languageError || error === "network";
        this.finishRecordingState({ save: true });

        if (permissionError) {
          this.setState("Microphone access was blocked. Allow access, or type, paste, or use keyboard dictation below.");
        } else if (captureError) {
          this.setState("No microphone was available. Type, paste, or use keyboard dictation below.");
        } else if (error === "network") {
          this.setState("Live transcription lost its connection. Your saved transcript is preserved; tap the mic to resume.");
        } else {
          this.setState("Live transcription paused. Your saved transcript is preserved; tap the mic to resume.");
        }
      };

      this.recognition.onend = () => {
        const sessionMs = Math.max(0, this.now() - this.recognitionStartedAt);
        this.recognitionActive = false;
        this.recognitionStartedAt = 0;
        if (sessionMs > 10000) this.restartAttempts = 0;
        if (this.isRecording && !this.stopRequested && !this.fatalRecognitionError) {
          this.scheduleRecognitionRestart();
          return;
        }
        if (!this.isRecording) this.updateSubmitState();
      };

      this.setState("Tap the mic to begin live transcription. Keep this page open while recording.");
    },

    openAsk() {
      if (!window.AskDrHoltkamp) return;
      AskDrHoltkamp.open();
      if (AskDrHoltkamp.els && AskDrHoltkamp.els.input) {
        AskDrHoltkamp.els.input.placeholder = "Ask about a service line, metric, KPI, or next action...";
      }
    },

    openRecorder() {
      this.els.recorder.classList.add("open");
      this.els.recorder.setAttribute("aria-hidden", "false");
      if (!this.isRecording) {
        if (!this.recognition) {
          this.setState("Live transcription is unavailable here. Type, paste, or use your phone keyboard's dictation below.");
        } else if (this.els.transcript?.value.trim()) {
          this.setState("Your saved transcript is ready. Continue recording, edit it, or send it to Ask Dr. Holtkamp.");
        } else {
          this.setState("Tap the mic to begin live transcription. Keep this page open while recording.");
        }
      }
      this.updateTimer();
      this.updateDurabilityStatus();
      this.updateSubmitState();
      window.setTimeout(() => {
        if (this.recognition && this.els.toggle) this.els.toggle.focus();
        else if (this.els.transcript) this.els.transcript.focus();
      }, 50);
    },

    closeRecorder() {
      this.resumeOnVisible = false;
      this.stopRecording(false);
      this.els.recorder.classList.remove("open");
      this.els.recorder.setAttribute("aria-hidden", "true");
    },

    setToggle(recording) {
      if (!this.els.toggle) return;
      this.els.toggle.classList.toggle("recording", recording);
      this.els.toggle.setAttribute("aria-label", recording ? "Stop live transcription" : "Start live transcription");
      this.els.toggle.setAttribute("aria-pressed", recording ? "true" : "false");
    },

    toggleRecording() {
      this.resumeOnVisible = false;
      if (this.isRecording) this.stopRecording();
      else this.startRecording();
    },

    startRecording() {
      if (!this.recognition) {
        this.setState("Live transcription is unavailable here. Type, paste, or use your phone keyboard's dictation below.");
        if (this.els.transcript) this.els.transcript.focus();
        return false;
      }
      if (this.recognitionActive) {
        this.setState("The microphone is finishing the previous session. Try again in a moment.");
        return false;
      }
      if (window.AskDrHoltkamp && AskDrHoltkamp.stopMic) AskDrHoltkamp.stopMic();

      this.stopRequested = false;
      this.fatalRecognitionError = false;
      this.restartAttempts = 0;
      this.isRecording = true;
      this.startedAt = this.now();
      this.setToggle(true);
      this.updateSubmitState();
      this.setState("Starting microphone...");
      this.updateTimer();
      window.clearInterval(this.timerId);
      this.timerId = window.setInterval(() => this.updateTimer(), 1000);
      this.startCheckpointing();
      void this.requestWakeLock();

      try {
        this.recognition.start();
        return true;
      } catch (error) {
        console.warn("DCCS Mobile Transcript: could not start speech recognition:", error);
        this.finishRecordingState({ save: true });
        this.setState("The microphone could not start. Tap the mic to try again, or enter the transcript below.");
        return false;
      }
    },

    scheduleRecognitionRestart() {
      window.clearTimeout(this.restartTimerId);
      const exponent = Math.min(this.restartAttempts, 5);
      const delay = Math.min(this.restartBaseDelayMs * Math.pow(2, exponent), this.restartMaxDelayMs);
      this.restartAttempts += 1;
      this.setState(`Transcription reconnecting${this.restartAttempts > 1 ? ` (attempt ${this.restartAttempts})` : ""}...`);
      this.restartTimerId = window.setTimeout(() => this.restartRecognition(), delay);
    },

    restartRecognition() {
      this.restartTimerId = null;
      if (!this.isRecording || this.stopRequested || this.fatalRecognitionError || !this.recognition) return;
      if (document.visibilityState === "hidden") {
        this.pauseForBackground();
        return;
      }
      try {
        this.recognition.start();
      } catch (error) {
        console.warn("DCCS Mobile Transcript: recognition restart delayed:", error);
        this.scheduleRecognitionRestart();
      }
    },

    stopRecording(updateState = true) {
      const wasRecording = this.isRecording || this.recognitionActive;
      this.stopRequested = true;
      this.isRecording = false;
      window.clearTimeout(this.restartTimerId);
      this.restartTimerId = null;

      if (this.recognition && (this.recognitionActive || wasRecording)) {
        try { this.recognition.stop(); } catch (_) {}
      }

      this.finishRecordingState({ save: true });
      if (updateState && wasRecording) {
        this.setState(
          this.els.transcript?.value.trim()
            ? "Stopped. Review or edit the saved transcript, then send it to Ask Dr. Holtkamp."
            : "Stopped. No speech was captured; type notes below or tap the mic to try again."
        );
      }
    },

    finishRecordingState({ save = false } = {}) {
      this.captureElapsedTime();
      this.isRecording = false;
      window.clearInterval(this.timerId);
      this.timerId = null;
      this.stopCheckpointing();
      this.setToggle(false);
      this.releaseWakeLock();
      this.updateTimer();
      this.updateSubmitState();
      this.updateDurabilityStatus();
      if (save) this.saveDraft();
    },

    pauseForBackground() {
      if (!this.isRecording && !this.recognitionActive) return;
      this.resumeOnVisible = true;
      this.stopRequested = true;
      this.isRecording = false;
      window.clearTimeout(this.restartTimerId);
      this.restartTimerId = null;
      if (this.recognition) {
        try { this.recognition.stop(); } catch (_) {}
      }
      this.finishRecordingState({ save: true });
      this.setState("Paused because the page left the foreground. Your transcript is saved; return here to resume.");
    },

    handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        if (this.isRecording || this.recognitionActive) this.pauseForBackground();
        else this.saveDraft();
        return;
      }

      if (!this.resumeOnVisible) {
        if (this.isRecording) void this.requestWakeLock();
        return;
      }

      window.clearTimeout(this.visibilityResumeTimerId);
      this.setState("Page active again. Resuming live transcription...");
      this.visibilityResumeTimerId = window.setTimeout(() => {
        this.visibilityResumeTimerId = null;
        if (!this.resumeOnVisible) return;
        if (this.recognitionActive) {
          this.handleVisibilityChange();
          return;
        }
        this.resumeOnVisible = false;
        if (!this.startRecording()) {
          this.setState("Your transcript is saved. Tap the mic to resume live transcription.");
        }
      }, 350);
    },

    appendTranscript(text) {
      if (!text || !this.els.transcript) return;
      const current = this.els.transcript.value.trim();
      this.els.transcript.value = current ? `${current}\n${text}` : text;
      this.els.transcript.scrollTop = this.els.transcript.scrollHeight;
      this.updateSubmitState();
      this.scheduleDraftSave();
    },

    currentElapsedSeconds() {
      const activeSeconds = this.isRecording && this.startedAt
        ? Math.max(0, Math.floor((this.now() - this.startedAt) / 1000))
        : 0;
      return Math.max(0, Math.floor(this.elapsedSeconds + activeSeconds));
    },

    captureElapsedTime() {
      if (this.startedAt) {
        const activeSeconds = Math.max(0, Math.floor((this.now() - this.startedAt) / 1000));
        this.elapsedSeconds = Math.max(0, Math.floor(this.elapsedSeconds + activeSeconds));
      }
      this.startedAt = 0;
    },

    formatDuration(totalSeconds) {
      const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
      const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
      const seconds = String(safeSeconds % 60).padStart(2, "0");
      return `${minutes}:${seconds}`;
    },

    updateTimer() {
      if (this.els.timer) this.els.timer.textContent = this.formatDuration(this.currentElapsedSeconds());
    },

    setState(text) {
      if (this.els.state) this.els.state.textContent = text;
    },

    updateSubmitState() {
      const hasTranscript = !!this.els.transcript?.value.trim();
      if (this.els.submit) this.els.submit.disabled = this.isRecording || !hasTranscript;
      if (this.els.clear) this.els.clear.disabled = this.isRecording || (!hasTranscript && this.elapsedSeconds === 0);
    },

    startCheckpointing() {
      this.stopCheckpointing();
      this.checkpointTimerId = window.setInterval(() => this.saveDraft(), this.checkpointIntervalMs);
    },

    stopCheckpointing() {
      window.clearInterval(this.checkpointTimerId);
      this.checkpointTimerId = null;
    },

    scheduleDraftSave() {
      window.clearTimeout(this.draftSaveTimerId);
      this.draftSaveTimerId = window.setTimeout(() => {
        this.draftSaveTimerId = null;
        this.saveDraft();
      }, this.draftSaveDelayMs);
    },

    saveDraft() {
      if (!this.els.transcript) return false;
      const transcript = this.els.transcript.value.trim();
      if (!transcript) {
        try { localStorage.removeItem(this.DRAFT_KEY); } catch (_) {}
        this.setDraftStatus("No transcript saved yet");
        return true;
      }

      const draft = {
        version: this.DRAFT_VERSION,
        transcript,
        elapsedSeconds: this.currentElapsedSeconds(),
        savedAt: new Date(this.now()).toISOString()
      };
      try {
        localStorage.setItem(this.DRAFT_KEY, JSON.stringify(draft));
        this.setDraftStatus("Transcript saved on this device");
        return true;
      } catch (error) {
        console.warn("DCCS Mobile Transcript: local draft could not be saved:", error);
        this.setDraftStatus("Draft could not save — keep this page open", "warn");
        return false;
      }
    },

    restoreDraft() {
      let draft = null;
      try {
        const raw = localStorage.getItem(this.DRAFT_KEY);
        if (raw) draft = JSON.parse(raw);
      } catch (error) {
        console.warn("DCCS Mobile Transcript: saved draft could not be restored:", error);
      }
      if (!draft || draft.version !== this.DRAFT_VERSION || typeof draft.transcript !== "string") {
        this.elapsedSeconds = 0;
        this.updateTimer();
        return false;
      }

      this.els.transcript.value = draft.transcript;
      this.elapsedSeconds = Math.max(0, Math.floor(Number(draft.elapsedSeconds) || 0));
      this.updateTimer();
      this.setDraftStatus("Recovered transcript saved on this device");
      this.setState(`Recovered an unsent ${this.formatDuration(this.elapsedSeconds)} transcript. Review it or tap the mic to continue.`);
      return true;
    },

    clearDraftStorage() {
      window.clearTimeout(this.draftSaveTimerId);
      this.draftSaveTimerId = null;
      try { localStorage.removeItem(this.DRAFT_KEY); } catch (_) {}
    },

    resetTranscript() {
      this.resumeOnVisible = false;
      this.stopRecording(false);
      this.clearDraftStorage();
      if (this.els.transcript) this.els.transcript.value = "";
      this.elapsedSeconds = 0;
      this.startedAt = 0;
      this.updateTimer();
      this.updateSubmitState();
      this.setDraftStatus("No transcript saved yet");
      this.setState("Transcript cleared. Tap the mic to begin a new meeting.");
    },

    confirmClearTranscript() {
      const clear = () => this.resetTranscript();
      if (window.App && typeof App.confirmAction === "function") {
        App.confirmAction({
          title: "Clear saved transcript?",
          message: "This removes the unsent transcript from this device. It cannot be undone.",
          details: [
            { label: "Duration", value: this.formatDuration(this.currentElapsedSeconds()) },
            { label: "Storage", value: "This device only" }
          ],
          cancelLabel: "Keep transcript",
          confirmLabel: "Clear transcript",
          tone: "danger"
        }, clear);
        return;
      }
      clear();
    },

    setWakeStatus(text, tone = "") {
      if (!this.els.wakeStatus) return;
      this.els.wakeStatus.textContent = text;
      this.els.wakeStatus.className = `rec-durability-item ${tone}`.trim();
    },

    setDraftStatus(text, tone = "") {
      if (!this.els.draftStatus) return;
      this.els.draftStatus.textContent = text;
      this.els.draftStatus.className = `rec-durability-item ${tone}`.trim();
    },

    updateDurabilityStatus() {
      if (this.wakeLock) {
        this.setWakeStatus("Screen awake");
      } else if (!("wakeLock" in navigator)) {
        this.setWakeStatus("Keep screen awake manually", "warn");
      } else if (this.isRecording) {
        this.setWakeStatus("Requesting screen wake...");
      } else {
        this.setWakeStatus("Screen wake activates while listening");
      }
      if (!this.els.transcript?.value.trim()) this.setDraftStatus("No transcript saved yet");
    },

    async requestWakeLock() {
      if (!this.isRecording) return false;
      if (!("wakeLock" in navigator) || !navigator.wakeLock?.request) {
        this.setWakeStatus("Keep screen awake manually", "warn");
        return false;
      }
      if (this.wakeLock && !this.wakeLock.released) return true;

      try {
        this.setWakeStatus("Requesting screen wake...");
        const lock = await navigator.wakeLock.request("screen");
        this.wakeLock = lock;
        this.setWakeStatus("Screen awake");
        lock.addEventListener("release", () => {
          if (this.wakeLock === lock) this.wakeLock = null;
          if (this.isRecording && document.visibilityState === "visible") {
            this.setWakeStatus("Reconnecting screen wake...", "warn");
            window.setTimeout(() => {
              if (this.isRecording && !this.wakeLock) void this.requestWakeLock();
            }, 1000);
          } else {
            this.updateDurabilityStatus();
          }
        });
        return true;
      } catch (error) {
        console.warn("DCCS Mobile Transcript: screen wake lock unavailable:", error);
        this.wakeLock = null;
        this.setWakeStatus("Keep screen awake manually", "warn");
        return false;
      }
    },

    releaseWakeLock() {
      const lock = this.wakeLock;
      this.wakeLock = null;
      if (lock) {
        try { void lock.release(); } catch (_) {}
      }
      this.updateDurabilityStatus();
    },

    async submitTranscript() {
      this.resumeOnVisible = false;
      this.stopRecording(false);
      const transcript = this.els.transcript ? this.els.transcript.value.trim() : "";
      if (!transcript) {
        this.setState("Record, type, paste, or dictate a transcript first.");
        return;
      }

      const date = window.App && App.getLocalToday
        ? App.getLocalToday()
        : new Date().toISOString().slice(0, 10);
      const prompt = [
        "MEETING_RECORDER_INPUT",
        `Date: ${date}`,
        "",
        "This is a transcript of a multi-person DCCS meeting.",
        "Do not infer or label speakers. Route each topic by content across all DCCS service lines.",
        "Return a concise summary organized by affected service line, followed by confirmable proposed portal updates.",
        "Propose exactly one combined add_dialogue action per affected service line.",
        "Propose update_metric only when the transcript explicitly states a recognizable metric, numeric value, and date or month.",
        "Do not propose task or KPI actions from this meeting transcript.",
        "Put ambiguous items under 'Needs clarification' without creating commands for them.",
        "",
        "Transcript:",
        transcript
      ].join("\n");

      this.els.submit.disabled = true;
      this.setState("Opening Ask Dr. Holtkamp...");
      const sent = await this.sendPromptViaAsk(prompt);
      if (!sent) {
        this.setState("Ask Dr. Holtkamp is not ready. Your transcript remains saved; try again in a moment.");
        this.saveDraft();
        this.updateSubmitState();
        return;
      }

      this.clearDraftStorage();
      this.els.transcript.value = "";
      this.elapsedSeconds = 0;
      this.startedAt = 0;
      this.updateTimer();
      this.updateSubmitState();
      this.setDraftStatus("Transcript sent and local draft cleared");
      this.els.recorder.classList.remove("open");
      this.els.recorder.setAttribute("aria-hidden", "true");
    },

    async sendPromptViaAsk(prompt) {
      if (!window.AskDrHoltkamp) return false;
      if (!AskDrHoltkamp.els || !AskDrHoltkamp.els.input) AskDrHoltkamp.init();
      if (!AskDrHoltkamp.els?.input) return false;

      AskDrHoltkamp.open();
      AskDrHoltkamp.els.input.value = prompt;
      AskDrHoltkamp.autoSizeInput();

      if (!AskDrHoltkamp.isReady) {
        try {
          if (AskDrHoltkamp.dependenciesPromise) await AskDrHoltkamp.dependenciesPromise;
          if (!AskDrHoltkamp.isReady) await AskDrHoltkamp.loadDependencies();
        } catch (_) {}
      }

      AskDrHoltkamp.updateSendButtonState();
      if (!AskDrHoltkamp.isReady || AskDrHoltkamp.els.send?.disabled) return false;
      void AskDrHoltkamp.send();
      return true;
    },

    goHome() {
      if (window.AskDrHoltkamp && AskDrHoltkamp.close) AskDrHoltkamp.close();
      this.closeRecorder();
      const home = document.getElementById("mobile-command-center");
      if (home) home.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  };

  window.MobileCommand = MobileCommand;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => MobileCommand.init());
  } else {
    MobileCommand.init();
  }
}());
