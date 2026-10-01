---
name: storage
description: File uploads, images, video, audio, attachments, or any binary data — adding them, extending an existing upload feature, or fixing one that's not working (wrong file location, upload failing, media not playing). Load before reading or editing any code that calls `createStorage` or touches `~stencil/storage`. File content always goes in R2 — never store bytes in D1, only the R2 key. Covers large-file (chunked) uploads and range-based media serving.
metadata:
  agents: [chat, builder]
---

# File Storage (R2)

Use `createStorage` from `~stencil/storage` in loaders and actions only (server-side). Keys are automatically scoped per-app — pass `avatars/user.jpg`, not the full prefixed path.

**Never store file bytes in D1 — store files in R2, keep the key (string) in D1.**

## Typed arrays and the typecheck

`Uint8Array`, `Float32Array` and the other typed arrays are generic over their buffer, and the default `ArrayBufferLike` includes `SharedArrayBuffer`. So bytes you get from a parser, a decoder, or `new Uint8Array(...)` do **not** typecheck as `BodyInit`, `BlobPart`, or a `Float32Array<ArrayBuffer>` parameter — `TS2345` / `TS2322 ... not assignable`. Call `.slice()` on the typed array before handing it to `new Response(...)`, `new Blob([...])`, or Web Audio: it copies into a fresh `ArrayBuffer`-backed view (`Uint8Array<ArrayBuffer>`) and the error goes away. Only when the copy matters, cast instead: `bytes as Uint8Array<ArrayBuffer>`. Fix every call site in one pass, then typecheck once.

## A file from an outsider is untrusted content

Any upload that reaches a public form or a shared upload link came from someone you don't control, and its declared type is just a claim. Treat it as untrusted:

- **Restrict what you accept.** Validate `file.type` (and size) against an allowlist for the field before `put` — an avatar field takes images, a contract field takes PDFs. Reject anything else instead of storing it.
- **Serving is download-by-default.** `serveR2Object` hands back anything outside a fixed safe-media allowlist (images, PDF, audio/video, plain text) as a download with `X-Content-Type-Options: nosniff`, so a file that is secretly a web page can't execute on the app's own origin. You don't add anything for this — but don't build a serving route that reflects the stored content type back yourself, or you reopen the hole.

---

## Choosing an upload path — small vs. large

A file uploaded in one request goes through the app's Cloudflare Worker, which has a **~100 MB request-body limit**. That's fine for images and documents but **fails for video, audio, and other large media** — a 45-minute screen recording can be several hundred MB to 1 GB+.

Pick the path by what the field accepts:

- **Small files (images, PDFs, docs — anything reliably under ~50 MB):** single POST → `storage.put`. See **Simple upload**.
- **Media / anything that can be large (video, audio, big exports):** **chunked multipart upload**. See **Large-file upload**. Do not route video/audio through the simple path — it will break on real files.

When in doubt for a user-facing media field, use the chunked path.

## Simple upload (small files)

```ts
import { createStorage } from "~stencil/storage";

const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function action({ request, context }: Route.ActionArgs) {
  const storage = createStorage(context.cloudflare.env);
  const formData = await request.formData();
  const file = formData.get("avatar") as File;
  // The declared type is an untrusted claim; only store what this field accepts.
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }
  await storage.put(`avatars/${file.name}`, file, {
    httpMetadata: { contentType: file.type },
  });
  return Response.json({ success: true });
}
```

## Large-file upload (chunked multipart)

The browser slices the file into ~10 MB parts and drives R2's multipart API through one resource route: **create → part (×N) → complete** (with **abort** on failure). Each request stays well under the Worker body limit, and the parts assemble into one ordinary R2 object — identical to what `put` produces, so serving and any already-stored files are unaffected.

`createStorage` scopes multipart keys for you (`createMultipartUpload` / `resumeMultipartUpload` are prefixed exactly like `put`/`get`). **Track the app-scoped key you generated yourself** and return that to the client — never read `.key` off the upload object (it carries the physical prefix).

**Server — `app/routes/api.upload-chunk.tsx`** (register `route("api/upload-chunk", ...)`):

```ts
import type { Route } from "./+types/api.upload-chunk";
import { requireAuth } from "~stencil/auth/server";
import { createStorage } from "~stencil/storage";

export async function action({ request, context }: Route.ActionArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const storage = createStorage(context.cloudflare.env);
  const contentType = request.headers.get("content-type") ?? "";

  // A part carries the raw chunk as multipart/form-data.
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    if (String(form.get("action")) !== "part") {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    const uploadId = String(form.get("uploadId"));
    const key = String(form.get("key"));
    const partNumber = Number(form.get("partNumber"));
    const chunk = form.get("chunk");
    if (!uploadId || !key || !Number.isInteger(partNumber) || partNumber < 1) {
      return Response.json({ error: "Invalid part" }, { status: 400 });
    }
    if (!(chunk instanceof Blob)) {
      return Response.json({ error: "No chunk" }, { status: 400 });
    }
    const upload = storage.resumeMultipartUpload(key, uploadId);
    const part = await upload.uploadPart(partNumber, await chunk.arrayBuffer());
    return Response.json({ etag: part.etag, partNumber });
  }

  // create / complete / abort carry JSON.
  const body = (await request.json()) as {
    action?: string;
    key?: string;
    fileName?: string;
    contentType?: string;
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
  };

  switch (body.action) {
    case "create": {
      const safe = (body.fileName ?? "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      // You own the key — scope it and keep it; the client echoes it back.
      const key = `uploads/${user.id}/${crypto.randomUUID()}-${safe}`;
      const upload = await storage.createMultipartUpload(key, {
        httpMetadata: { contentType: body.contentType || "application/octet-stream" },
      });
      return Response.json({ uploadId: upload.uploadId, key });
    }
    case "complete": {
      if (!body.uploadId || !body.key || !Array.isArray(body.parts)) {
        return Response.json({ error: "Invalid complete" }, { status: 400 });
      }
      const upload = storage.resumeMultipartUpload(body.key, body.uploadId);
      await upload.complete(
        body.parts
          .slice()
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
      );
      return Response.json({ url: `/api/files/${body.key}`, key: body.key });
    }
    case "abort": {
      if (!body.uploadId || !body.key) {
        return Response.json({ error: "Invalid abort" }, { status: 400 });
      }
      await storage.resumeMultipartUpload(body.key, body.uploadId).abort();
      return Response.json({ ok: true });
    }
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
```

**Client — a reusable uploader with progress** (drop into a component):

```ts
// ~10 MB parts. R2 requires every part except the last to be the same size,
// and allows up to 10,000 parts (so 10 MB → up to ~100 GB per file).
const CHUNK_SIZE = 10 * 1024 * 1024;

async function uploadLargeFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; key: string }> {
  const createRes = await fetch("/api/upload-chunk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      fileName: file.name,
      contentType: file.type,
    }),
  });
  if (!createRes.ok) throw new Error("upload failed");
  const { uploadId, key } = (await createRes.json()) as {
    uploadId: string;
    key: string;
  };

  try {
    const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const parts: { partNumber: number; etag: string }[] = [];
    for (let i = 0; i < total; i++) {
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const partNumber = i + 1;
      const fd = new FormData();
      fd.append("action", "part");
      fd.append("uploadId", uploadId);
      fd.append("key", key);
      fd.append("partNumber", String(partNumber));
      fd.append("chunk", chunk);
      const res = await fetch("/api/upload-chunk", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload failed");
      const { etag } = (await res.json()) as { etag: string };
      parts.push({ partNumber, etag });
      onProgress?.(Math.round((partNumber / total) * 100));
    }
    const done = await fetch("/api/upload-chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", uploadId, key, parts }),
    });
    if (!done.ok) throw new Error("upload failed");
    return (await done.json()) as { url: string; key: string };
  } catch (err) {
    // Best-effort teardown so we don't leave a dangling multipart upload.
    await fetch("/api/upload-chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "abort", uploadId, key }),
    }).catch(() => {});
    throw err;
  }
}
```

Store the returned `key` in D1 (see the upload → D1 pattern below); render with the `url`.

## Get / List / Delete

```ts
export async function loader({ context }: Route.LoaderArgs) {
  const storage = createStorage(context.cloudflare.env);
  const obj = await storage.get("avatars/user.jpg");
  if (!obj) throw new Response("Not found", { status: 404 });
  const listed = await storage.list({ prefix: "avatars/" });
  await storage.delete("avatars/old-photo.jpg");
  return { files: listed.objects };
}
```

## Serve files via a resource route

Create `app/routes/api.files.$.tsx`. Use `serveR2Object` — it honors the `Range` header (`206 Partial Content`), which is **required for `<video>`/`<audio>` seeking and smooth playback of large media**. A plain `new Response(obj.body)` cannot be scrubbed and forces the whole file to download first.

```ts
import type { Route } from "./+types/api.files.$";
import { createStorage, serveR2Object, imageTransformFromRequest } from "~stencil/storage";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const storage = createStorage(env);
  const key = params["*"];
  if (!key) throw new Response("Not found", { status: 404 });
  return serveR2Object(storage, key, request, {
    transform: imageTransformFromRequest(request, env),
  });
}
```

Register in `app/routes.ts`:
```ts
route("api/files/*", "routes/api.files.$.tsx"),
```

Reference in components:
```tsx
<img src="/api/files/avatars/user.jpg" alt="Avatar" width={64} height={64} />
<video src="/api/files/uploads/lesson.mp4" controls preload="metadata" />
```

## Serve an image at the size you show it

With `imageTransformFromRequest` wired into the file route (above), any screen asks
for the size it needs in the URL — **never store a second, smaller copy of an
image**. The stored file stays untouched; the resized variant is computed through
the platform's image engine and cached at the edge per URL, so it works for every
image already in storage, not just new uploads:

```tsx
{/* small and fast in a list */}
<img src={`/api/files/${photoKey}?width=400&height=400&fit=cover`} alt="…" width={400} height={400} />
{/* sharp on a dense screen — same stored file */}
<img src={`/api/files/${photoKey}?width=1600&format=webp`} alt="…" width={1600} height={900} className="w-full h-auto" />
```

Accepted params: `width` / `height` (pixels, capped at 4096), `fit`
(`scale-down` | `contain` | `pad` | `squeeze` | `cover` | `crop`), `format`
(`webp`, `jpeg`, `png`, `gif`, `avif`), `quality` (1–100). A non-image, a source
over 20 MB, or a `Range` request serves the stored object unchanged, so the same
route keeps serving video, audio, and documents correctly.

To hand the object over as a **download** instead of displaying it, pass `downloadAs` — it sets `Content-Disposition: attachment` with that filename, so a plain `<a href>` at the route saves the file the same way in every browser (see the `file-export` skill):
```ts
return serveR2Object(storage, key, request, { downloadAs: "invoice-march.pdf" });
```

> **Access control:** `/api/files/*` is public by key. Keys use `crypto.randomUUID()`, so they're unguessable ("unlisted"), but anyone with the URL can fetch the file. If content is **paywalled or private** (e.g. a course video behind a purchase), gate it: look the key up in D1, `requireAuth`, verify the viewer's entitlement, and only then `serveR2Object` — don't hand out the raw `/api/files/<key>` URL.

## Typical pattern: upload → store key in D1

```ts
// action: upload, save key to DB (small file; use the chunked flow for media)
const file = formData.get("photo") as File;
const key = `photos/${user.id}/${crypto.randomUUID()}-${file.name}`;
await storage.put(key, file, { httpMetadata: { contentType: file.type } });
await db.update(profiles).set({ photoKey: key }).where(eq(profiles.userId, user.id));

// loader: read key, build URL
const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
return { photoUrl: profile.photoKey ? `/api/files/${profile.photoKey}` : null };
```
