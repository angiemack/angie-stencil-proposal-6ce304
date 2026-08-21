---
name: image-transform
description: Resizing, cropping, compressing, rotating, or format-converting an existing image server-side — thumbnails, avatar crops, upload downscaling, WebP/AVIF conversion. Uses createImage(env).transform from ~stencil/image (Cloudflare Images binding, keyless, server-side). Load whenever the brief needs server-side image processing on uploaded or stored images. Do NOT reach for Sharp, jimp, or any native/npm image library — they can't run on Cloudflare Workers.
metadata:
  title: Image Transform (resize / crop / convert)
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
  or a `Uint8Array` (e.g. bytes read back from R2).
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

## Resize an upload, store the thumbnail in R2

Keep image bytes in R2 and only the key in D1 (see the `storage` skill). A common
pattern is to store the original and a downscaled variant:

```ts
// app/routes/api.upload-photo.tsx  (register in app/routes.ts)
import type { Route } from "./+types/api.upload-photo";
import { createImage } from "~stencil/image";
import { createStorage } from "~stencil/storage";
import { requireAuth } from "~stencil/auth/server";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const storage = createStorage(env);

  const form = await request.formData();
  const file = form.get("photo") as File;

  // Original, untouched.
  const originalKey = `photos/${user.id}/${crypto.randomUUID()}`;
  await storage.put(originalKey, file, { httpMetadata: { contentType: file.type } });

  // 400×400 WebP thumbnail — transform once, pipe the stream into R2.
  const thumb = await createImage(env).transform(file, {
    width: 400,
    height: 400,
    fit: "cover",
    format: "image/webp",
  });
  const thumbKey = `${originalKey}-thumb`;
  await storage.put(thumbKey, thumb.body, {
    httpMetadata: { contentType: thumb.contentType },
  });

  return Response.json({ originalKey, thumbKey });
}
```

## Transform an image already in R2

`transform` takes bytes, so read the object first, then pass it through:

```ts
const object = await storage.get(originalKey);
if (!object) throw new Response("Not found", { status: 404 });
const { body, contentType } = await createImage(env).transform(await object.arrayBuffer(), {
  width: 1200,
  format: "image/avif",
});
await storage.put(`${originalKey}-large`, body, { httpMetadata: { contentType } });
```

Serve stored images through your own resource route (R2 keys are not public URLs) —
see the `storage` skill's serving section.
