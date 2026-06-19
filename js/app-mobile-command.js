// Mobile-first DCCS capture tools. Desktop app behavior is left unchanged.
(function () {
  const MobileCommand = {
    els: {},
    recognition: null,
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
        submit: document.getElementById("mobile-recorder-submit")
      };

      if (!this.els.askAction || !this.els.recordAction || !this.els.recorder) return;

      this.populateServiceLineOptions();
      this.initSpeechRecognition();

      this.els.askAction.addEventListener("click", () => this.openAsk());
      this.els.recordAction.addEventListener("click", () => this.openRecorder());
      this.els.close.addEventListener("click", () => this.closeRecorder());
      this.els.start.addEventListener("click", () => this.startRecording());
      this.els.stop.addEventListener("click", () => this.stopRecording());
      this.els.submit.addEventListener("click", () => this.submitRecording());
      this.els.transcript.addEventListener("input", () => this.updateSubmitState());
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

    initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        this.setState("Speech recognition unavailable - type or paste notes.");
        return;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.lang = "en-US";
      this.recognition.interimResults = true;
      this.recognition.continuous = true;

      this.recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += text;
          else interimText = text;
        }

        if (finalText) {
          this.appendTranscript(finalText.trim());
        }

        if (interimText) {
          this.setState(`Listening... ${interimText.trim()}`);
        } else if (this.isRecording) {
          this.setState("Listening...");
        }
      };

      this.recognition.onerror = (event) => {
        console.warn("DCCS Mobile Recorder: speech recognition error:", event.error);
        this.setState("Mic stopped. You can type notes or restart recording.");
        this.stopRecording(false);
      };

      this.recognition.onend = () => {
        if (this.isRecording) {
          this.stopRecording(false);
        }
      };
    },

    openAsk() {
      if (!window.AskDrHoltkamp) return;
      AskDrHoltkamp.open();
      if (AskDrHoltkamp.els?.input) {
        AskDrHoltkamp.els.input.placeholder = "Ask about a service line, metric, KPI, or next action...";
      }
    },

    openRecorder() {
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

    startRecording() {
      if (!this.recognition) {
        this.setState("Speech recognition unavailable - type or paste notes.");
        this.els.transcript.focus();
        return;
      }

      if (window.AskDrHoltkamp?.stopMic) {
        AskDrHoltkamp.stopMic();
      }

      try {
        this.recognition.start();
        this.isRecording = true;
        this.startedAt = Date.now();
        this.els.start.disabled = true;
        this.els.stop.disabled = false;
        this.els.submit.disabled = true;
        this.setState("Listening...");
        this.tickTimer();
        this.timerId = window.setInterval(() => this.tickTimer(), 1000);
      } catch (err) {
        console.warn("DCCS Mobile Recorder: could not start recording:", err);
        this.setState("Mic could not start. Type or paste notes.");
      }
    },

    stopRecording(updateState = true) {
      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (_) {}
      }

      this.isRecording = false;
      window.clearInterval(this.timerId);
      this.timerId = null;
      this.els.start.disabled = false;
      this.els.stop.disabled = true;
      if (updateState) this.setState("Stopped. Review transcript, then summarize.");
      this.updateSubmitState();
    },

    appendTranscript(text) {
      if (!text) return;
      const current = this.els.transcript.value.trim();
      this.els.transcript.value = current ? `${current}\n${text}` : text;
      this.updateSubmitState();
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
      this.els.submit.disabled = this.els.transcript.value.trim().length < 12;
    },

    submitRecording() {
      const transcript = this.els.transcript.value.trim();
      if (!transcript) return;

      this.stopRecording(false);
      const selected = this.els.scope.value;
      const sl = selected && typeof FRAMEWORK !== "undefined"
        ? FRAMEWORK.serviceLines.find((item) => item.id === selected)
        : null;
      const focus = sl ? `${sl.name} (${sl.id})` : "all DCCS service lines";
      const date = window.App?.getLocalToday ? App.getLocalToday() : new Date().toISOString().slice(0, 10);

      const prompt = [
        "MEETING_RECORDER_INPUT",
        `Date: ${date}`,
        `Focus: ${focus}`,
        "",
        "You are reviewing a mobile meeting/input transcript for the DCCS portal.",
        "Summarize the BLUF, decisions, roadblocks, metric updates, task/KPI updates, and follow-up items.",
        "Then propose exactly where each relevant item should go in the DCCS portal.",
        "Only create DCCS command actions when the destination, date, metric/task/KPI, and value/text are clear from the transcript.",
        "If something is ambiguous, list it under 'Needs user confirmation' and do not create a command for that item.",
        "Before any changes are applied, the portal must show the proposed action confirmation card for the user to confirm or cancel.",
        "",
        "Transcript:",
        transcript
      ].join("\n");

      this.closeRecorder();
      this.sendPromptViaAsk(prompt);
    },

    sendPromptViaAsk(prompt) {
      if (!window.AskDrHoltkamp) return;
      if (!AskDrHoltkamp.els?.input) AskDrHoltkamp.init();
      AskDrHoltkamp.open();
      AskDrHoltkamp.els.input.value = prompt;
      AskDrHoltkamp.autoSizeInput();

      const sendWhenReady = () => {
        AskDrHoltkamp.updateSendButtonState();
        AskDrHoltkamp.send();
      };

      if (AskDrHoltkamp.isReady) {
        sendWhenReady();
        return;
      }

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
