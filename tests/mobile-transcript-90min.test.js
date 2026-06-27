const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/app-mobile-command.js", "utf8");

class FakeElement {
  constructor(id) {
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.disabled = id === "mobile-recorder-submit" || id === "mobile-recorder-clear" || id === "ask-send";
    this.scrollTop = 0;
    this.scrollHeight = 200;
    this.listeners = {};
    this.attributes = {};
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name)
    };
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  focus() {}
}

class FakeStorage {
  constructor(entries = new Map(), failWrites = false) {
    this.entries = entries;
    this.failWrites = failWrites;
  }

  getItem(key) {
    return this.entries.has(key) ? this.entries.get(key) : null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error("storage unavailable");
    this.entries.set(key, String(value));
  }

  removeItem(key) {
    this.entries.delete(key);
  }
}

class FakeWakeLock {
  constructor() {
    this.released = false;
    this.listeners = {};
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  async release() {
    if (this.released) return;
    this.released = true;
    if (this.listeners.release) this.listeners.release();
  }
}

function buildHarness({
  storageEntries = new Map(),
  failStorageWrites = false,
  askReady = true,
  wakeLockSupported = true
} = {}) {
  const ids = [
    "mobile-ask-action",
    "mobile-record-action",
    "mobile-recorder",
    "mobile-recorder-close",
    "mobile-recorder-timer",
    "mobile-recorder-state",
    "mobile-recorder-transcript",
    "mobile-recorder-toggle",
    "mobile-recorder-submit",
    "mobile-recorder-clear",
    "mobile-recorder-wake-status",
    "mobile-recorder-draft-status",
    "ask-home",
    "ask-input",
    "ask-send",
    "mobile-command-center"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  const documentListeners = {};
  const windowListeners = {};
  const document = {
    readyState: "complete",
    visibilityState: "visible",
    getElementById: (id) => elements[id] || null,
    addEventListener: (type, handler) => { documentListeners[type] = handler; }
  };
  const localStorage = new FakeStorage(storageEntries, failStorageWrites);
  let startCalls = 0;
  let stopCalls = 0;
  let wakeRequests = 0;
  let submittedPrompt = "";
  let confirmCallback = null;
  let nextIntervalId = 1;
  const intervalHandlers = new Map();
  const warnings = [];
  const testConsole = {
    ...console,
    warn: (...args) => warnings.push(args)
  };

  class FakeSpeechRecognition {
    start() {
      startCalls += 1;
      this.active = true;
      if (this.onstart) this.onstart();
    }

    stop() {
      stopCalls += 1;
      this.active = false;
      if (this.onend) this.onend();
    }

    endUnexpectedly() {
      this.active = false;
      if (this.onend) this.onend();
    }

    emitFinal(text) {
      const result = [{ transcript: text }];
      result.isFinal = true;
      if (this.onresult) this.onresult({ resultIndex: 0, results: [result] });
    }
  }

  const navigator = wakeLockSupported
    ? { wakeLock: {
      async request() {
        wakeRequests += 1;
        return new FakeWakeLock();
      }
    } }
    : {};
  const App = {
    getLocalToday: () => "2026-06-27",
    confirmAction(options, callback) {
      assert.equal(options.title, "Clear saved transcript?");
      confirmCallback = callback;
    }
  };
  const AskDrHoltkamp = {
    isReady: askReady,
    dependenciesPromise: Promise.resolve(),
    els: { input: elements["ask-input"], send: elements["ask-send"] },
    init() {},
    open() {},
    close() {},
    stopMic() {},
    autoSizeInput() {},
    updateSendButtonState() {
      this.els.send.disabled = !this.els.input.value.trim() || !this.isReady;
    },
    send() {
      submittedPrompt = this.els.input.value;
      this.els.input.value = "";
      this.updateSendButtonState();
    },
    async loadDependencies() {}
  };
  const scaledSetTimeout = (handler, delay = 0) => setTimeout(handler, Math.min(delay, 1));
  const setFakeInterval = (handler) => {
    const id = nextIntervalId;
    nextIntervalId += 1;
    intervalHandlers.set(id, handler);
    return id;
  };
  const clearFakeInterval = (id) => intervalHandlers.delete(id);
  const window = {
    document,
    navigator,
    localStorage,
    App,
    AskDrHoltkamp,
    console: testConsole,
    webkitSpeechRecognition: FakeSpeechRecognition,
    setTimeout: scaledSetTimeout,
    clearTimeout,
    setInterval: setFakeInterval,
    clearInterval: clearFakeInterval,
    addEventListener: (type, handler) => { windowListeners[type] = handler; },
    scrollTo() {}
  };
  const context = vm.createContext({
    window,
    document,
    navigator,
    localStorage,
    App,
    AskDrHoltkamp,
    console: testConsole,
    setTimeout: scaledSetTimeout,
    clearTimeout,
    setInterval: setFakeInterval,
    clearInterval: clearFakeInterval,
    Date
  });
  vm.runInContext(source, context);

  return {
    command: window.MobileCommand,
    elements,
    document,
    documentListeners,
    windowListeners,
    localStorage,
    recognition: window.MobileCommand.recognition,
    warnings,
    runIntervals: () => intervalHandlers.forEach((handler) => handler()),
    counters: {
      get startCalls() { return startCalls; },
      get stopCalls() { return stopCalls; },
      get wakeRequests() { return wakeRequests; },
      get submittedPrompt() { return submittedPrompt; },
      get confirmCallback() { return confirmCallback; }
    }
  };
}

function waitForTimers() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

async function testNinetyMinuteLifecycle() {
  const sharedStorage = new Map();
  const harness = buildHarness({ storageEntries: sharedStorage });
  const { command, elements, recognition, counters } = harness;
  const fakeEpoch = 100000;
  let fakeNow = fakeEpoch;
  command.now = () => fakeNow;
  command.restartBaseDelayMs = 0;
  command.restartMaxDelayMs = 0;
  command.draftSaveDelayMs = 0;

  assert.equal(command.startRecording(), true);
  await waitForTimers();
  assert.equal(counters.wakeRequests, 1);
  elements["mobile-recorder-transcript"].value = "periodic checkpoint";
  harness.runIntervals();
  assert.ok(sharedStorage.has(command.DRAFT_KEY), "15-second checkpoint should save the draft");
  elements["mobile-recorder-transcript"].value = "";

  for (let minute = 1; minute <= 90; minute += 1) {
    fakeNow = fakeEpoch + minute * 60 * 1000;
    recognition.emitFinal(`checkpoint minute ${minute}`);
    recognition.endUnexpectedly();
    await waitForTimers();
  }

  command.updateTimer();
  assert.equal(elements["mobile-recorder-timer"].textContent, "90:00");
  assert.equal(command.currentElapsedSeconds(), 5400);
  assert.equal(counters.startCalls, 91, "recognition should restart after every forced disconnect");

  const lines = elements["mobile-recorder-transcript"].value.split("\n");
  assert.equal(lines.length, 90);
  assert.equal(new Set(lines).size, 90, "recognition restarts must not duplicate finalized text");

  command.stopRecording();
  await waitForTimers();
  assert.equal(command.elapsedSeconds, 5400);
  assert.equal(elements["mobile-recorder-submit"].disabled, false);
  const saved = JSON.parse(sharedStorage.get(command.DRAFT_KEY));
  assert.equal(saved.elapsedSeconds, 5400);
  assert.equal(saved.transcript, elements["mobile-recorder-transcript"].value);

  const restored = buildHarness({ storageEntries: sharedStorage });
  assert.equal(restored.elements["mobile-recorder-timer"].textContent, "90:00");
  assert.equal(restored.elements["mobile-recorder-transcript"].value, saved.transcript);
  assert.match(restored.elements["mobile-recorder-state"].textContent, /Recovered an unsent 90:00 transcript/);

  restored.command.sendPromptViaAsk = async () => false;
  await restored.command.submitTranscript();
  assert.ok(sharedStorage.has(restored.command.DRAFT_KEY), "failed handoff must preserve the draft");

  restored.command.sendPromptViaAsk = async (prompt) => {
    assert.match(prompt, /^MEETING_RECORDER_INPUT/);
    return true;
  };
  await restored.command.submitTranscript();
  assert.equal(sharedStorage.has(restored.command.DRAFT_KEY), false, "successful handoff must clear the draft");
  assert.equal(restored.elements["mobile-recorder-transcript"].value, "");
}

async function testBackgroundRecoveryAndWakeLock() {
  const harness = buildHarness();
  const { command, document, documentListeners, recognition, counters, elements } = harness;
  const fakeEpoch = 100000;
  let fakeNow = fakeEpoch;
  command.now = () => fakeNow;

  command.startRecording();
  await waitForTimers();
  recognition.emitFinal("before background");
  fakeNow = fakeEpoch + 30 * 60 * 1000;
  document.visibilityState = "hidden";
  documentListeners.visibilitychange();
  await waitForTimers();
  assert.equal(command.isRecording, false);
  assert.equal(command.resumeOnVisible, true);
  assert.equal(command.elapsedSeconds, 1800);
  assert.ok(harness.localStorage.getItem(command.DRAFT_KEY));

  document.visibilityState = "visible";
  documentListeners.visibilitychange();
  await waitForTimers();
  assert.equal(command.isRecording, true);
  assert.equal(counters.startCalls, 2);
  assert.equal(counters.wakeRequests, 2);

  recognition.onerror({ error: "network" });
  assert.equal(command.isRecording, false);
  assert.match(elements["mobile-recorder-state"].textContent, /saved transcript is preserved/);
}

async function testStorageFailureAndConfirmedClear() {
  const failing = buildHarness({ failStorageWrites: true });
  failing.elements["mobile-recorder-transcript"].value = "unsaved text";
  assert.equal(failing.command.saveDraft(), false);
  assert.equal(failing.warnings.length, 1);
  assert.match(failing.elements["mobile-recorder-draft-status"].textContent, /could not save/);

  const normal = buildHarness();
  normal.elements["mobile-recorder-transcript"].value = "clear me";
  normal.command.elapsedSeconds = 120;
  normal.command.saveDraft();
  normal.command.updateSubmitState();
  normal.command.confirmClearTranscript();
  assert.equal(typeof normal.counters.confirmCallback, "function");
  normal.counters.confirmCallback();
  assert.equal(normal.elements["mobile-recorder-transcript"].value, "");
  assert.equal(normal.elements["mobile-recorder-timer"].textContent, "00:00");
  assert.equal(normal.localStorage.getItem(normal.command.DRAFT_KEY), null);
}

async function testUnsupportedWakeLockAndPermissionDenial() {
  const harness = buildHarness({ wakeLockSupported: false });
  const { command, recognition, elements } = harness;
  command.startRecording();
  await waitForTimers();
  assert.match(elements["mobile-recorder-wake-status"].textContent, /Keep screen awake manually/);

  recognition.emitFinal("preserve this checkpoint");
  recognition.onerror({ error: "not-allowed" });
  assert.equal(command.isRecording, false);
  assert.match(elements["mobile-recorder-state"].textContent, /Microphone access was blocked/);
  assert.match(elements["mobile-recorder-transcript"].value, /preserve this checkpoint/);
}

(async () => {
  await testNinetyMinuteLifecycle();
  await testBackgroundRecoveryAndWakeLock();
  await testStorageFailureAndConfirmedClear();
  await testUnsupportedWakeLockAndPermissionDenial();
  console.log("90-minute mobile transcript tests: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
