---
name: voice-input
description: >
  Voice input that keeps working on iPhone. Use when an app builder asks for
  speech recognition, dictation, "talk to the app", a microphone button,
  transcription, reciting or reading aloud and checking what was said, Whisper,
  or any machine-learning model that runs in the browser (transformers.js, ONNX,
  WebGPU). Also use when voice "works one day and not the next" on a phone or in
  an installed home-screen app.
metadata:
  agents: [chat, builder]
---

# Voice input

Voice built and checked on a laptop fails on iPhone in ways the app builder only
hears about from app users: no microphone prompt, a mic that looks live but hears
nothing, or a screen that works one day and not the next. An iPhone gives a tab a
small slice of memory, closes the app or clears cached files under pressure, and
gives an installed home-screen app its own microphone permission, separate from
Safari's. Build for that from the start.

## When to use this skill

- Any request for voice, speech, dictation, a microphone, or transcription.
- Any request that puts an ML model in the browser, speech or not: the sizing,
  loading and release rules below apply to all of them.
- A report that voice or a model-backed screen is flaky, slow, or dead on a phone.

## 1. Choose where speech is processed, and say which

Two options; pick one on purpose and tell the app builder which you chose:

- **Built-in browser speech recognition** (`SpeechRecognition`). Reliable and
  light, but the browser sends audio to an outside service. Check for it at
  runtime rather than assuming it: an installed home-screen app on iPhone may not
  expose it even though Safari does.
- **An in-browser model** (for example Whisper via transformers.js). Audio never
  leaves the device, but the model is tens of megabytes and heavy on a phone.

When privacy matters, ask before choosing. Children's apps, health, and anything
recorded in private are cases for the on-device model; for everything else the
built-in recognizer is the default. Never send audio anywhere without saying so.

## 2. Size an in-browser model for the phone

Treat iPhone and iPad as memory-constrained, whatever the model number.

- On iPhone and iPad, use the smallest model that does the job, quantized
  (`whisper-tiny` q8, for example), on the CPU path (WASM). Do not use WebGPU
  there: it is unreliable on iOS, and a larger model plus its GPU buffers tips the tab
  over the memory limit.
- Keep larger models and WebGPU for laptops and desktops, chosen by feature
  detection and a phone check (`navigator.maxTouchPoints`, screen width), never
  by user-agent string alone.
- Read the `phone-memory-budget` skill: a model counts against the same budget as
  iframes, canvases and large images on the same page.

## 3. Load late, release early

- Load the model only when the screen that uses it opens. Never load it at app
  start, on a landing page, or on a page that merely links to the voice screen.
- When the app user leaves the screen, dispose of the model and terminate its
  worker. Do the same on `pagehide`, since iOS suspends rather than unloads.
- Never keep more than one model worker alive. A second copy, for a second
  screen or a second mount of the same component, is the usual cause of a crash.
- Cache the downloaded model files (the library does this through the browser
  cache) but expect the cache to be cleared by iOS at any time, and show download
  progress every time the load is not instant.

## 4. Keep heavy work off the main thread

Run model loading and inference in a Web Worker. Loading a model on the main
thread freezes the screen for seconds, and on a phone that freeze is what makes
the app user leave. The main thread only captures audio, posts it to the worker,
and renders the result.

## 5. Handle the microphone every time

- Ask for the microphone (`getUserMedia`) on each session, inside a tap handler.
  Do not rely on a permission granted earlier: the installed app and Safari hold
  separate permissions, and iOS may ask again after the app was closed.
- When permission is missing or was refused, show a clear button, "Tap to turn
  on the microphone", that asks again. Never show a mic that looks live but does
  nothing, and never send the app user to iPhone Settings for an installed app,
  which has no entry there.
- Stop the audio tracks when listening ends so the recording indicator goes away.

## 6. Always have a fallback

- Put a time limit on model load (about 20 seconds on a phone). When it passes,
  stop, say briefly that voice is not available right now, and offer a non-voice
  way to continue: typing, or tap-to-confirm for a recital.
- One retry button at most. No automatic retry loops, no spinner that runs
  forever.
- The same fallback covers a refused microphone and a browser with no
  recognizer.

## 7. Test at phone size

Before reporting done, check the voice screen at phone width with a phone user
agent, and say in the summary:

- Which model and backend loaded on the phone path, and how long it took.
- That opening and leaving the voice screen several times in a row does not pile
  up workers: one worker while the screen is open, none after leaving.
- That the microphone button asks for permission on a fresh session and shows
  the "Tap to turn on the microphone" state when refused.
- That the fallback appears when the model load is blocked or times out.

Tell the app builder plainly that a built app cannot be tested for real iPhone
memory behaviour in the preview, and ask them to try the voice screen on their
own phone, both in Safari and after adding to the home screen.
