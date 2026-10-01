---
name: phone-memory-budget
description: >
  Keep a page within what a phone can hold in memory. Use when building anything
  that shows the app's own screens inside the app — a screen gallery, thumbnails,
  a screen picker, an image or ad studio, a phone mockup of the app, "put any
  screen in my ads" — or that embeds iframes of the app's own routes. Also use to
  diagnose any report that a page "crashes", "reloads by itself", "goes white",
  "keeps refreshing", or shows "A problem repeatedly occurred" on an iPhone or
  iPad: with no error logged, that is iOS Safari killing the tab for memory.
metadata:
  agents: [chat, builder]
---

# Phone memory budget

A phone gives one browser tab a small slice of memory — far less than the desktop
browser the app is checked in. When a page goes over, iOS Safari does not throw an
error. It reloads the tab, and after a couple of tries shows "A problem repeatedly
occurred on <page>". Nothing reaches Errors or the console. Android shows a plain
"Aw, snap" or a silent reload.

## Building: count what runs at once

**A same-origin iframe of the app's own route is a full second copy of the app** —
its JavaScript, fonts, data loaders, animation loops and any on-device model. Ten
thumbnails built that way are ten running apps, and a phone kills the tab well
before the tenth has loaded. Lazy-mounting on scroll only staggers the crash.

- Never have more than one or two live copies of the app on a page that may be
  opened on a phone. One is the norm: the single screen being exported or edited.
- For galleries, pickers, thumbnails and mockups, show still images: an `<img>` of
  a saved snapshot when one exists, otherwise a light placeholder card with the
  screen's title and colours. A still image costs almost nothing; a live route
  costs the whole app.
- Count the other heavy things the same way: canvases, `requestAnimationFrame`
  loops, autoplaying video, large images decoded at full size, and on-device ML
  models (Whisper via transformers.js, for example). Decide how many run at once
  on this page, and keep the number small. Load a model only on the screen that
  uses it, never on a page that merely shows that screen.

## Diagnosing: a crash with no error is a memory crash

If an app builder says a page crashes, reloads on its own, goes white, or shows
"A problem repeatedly occurred" on an iPhone or iPad, and nothing is in Errors or
the console, **assume the tab ran out of memory.** Do not go looking for a
JavaScript bug that a desktop browser cannot reproduce.

- Say it plainly to the app builder: the phone is running out of memory on that
  page, and the fix is to make the page run less at once. It affects the App
  preview and the Published app alike, because both run the same page.
- Find what the page runs at the same time — live iframes of the app, animations,
  models, oversized images — and reduce the count. Replacing a grid of live
  screens with still images is usually the whole fix.
- Do not keep tuning code that isn't throwing. Lazy loading, deferring a model, or
  unmounting part of the page while another part is open changes when the crash
  happens, not whether it does.
