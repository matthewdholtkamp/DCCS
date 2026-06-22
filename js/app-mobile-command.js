// Mobile-first DCCS capture tools. Records meeting audio and routes it to Gemini.
// Hardened for long, unattended meetings: wake-lock, periodic flushing, safe finalize.
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
    _onStopDone: null,

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
        toggle: document.getElementById("mobile-recorder-toggle"),
        submit: document.getElementById("mobile-recorder-submit"),
        home: document.getElementById("ask-home")
      };
      if (!this.els.askAction || !this.els.recordAction || !this.els.recorder) return;

      this.populateServiceLineOptions();
      this.detectSupport();

      this.els.askAction.addEventListener("click", () => this.openAsk());
      this.els.recordAction.addEventListener("click", () => this.openRecorder());
      this.els.close.addEventListener("click", () => this.closeRecorder());
      if (this.els.toggle) this.els.toggle.addEventListener("click", () => this.toggleRecording());
      this.els.submit.addEventListener("click", () => this.submitRecording());
      if (this.els.transcript) this.els.transcript.addEventListener("input", () => this.updateSubmitState());
      if (this.els.home) this.els.home.addEventListener("click", () => this.goHome());
      document.addEventListener("visibilitychange", () => this.handleVisibility());
    },

    populateServiceLineOptions() {
      if (!this.els.scope || typeof FRAMEWORK === "undefined") return;
      (FRAMEWORK.serviceLines || []).forEach((sl) => {
        const option = document.createElement("option");
        option.value = sl.id;
        option.textContent = `${sl.name}${sl.abbr ? ` (${sl.abbr})` : ""}`;
        this.els.scope.appendChild(option);
      });
    },

    detectSupport() {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        this.setState("Recording isn't supported on this browser. Use the notes field below, then Summarize.");
      } else {
        this.setState("Tap the mic, set the phone down, keep this screen on. Put the phone on Do Not Disturb.");
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

    async openRecorder() {
      this.resetRecorderState();
      this.els.recorder.classList.add("open");
      this.els.recorder.setAttribute("aria-hidden", "false");
      await this.restoreSaved();
      this.updateSubmitState();
      setTimeout(() => { if (this.els.toggle) this.els.toggle.focus(); }, 50);
    },

    async closeRecorder() {
      await this.stopRecording(false);
      this.els.recorder.classList.remove("open");
      this.els.recorder.setAttribute("aria-hidden", "true");
    },

    resetRecorderState() {
      this.audioBlob = null;
      this.chunks = [];
      if (this.els.timer) this.els.timer.textContent = "00:00";
      this.setToggle(false);
      this.detectSupport();
    },

    setToggle(recording) {
      if (!this.els.toggle) return;
      this.els.toggle.classList.toggle("recording", recording);
      this.els.toggle.setAttribute("aria-label", recording ? "Stop recording" : "Start recording");
    },

    toggleRecording() {
      if (this.isRecording) this.stopRecording();
      else this.startRecording();
    },

    recordingStatus() {
      return this.wakeLock
        ? "Recording - screen will stay on. Keep this app open; phone on Do Not Disturb."
        : "Recording - heads up: your phone may sleep. Tap the screen now and then, or keep it plugged in.";
    },

    async startRecording() {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        this.setState("Recording unsupported here. Type notes below, then Summarize.");
        if (this.els.transcript) this.els.transcript.focus();
        return;
      }
      if (window.AskDrHoltkamp && AskDrHoltkamp.stopMic) AskDrHoltkamp.stopMic();

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      } catch (err) {
        console.warn("DCCS Mobile Recorder: mic blocked:", err);
        this.setState("Microphone blocked. Allow mic access in the browser, or type notes below.");
        return;
      }

      // If the mic track ends unexpectedly (call, interruption), finalize so audio isn't lost.
      try {
        const track = this.stream.getAudioTracks()[0];
        if (track) track.addEventListener("ended", () => { if (this.isRecording) this.stopRecording(true); });
      } catch (_) {}

      this.audioMime = this.pickMime();
      this.chunks = [];
      this.audioBlob = null;
      this._idbDel().catch(() => {});
      const recOpts = { audioBitsPerSecond: 40000 };
      if (this.audioMime) recOpts.mimeType = this.audioMime;
      try {
        this.mediaRecorder = new MediaRecorder(this.stream, recOpts);
      } catch (_) {
        try {
          this.mediaRecorder = new MediaRecorder(this.stream, { audioBitsPerSecond: 40000 });
        } catch (_2) {
          this.mediaRecorder = new MediaRecorder(this.stream);
        }
      }

      this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.mediaRecorder.onerror = () => { if (this.isRecording) this.stopRecording(true); };
      this.mediaRecorder.onstop = () => {
        const type = this.audioMime || (this.mediaRecorder && this.mediaRecorder.mimeType) || "audio/webm";
        this.audioBlob = this.chunks.length ? new Blob(this.chunks, { type }) : null;
        if (this.audioBlob) this._idbPut(this.audioBlob).catch(() => {});
        this.updateSubmitState();
        const done = this._onStopDone; this._onStopDone = null;
        if (done) done();
      };

      try {
        // No timeslice: one complete file at stop is a valid MP4 on iOS (chunked MP4 can be
        // unreadable when reassembled). Interruptions are still caught by the track-ended/onerror
        // handlers, which call stop() and finalize a valid partial file.
        this.mediaRecorder.start();
      } catch (err) {
        console.warn("DCCS Mobile Recorder: could not start:", err);
        this.setState("Mic could not start. Type notes below, then Summarize.");
        return;
      }

      this.isRecording = true;
      this.startedAt = Date.now();
      this.setToggle(true);
      this.els.submit.disabled = true;
      await this.requestWakeLock();
      this.setState(this.recordingStatus());
      this.tickTimer();
      this.timerId = window.setInterval(() => this.tickTimer(), 1000);
    },

    // Returns a promise that resolves once the final blob is ready.
    stopRecording(updateState = true) {
      const active = this.mediaRecorder && this.mediaRecorder.state !== "inactive";
      return new Promise((resolve) => {
        const finish = () => {
          if (this.stream) {
            try { this.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
            this.stream = null;
          }
          this.releaseWakeLock();
          this.isRecording = false;
          window.clearInterval(this.timerId);
          this.timerId = null;
          this.setToggle(false);
          if (updateState) this.showRecorded();
          this.updateSubmitState();
          resolve();
        };
        if (active) {
          this._onStopDone = finish;
          try { this.mediaRecorder.stop(); } catch (_) { this._onStopDone = null; finish(); }
        } else {
          finish();
        }
      });
    },

    showRecorded() {
      if (this.audioBlob && this.audioBlob.size) {
        const mb = (this.audioBlob.size / 1048576).toFixed(1);
        const dur = this.els.timer ? this.els.timer.textContent : "";
        this.setState(`Recorded ${dur} \u00b7 ${mb} MB. Tap Summarize to transcribe and route.`);
      } else {
        this.setState("Stopped. Tap the mic to record, or add notes below.");
      }
    },

    async requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          this.wakeLock = await navigator.wakeLock.request("screen");
          this.wakeLock.addEventListener("release", () => {
            this.wakeLock = null;
            // iOS drops the lock when hidden; re-acquire if we're still recording and visible.
            if (this.isRecording && document.visibilityState === "visible") this.requestWakeLock();
          });
        }
      } catch (_) { this.wakeLock = null; }
    },

    releaseWakeLock() {
      try { if (this.wakeLock) { this.wakeLock.release(); this.wakeLock = null; } } catch (_) {}
    },

    async handleVisibility() {
      if (document.visibilityState === "visible" && this.isRecording && !this.wakeLock) {
        await this.requestWakeLock();
        if (this.els.state) this.setState(this.recordingStatus());
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
      const hasText = this.els.transcript && this.els.transcript.value.trim().length >= 12;
      this.els.submit.disabled = !(hasAudio || hasText);
    },

    async submitRecording() {
      await this.stopRecording(false);
      const selected = this.els.scope.value;
      const sl = selected && typeof FRAMEWORK !== "undefined"
        ? FRAMEWORK.serviceLines.find((item) => item.id === selected)
        : null;
      const focus = sl ? `${sl.name} (${sl.id})` : "all DCCS service lines";

      if (this.audioBlob && this.audioBlob.size > 0 && window.AskDrHoltkamp && AskDrHoltkamp.sendMeetingAudio) {
        const blob = this.audioBlob;
        this.closeRecorder();
        AskDrHoltkamp.sendMeetingAudio(blob, focus);
        return;
      }

      const transcript = this.els.transcript ? this.els.transcript.value.trim() : "";
      if (!transcript) { this.setState("Record audio or add notes first."); return; }
      const date = window.App && App.getLocalToday ? App.getLocalToday() : new Date().toISOString().slice(0, 10);
      const prompt = [
        "MEETING_RECORDER_INPUT",
        `Date: ${date}`,
        `Focus: ${focus}`,
        "",
        "You are reviewing a mobile meeting/input transcript for the DCCS portal.",
        "Write a thorough, read-first summary: a short BLUF, then a section per DCCS service line / lane, each capturing decisions, status and metric updates, roadblocks, and follow-ups in clear prose. Favor completeness over brevity.",
        "Route each item to the correct lane by topic; attribute to a named person only when a name is clearly spoken.",
        "Do NOT create any DCCS command actions or portal updates on this pass.",
        "End by noting the user can next ask you to turn items into metric/task lines or add them to the weekly brief.",
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
      const sendWhenReady = () => { AskDrHoltkamp.updateSendButtonState(); AskDrHoltkamp.send(); };
      if (AskDrHoltkamp.isReady) { sendWhenReady(); return; }
      this.setState("Ask Dr. Holtkamp is loading...");
      const started = Date.now();
      const interval = window.setInterval(() => {
        if (AskDrHoltkamp.isReady) { window.clearInterval(interval); sendWhenReady(); }
        else if (Date.now() - started > 10000) { window.clearInterval(interval); AskDrHoltkamp.updateSendButtonState(); }
      }, 250);
    },

    async restoreSaved() {
      try {
        const rec = await this._idbGet();
        if (rec && rec.blob && rec.blob.size) {
          this.audioBlob = rec.blob;
          this.audioMime = rec.blob.type || "audio/mp4";
          const mb = (rec.blob.size / 1048576).toFixed(1);
          this.setState(`Recovered an unsent recording (${mb} MB). Tap Summarize to send it, or the mic to start over.`);
        }
      } catch (_) {}
    },

    clearSaved() {
      this.audioBlob = null;
      this._idbDel().catch(() => {});
    },

    _idb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("dccsRecorder", 1);
        req.onupgradeneeded = () => { req.result.createObjectStore("rec"); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async _idbPut(blob) {
      const db = await this._idb();
      try {
        await new Promise((res, rej) => {
          const tx = db.transaction("rec", "readwrite");
          tx.objectStore("rec").put({ blob, ts: Date.now() }, "current");
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
      } finally { db.close(); }
    },

    async _idbGet() {
      const db = await this._idb();
      try {
        return await new Promise((res, rej) => {
          const tx = db.transaction("rec", "readonly");
          const r = tx.objectStore("rec").get("current");
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
      } finally { db.close(); }
    },

    async _idbDel() {
      const db = await this._idb();
      try {
        await new Promise((res) => {
          const tx = db.transaction("rec", "readwrite");
          tx.objectStore("rec").delete("current");
          tx.oncomplete = res; tx.onerror = res;
        });
      } finally { db.close(); }
    }
  };

  window.MobileCommand = MobileCommand;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => MobileCommand.init());
  } else {
    MobileCommand.init();
  }
}());
