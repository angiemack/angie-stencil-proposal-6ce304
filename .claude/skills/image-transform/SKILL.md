---
name: image-transform
description: Resizing, cropping, compressing, rotating, or format-converting an existing image server-side — thumbnails, avatar crops, downscaling before an AI vision call, WebP/AVIF conversion. Uses createImage(env).transform from ~stencil/image (Cloudflare Images binding, keyless, server-side). Load whenever the brief needs server-side image processing on uploaded or stored images — note that *displaying* a stored image at a different size needs no transform-and-store: the serving route resizes by URL (see the storage skill). For stamping a watermark/logo onto pictures (`transform`'s `watermark` option), load the `watermark` skill. Do NOT reach for Sharp, jimp, or any native/npm image library — they can't run on Cloudflare Workers.
metadata:
  agents: [chat, builder]
---

# Image transform

`createImage(env).transform(source, params)` from `~stencil/image` resizes, crops,
rotates, and format-converts an image at request time, proxied through the Stencil
backend (Cloudflare Images binding). No API keys. **Server-side only** — loaders,
actions, or scheduled handlers, never the browser.

## Do not use Sharp (or any native image library)

The app deploys to Cloudflare Workers (workerd). **Sharp** is a native libvips
`.node` addon and **cannot load on Workers**, even with `nodejs_compat` — importing it
fails the whole worker at startup. The same goes for any package that shells out to
ImageMagick or bundles a native codec. There is exactly one supported server-side path
for resizing an image: `createImage(env).transform`. Reach for it instead of `sharp`,
`jimp`, `@napi-rs/image`, or a `/api/process-image` route built on them.

## API

```ts
const { body, contentType } = await createImage(env).transform(source, {
  width: 400,
  height: 400,
  fit: "cover",
  format: "image/webp",
  quality: 80,
});
```

- `source` (required) — the image bytes: an uploaded `File`/`Blob`, an `ArrayBuffer`,
  or a `Uint8Array` (e.g. bytes read back from R2). **Max 20 MB** — a larger source is
  rejected with a 413, so cap the upload before calling (see below).
- `width` / `height` — target size in pixels. Omit one to scale by the other.
- `fit` — how the image fills the box: `scale-down` (default), `contain`, `pad`,
  `squeeze`, `cover`, `crop`.
- `rotate` — `90`, `180`, or `270`.
- `format` — `image/webp` (default), `image/jpeg`, `image/png`, `image/gif`,
  `image/avif`.
- `quality` — `1`–`100` for lossy formats.

Returns the transformed image as a byte **stream** (`body`) plus its `contentType` —
pass `body` straight to `createStorage().put(key, body)`. The response is known-length,
so R2 accepts the stream directly; no need to buffer it in the worker first.

### The 20 MB source limit

`transform` cannot read a source over 20 MB — photos straight off a modern camera or
phone routinely exceed it. Check the size in the upload handler and tell the app user,
rather than letting the transform fail:

```ts
const MAX_IMAGE_BYTES = 20_000_000; // 20 MB, decimal — not 20 MiB
if (file.size > MAX_IMAGE_BYTES) {
  return data({ error: "That image is over 20 MB — please upload a smaller file." }, { status: 400 });
}
```

The same limit applies to the stored mark named by `watermark.key`, and the limit is on
the source you send, not on the size you transform it down to. Store the original in R2
unchanged if you need it; only the bytes handed to `transform` are capped.

## Showing a stored image smaller or sharper? Don't store a copy — size the URL

To display a stored image at a different size (thumbnails, list photos, sharp
hero images), **do not** transform at upload time and store a second file. Store
the original once; the serving route resizes on the way out when the URL asks
for a size — `/api/files/<key>?width=400&height=400&fit=cover` — and the variant
is cached at the edge. That works for every image already in storage, needs no
naming convention linking two files, and never drifts out of sync with the
original. The route wiring (`serveR2Object` + `imageTransformFromRequest`) and
the accepted params are in the `storage` skill's serving section.

Upload handlers store the file once, untouched:

```ts
// app/routes/api.upload-photo.tsx  (register in app/routes.ts)
import type { Route } from "./+types/api.upload-photo";
import { createStorage } from "~stencil/storage";
import { requireAuth } from "~stencil/auth/server";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const storage = createStorage(env);

  const form = await request.formData();
  const file = form.get("photo") as File;

  const key = `photos/${user.id}/${crypto.randomUUID()}`;
  await storage.put(key, file, { httpMetadata: { contentType: file.type } });

  return Response.json({ key });
}
```

Reach for `transform` + `put` only when the transformed bytes are genuinely a
different stored asset — a watermarked copy that must exist so the clean source
is never served (see the `watermark` skill), or a permanent conversion of the
stored file itself.

## Downscale before an AI vision call

A full-size photo wastes tokens and can exceed model input limits. When stored
image bytes go to a vision model (or any classifier), `transform` them down
first — this is the byte-in/byte-out case the serving route can't cover:

```ts
const object = await storage.get(photoKey);
if (!object) throw new Response("Not found", { status: 404 });
const { body } = await createImage(env).transform(await object.arrayBuffer(), {
  width: 1024,
  fit: "scale-down",
  format: "image/webp",
});
const bytes = await new Response(body).arrayBuffer(); // hand these to the model
```

Nothing is stored: the downscaled bytes exist only for the call.

## Watermarking

`transform` composites a mark onto the picture when you pass the `watermark` option,
naming a mark you have stored in R2 — the delivered bytes are already marked
server-side, which a client-side overlay can never guarantee. The options and the
serve-only-the-marked-copy pattern are in the `watermark` skill.

## Previewing a PDF

`transform` cannot read a PDF — Cloudflare Images only ingests image formats. To render a
page of an uploaded PDF to an image (a document thumbnail, say), use `createImage(env).fromPdf`
— see the `pdf-preview` skill.
