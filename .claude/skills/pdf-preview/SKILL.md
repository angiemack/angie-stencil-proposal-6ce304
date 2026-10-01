---
name: pdf-preview
description: Rendering a page of an uploaded PDF to an image — a first-page thumbnail for a document, a page preview in a viewer, a "1 of 12" caption. Uses createImage(env).fromPdf from ~stencil/image (keyless, server-side). Load whenever the brief needs a preview, thumbnail, or rendered page of a PDF. Do NOT reach for pdf.js, pdf-lib, pdfjs-dist, or any native/npm PDF library — they can't run on Cloudflare Workers.
allowed-tools: createEntity updateEntity
metadata:
  agents: [chat, builder]
---

# PDF page previews

`createImage(env).fromPdf(source, params)` from `~stencil/image` renders one page of a
PDF to an image, proxied through the Stencil backend (the platform's PDF renderer). No
API keys. **Server-side only** — loaders, actions, or scheduled handlers, never the
browser.

This is separate from `transform` (the `image-transform` skill): Cloudflare Images
cannot ingest a PDF, so a PDF page has to be rasterized first. `fromPdf` does that and
hands back an image in the format you ask for.

## Do not use pdf.js (or any PDF library)

The app deploys to Cloudflare Workers (workerd). `pdf.js`, `pdfjs-dist`, `pdf-lib`, and
any package that bundles a native PDF binary either fail to load or can't render on
Workers. There is exactly one supported path for turning a PDF page into an image:
`createImage(env).fromPdf`. Reach for it instead.

## API

```ts
const preview = await createImage(env).fromPdf(file, {
  page: 1,            // 1-based, default 1
  width: 800,         // max 2000; height follows the page's aspect ratio
  format: "image/webp",
});
// preview.body, preview.contentType, preview.pageCount
```

- `source` (required) — the PDF bytes: an uploaded `File`/`Blob`, an `ArrayBuffer`, or a
  `Uint8Array` (e.g. bytes read back from R2).
- `page` — which page to render, 1-based. Default `1`.
- `width` — rendered width in px (max 2000); height follows the page's aspect ratio.
  Default 1000.
- `format` — `image/webp` (default), `image/jpeg`, `image/png`, `image/gif`,
  `image/avif`.

Returns the rendered page as a byte **stream** (`body`) plus its `contentType` and
`pageCount` (total pages in the document — useful for a "1 of 12" caption). Pass `body`
straight to `createStorage().put(key, body)`; the response is known-length, so R2
accepts the stream directly.

## Render once, at upload time, and store the result

A preview costs real work; regenerating it on every page view wastes it. Store the image
in R2 beside the PDF and keep both keys in D1 — the same shape as the thumbnail pattern
in the `image-transform` skill.

```ts
const pdfKey = `docs/${user.id}/${crypto.randomUUID()}`;
await storage.put(pdfKey, file, { httpMetadata: { contentType: "application/pdf" } });

const preview = await createImage(env).fromPdf(file, { width: 800 });
const previewKey = `${pdfKey}-preview`;
await storage.put(previewKey, preview.body, {
  httpMetadata: { contentType: preview.contentType },
});

await db.insert(documents).values({
  id: crypto.randomUUID(), pdfKey, previewKey,
  pageCount: preview.pageCount, createdBy: user.id, /* ... */
});
```

## Handle an unreadable PDF

`fromPdf` throws when the PDF cannot be read, and the message is specific enough to show
the person who uploaded it — "PDF is password-protected" is the common one. Catch it and
surface the reason rather than failing the whole upload:

```ts
let previewKey: string | null = null;
let pageCount: number | null = null;
try {
  const preview = await createImage(env).fromPdf(file, { width: 800 });
  previewKey = `${pdfKey}-preview`;
  pageCount = preview.pageCount;
  await storage.put(previewKey, preview.body, {
    httpMetadata: { contentType: preview.contentType },
  });
} catch (err) {
  // Keep the upload; the list just shows a generic document icon for this row.
  console.error("preview failed", err);
}
```
