---
name: runtime-image-generation
description: Generating images AT RUNTIME from user input — an avatar maker, an "illustrate my note" button, an AI art tool, anywhere the running app must create an image on demand. Uses createImage from ~stencil/image (Cloudflare Workers AI, keyless, server-side). Load when the brief asks the app to generate images WHILE RUNNING in response to user input. NOT for static build-time assets (heroes, logos, backgrounds, textures) — those use dev-tools generate-image (the generate-image skill), not this.
metadata:
  title: Runtime Image Generation
---

# Runtime image generation

`createImage(env)` from `~stencil/image` turns a text prompt into an image at request
time, proxied through the Stencil backend (Cloudflare Workers AI). No API keys.
**Server-side only** — loaders, actions, or scheduled handlers, never the browser.

Use this **only** when the app must generate an image in response to user input
while running (avatar generators, "illustrate this" buttons, AI art features). For
static assets baked into the design at build time — hero images, logos,
backgrounds, textures — use `dev-tools generate-image` instead (see the
`generate-image` skill). Don't wire this in unless the brief asks for runtime
generation.

## API

```ts
const { bytes, contentType } = await createImage(env).generate({ prompt, model });
```

- `prompt` (required) — what to draw.
- `model` (optional) — any Cloudflare Workers AI text-to-image model **id**.
  Defaults to `@cf/black-forest-labs/flux-1-schnell`.

Returns the image as a byte **stream** (`body`) plus the `contentType` the model
produced — pipe it straight into R2, never buffered in the worker.

### Recommended models

Pass the model's full id — any Workers AI text-to-image model works (see the
Cloudflare Workers AI models catalog for the full list):

| model id | notes |
|---|---|
| `@cf/black-forest-labs/flux-1-schnell` | Default. Fast, high quality, strong prompt adherence. |
| `@cf/stabilityai/stable-diffusion-xl-base-1.0` | Finer detail; slower. |
| `@cf/bytedance/stable-diffusion-xl-lightning` | Fastest; good for drafts/thumbnails. |

Stick with the default unless the brief wants a specific look.

## Store in R2, keep the key in D1

Never hold image bytes in the database. Write them to R2 with `createStorage`,
store only the returned key, and serve them from your own resource route.

```ts
// app/routes/api.generate-avatar.tsx  (register in app/routes.ts)
import type { Route } from "./+types/api.generate-avatar";
import { createImage } from "~stencil/image";
import { createStorage } from "~stencil/storage";
import { createDb } from "~stencil/db";
import { requireAuth } from "~stencil/auth/server";
import { avatars } from "~/generated/db-schema";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const { prompt } = await request.json<{ prompt: string }>();

  const { body, contentType } = await createImage(env).generate({ prompt });

  // Pipe the stream straight into R2 — the bytes are never buffered in the worker.
  const key = `avatars/${user.id}/${crypto.randomUUID()}`;
  await createStorage(env).put(key, body, { httpMetadata: { contentType } });

  const db = createDb(env);
  const now = new Date().toISOString();
  await db.insert(avatars).values({
    id: crypto.randomUUID(),
    createdBy: user.id,
    imageKey: key,
    createdAt: now,
  });

  return Response.json({ key });
}
```

## Serve the stored image

R2 keys are not public URLs. Serve the bytes through your own resource route so
access stays under your control:

```ts
// app/routes/img.$.tsx  →  register as route("img/*", "routes/img.$.tsx")
import type { Route } from "./+types/img.$";
import { createStorage } from "~stencil/storage";

export async function loader({ params, context }: Route.LoaderArgs) {
  const obj = await createStorage(context.cloudflare.env).get(params["*"]);
  if (!obj) throw new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg" },
  });
}
```

Then reference it as `/img/<key>` in an `<img>` (always with `alt`, `width`, `height`).

## Rules

- **Server-side only** — call it in a loader / action / scheduled handler. Never
  from the browser or a `useEffect`.
- **Pipe the stream into R2, store only the key in D1** — never image bytes in D1.
- Add an entity (via `dev-tools create-entity`) to hold the key + owner if the
  generated images need to persist and list per user.
- Generate on an explicit user action; a diffusion call takes a few seconds, so
  show a pending state and don't block a page's initial render on it.
