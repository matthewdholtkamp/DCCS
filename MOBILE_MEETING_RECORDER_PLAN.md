# Mobile Meeting Recorder — Plan (audio → Gemini 3.5 Flash → confirm-able per-section updates)

## Confirmed decisions
- **Capture:** record real audio (MediaRecorder), send to Gemini 3.5 Flash for transcription + routing.
- **Output:** staged as proposed updates the user confirms into each section (reuse existing DCCS_COMMAND + confirmation card).
- **Attribution:** route each topic to the correct service-line section; speaker names not required.
- **Model:** meeting path = `gemini-3.5-flash`; Ask Dr. Holtkamp stays on `gemini-3.1-flash-lite`.
- **Target device:** phone as a set-down recorder (hands-off), screen kept awake; user navigates on the computer/TV.

## KEY FINDING — backend already supports this (minimal/no Worker change)
The Bandaid6 Worker (`Research AI/Bandaid6/worker.js`) default route is `handleChatRequest`, which:
- accepts a per-request `model` (`body.model || 'gemini-3.1-flash-lite'`), and
- forwards `body.systemInstruction` + `body.contents` straight to Gemini `generateContent`.
So sending an **audio `inlineData` part** with `model: 'gemini-3.5-flash'` works through the existing endpoint. Gemini 3.5 Flash is natively multimodal (audio in). **No Worker code change required for v1.** (Optional later hardening only.)

The routing + confirmation is also already built:
- `DCCS_CONTEXT_RULES` already has a `MEETING_RECORDER_INPUT` mode that splits proposed actions across multiple service lines and emits a `[DCCS_COMMAND: [...]]` block.
- `ask-dr-holtkamp.js` already intercepts that block and renders a **confirm-before-write** card (`renderConfirmationCard` → `executeCommands`).
So we REUSE this end to end. The only real work is **capture** + **wiring the audio call** + **mobile UX/navigation**.

## Files touched
- `js/app-mobile-command.js` — replace Web Speech capture with MediaRecorder + wake lock; call new audio sender; home/exit nav.
- `js/ask-dr-holtkamp.js` — add `sendMeetingAudio()` that reuses persona/context/command pipeline (non-stream, 3.5 Flash).
- `index.html` — mobile Ask "Home" control; cache-buster bumps.
- `css/responsive.css` — lock mobile home to the screen (no page scroll); chat scrolls internally.
- Worker: **no change** (verify only).

---

## PART 1 — Capture: MediaRecorder + wake lock (`app-mobile-command.js`)
Replace the `SpeechRecognition` engine. New flow in the recorder sheet:
- **Start:** `await navigator.mediaDevices.getUserMedia({ audio: true })`; pick a supported mime via `MediaRecorder.isTypeSupported` (prefer `audio/webm;codecs=opus`, fall back to `audio/mp4` for iOS Safari, then default). `rec = new MediaRecorder(stream, { mimeType })`. Collect `ondataavailable` chunks. Start the existing timer. Request a screen wake lock: `this._wakeLock = await navigator.wakeLock.request('screen')` (try/catch; re-acquire on `visibilitychange` if released). Update state to "Recording — keep this screen on."
- **Stop:** `rec.stop()`; stop all `stream.getTracks()`; release wake lock. On `rec.onstop`, build `this._audioBlob = new Blob(chunks, { type: mimeType })`; enable "Summarize and propose updates".
- **Permissions / fallback:** if `getUserMedia` rejects (denied / unsupported), keep the existing transcript `<textarea>` as a manual paste fallback and route that text through the EXISTING text path (current `submitRecording`). Mic is primary; paste is the safety net.
- **Submit (audio present):** convert blob to base64 (`FileReader.readAsDataURL`, strip the `data:...;base64,` prefix) and call `AskDrHoltkamp.sendMeetingAudio(base64, mimeType, focusLabel)` (Part 2). Then `goHome()`-style: close the recorder, the result lands in the Ask panel.
- Keep the PHI/classified warning. Keep the "Meeting focus" select but default it to **All service lines (auto-route)**; pass the chosen focus as a soft bias only.
- Robustness note: for meetings beyond ~20-25 min, chunk via `rec.start(timeslice)` and send the largest single blob, or stitch — flag as a v1.1 if needed. Typical service-line meetings are well within one-shot range.

## PART 2 — `AskDrHoltkamp.sendMeetingAudio(base64, mimeType, focusLabel)` (`ask-dr-holtkamp.js`)
Reuse the existing request builder so persona/context/command-handling stay single-source:
- `systemPrompt = BANDAID_PERSONA_PROMPT + "\n\n" + DCCS_CONTEXT_RULES` (with `[VALID_METRIC_IDS]` substituted) — identical to `send()`.
- `contextBlock = this.buildContextBlock()` (the `DCCS_CONTEXT\n{...}` JSON the model needs for valid ids/dates).
- `framing` = a `MEETING_RECORDER_INPUT` header: date (`App.getLocalToday()`), focus = focusLabel or "all DCCS service lines", and one line stating the attached audio is a multi-person meeting to transcribe internally and route by topic to the correct sections, emitting `DCCS_COMMAND` only for clear items (this matches the existing `MEETING_RECORDER_INPUT` handling).
- Request (non-stream): `POST workerUrl + (?)stream=0` with:
  ```
  {
    model: 'gemini-3.5-flash',
    fallbackModel: 'gemini-2.5-flash',
    stream: false,
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType, data: base64 } },
      { text: framing + "\n\n" + contextBlock }
    ]}],
    generationConfig: { temperature: 0.2 }
  }
  ```
- Open the Ask panel, render a user bubble ("Meeting recording — summarizing…"), then on response parse `data.candidates[0].content.parts.map(p=>p.text).join('')` and pass it through the SAME `processIncomingText(body, text, true)` used at the end of streaming — so the BLUF renders and the `[DCCS_COMMAND]` block produces the confirmation card. Error handling mirrors `send()`.
- Show a clear "Transcribing the meeting…" status while awaiting (audio calls take longer than text).

## PART 3 — Routing + confirm (REUSE, no new code)
The returned `[DCCS_COMMAND]` block (one entry per section: `add_dialogue` per service line, `update_metric`, `update_task_status`, `update_task_kpi`, etc.) flows into the existing `renderConfirmationCard` → user reviews per-section proposals → Confirm writes them via `executeCommands`. Nothing to build; verify the card lists multi-section items clearly.

## PART 4 — Mobile UX / navigation (the reported gaps)
- **Home/back from Ask:** add a "Home" control to the mobile Ask panel header (`index.html`) that calls `MobileCommand.goHome()` → hide/close Ask, show `#mobile-command-center`, reset recorder state (clear blob, timer 00:00, state "Ready"). This is the missing "record another meeting" path.
- **Exit → home:** in mobile mode, the Ask panel's close/exit calls `goHome()` (mobile home), not the desktop dashboard. Recorder close → `goHome()`.
- **Lock like an app (no page scroll):** in `css/responsive.css`, change `.mobile-command-center { min-height: 100vh }` → `{ height: 100svh; min-height: 0; overflow: hidden; }` (svh handles the mobile URL bar). Ensure the mobile Ask panel is `height: 100svh; display:flex; flex-direction:column; overflow:hidden`, with `.ask-messages { flex:1 1 auto; overflow-y:auto; }` so ONLY the chat scrolls. Input bar pinned at bottom.
- Keep "Field mode" chrome, timer, and a single clear primary action at each step.

## PART 5 — Model
Meeting path pins `gemini-3.5-flash` (Part 2). Ask Q&A unchanged on flash-lite. Cost: a single meeting ≈ a few cents (audio in at ~$1/1M audio tokens on 3.x Flash). No quota concern at this volume.

## VERIFY
1. `node --check js/app-mobile-command.js && node --check js/ask-dr-holtkamp.js` → OK.
2. Bump cache-busters in `index.html` for `app-mobile-command.js` and `ask-dr-holtkamp.js`.
3. On phone (HTTPS / GitHub Pages): mic permission prompt appears on Start; timer runs; screen stays awake; Stop enables Summarize.
4. Summarize → "Transcribing…" → BLUF + per-section confirmation card appears; Confirm writes; the live dashboard updates.
5. Home button returns to the mobile home; can immediately record a new meeting.
6. Mobile home does not scroll; the chat scrolls internally.
7. Mic-denied path: paste notes → text route still works.

## DEPENDENCY / RISK
- No Worker change required for v1 (verified: contents+model pass-through). If a payload size limit is hit on long meetings, add chunking (v1.1).
- iOS Safari MediaRecorder mime may be `audio/mp4` — handled by `isTypeSupported` detection. Gemini accepts mp4/aac/webm/ogg.
- HTTPS + user-gesture required for mic + wake lock — both satisfied (GitHub Pages + Start button).

## ROLLBACK
Client-only changes across `app-mobile-command.js`, `ask-dr-holtkamp.js`, `index.html`, `responsive.css`; single commit → `git revert`. No Worker/data-model changes.
