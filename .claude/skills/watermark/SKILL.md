---
name: watermark
description: Watermarking images server-side — stamping a logo or text mark onto pictures before they are delivered, for watermarked previews, photo proofs, and protected galleries. Uses the `watermark` option of createImage(env).transform from ~stencil/image, naming the mark by its storage key (Cloudflare Images binding, keyless, server-side). Load whenever the brief asks for a watermark, a logo on photos, protected proofs, or stopping visitors from saving the clean picture. NEVER fake a watermark with a client-side overlay (canvas, positioned element, CSS) — that leaves the clean file one network-tab click away.
metadata:
  agents: [chat, builder]
---

# Watermark

Pass `watermark` to `createImage(env).transform(source, params)` from `~stencil/image` to
composite a mark onto a picture at request time, proxied through the Stencil backend
(Cloudflare Images binding). The returned bytes are **already marked** — the clean source
never leaves the server. No API keys. **Server-side only** — loaders, actions, or
scheduled handlers, never the browser.

## Never fake a watermark client-side

A canvas overlay, a positioned element, or CSS on top of an `<img>` is decoration, not
protection: the unmarked original is still the response body, one network-tab click
away. If the point of the mark is that visitors can't get the clean picture, it must be
this server-side path. (The same goes for Sharp, jimp, and other native image libraries
— they can't run on Cloudflare Workers at all; see the `image-transform` skill.)

## API

```ts
import { createImage } from "~stencil/image";

const marked = await createImage(env).transform(photoBytes, {
  width: 1600,                 // any plain transform param works in the same pass
  watermark: {
    key: settings.logoKey,     // required: storage key of the mark, not its bytes
    position: "bottom-right",  // 9-way anchor; default "center"
    opacity: 0.5,              // 0–1; default 1
    scale: 0.2,                // mark width as a fraction of the delivered width
    margin: 24,                // px inset from the anchored edges
  },
});
```

- `watermark.key` (required) — the storage key of the mark, in this app's own storage
  (the same keys `createStorage()` uses). The bytes never go over the wire: the mark is
  uploaded once and named on every transform. Use the builder's own logo — never a
  hardcoded Stencil asset. A transparent PNG composites cleanly.

  A mark that doesn't exist yet — a text mark you render, say — is stored first, then
  named like any other:

  ```ts
  await storage.put("watermark/logo.png", markBytes, { httpMetadata: { contentType: "image/png" } });
  // …later, on every photo:
  watermark: { key: "watermark/logo.png", position: "bottom-right" }
  ```

  A key with no object behind it fails the transform with a 404 naming the key.
- `position` — `center` (default), `top-left`, `top`, `top-right`, `left`, `right`,
  `bottom-left`, `bottom`, `bottom-right`.
- `opacity` — `0`–`1`. `0.4`–`0.6` reads as a watermark without hiding the picture.
- `scale` — mark width as a fraction `(0–1]` of the delivered width, so the mark holds
  its size on any photo. Defaults to `0.25`; `0.15`–`0.3` suits a corner mark.
- `repeat: true` — tile the mark across the whole picture (the hardest to crop out);
  `position` and `margin` are ignored.
- `margin` — pixel inset from the anchored edges. Default `0` (flush); use `16`–`32`.

Everything else is a plain transform: the source, the resize/re-encode params
(`width` / `height` / `fit` / `rotate` / `format` / `quality`), and the returned
`body` + `contentType` (pass `body` straight to `createStorage().put(key, body)`) all
behave as documented in the `image-transform` skill.

## The pattern: mark once at upload, serve only the marked copy

Store the original and the watermarked rendition as **separate R2 objects**, and make
the marked key the only one public routes ever serve. Don't watermark on every view —
that re-runs the transform per request; and never serve the original and "hide" it with
UI.

```ts
// In the upload action — original stays private, preview is what the gallery serves.
import { createImage } from "~stencil/image";

const preview = await createImage(env).transform(file, {
  width: 1600,
  watermark: {
    key: settings.watermarkLogoKey, // builder's mark, uploaded once
    position: "bottom-right",
    opacity: 0.5,
    scale: 0.2,
    margin: 24,
  },
});
await storage.put(`photos/private/${id}`, file, { httpMetadata: { contentType: file.type } });
await storage.put(`photos/preview/${id}`, preview.body, { httpMetadata: { contentType: preview.contentType } });
```

The clean original (`photos/private/…`) must only ever be read by routes that check the
visitor is entitled to it — after purchase, say — per the `storage` skill's serving
section. If any public route serves the private key, the watermark protects nothing.
