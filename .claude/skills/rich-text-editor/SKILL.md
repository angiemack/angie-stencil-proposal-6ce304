---
name: rich-text-editor
description: Use when the app needs rich text editing — a WYSIWYG editor, post or comment composer, document/notes editor, blog post body, or any field where an app user writes formatted text with images. Ships a ready-made tiptap editor component to copy in (toolbar, lists, code blocks, links, image/file upload via picker + paste + drop), the pinned packages to install, and the upload route it needs. The stored value is markdown, rendered back with the template's existing markdown component. Not for plain single-line inputs or a chat composer that only needs plain text.
metadata:
  agents: [builder]
---

# Rich text editor (tiptap)

A real WYSIWYG editor for formatted text: toolbar, lists, code blocks, links, image upload by picker, paste, and drop. The component ships with this skill — you **copy it in and wire props**, you do not write an editor from scratch. The value it reads and writes is **markdown, never HTML**, so the read side is the template's existing `~/components/markdown` component and storage is a plain D1 text column.

## 1. Install the pinned packages

tiptap is not a template dependency — add it only because this app needs it:

```bash
bun add @tiptap/react@2.27.2 @tiptap/starter-kit@2.27.2 @tiptap/extension-image@2.27.2 @tiptap/extension-link@2.27.2 @tiptap/core@2.27.2 @tiptap/pm@2.27.2 tiptap-markdown@0.8.10
```

The versions are not a preference. An unpinned `bun add @tiptap/react` resolves to tiptap v3, and `tiptap-markdown@0.8.x` only speaks v2 — the mix fails the build. Pin every `@tiptap/*` package to `2.27.2`, and never mix v2 and v3 packages.

## 2. Turn on `prose` typography

The template installs `@tailwindcss/typography` but does not register it, so `prose` classes match no CSS until you add the plugin line. Without it the editor's bullets and numbers disappear (Tailwind's preflight clears `list-style`), headings render at body size, and code blocks lose their background. Add it to `app/app.css` after the existing imports:

```css
@plugin "@tailwindcss/typography";
```

One line, once per app. The template's `~/components/markdown` read side needs it too, so this also fixes how the saved markdown renders back.

## 3. Copy the component in — don't reinvent it

The editor ships next to this skill. Copy it into the app:

```bash
cp .claude/skills/rich-text-editor/rich-text-editor.tsx app/components/rich-text-editor.tsx
```

It is already built for this template: shadcn toolbar (`Toggle`, `Button`, `Separator`, `Popover`), lucide icons, `prose` typography classes on the writing surface, and `immediatelyRender: false` so it hydrates cleanly under server rendering — **keep that flag**; removing it breaks hydration.

Props:

```tsx
<RichTextEditor
  value={draft}                    // markdown string
  onChange={setDraft}              // called with markdown on every edit
  uploadUrl="/api/upload"          // default; the route you create in step 4
  placeholder="Write something…"
  minHeightClass="min-h-32"        // writing-surface height; a comment box can pass min-h-20
  maxHeightClass="max-h-96"        // optional: scroll internally instead of growing
  onSubmit={submit}                // optional: Cmd/Ctrl+Enter
/>
```

Restyle or extend it (more toolbar buttons, different `accept` filter) by editing the copy in `app/components/` — but start from the copy.

## 4. Create the upload and file routes

The image button, paste, and drop all POST a multipart `file` to `uploadUrl` and expect `{ url }` back. App R2 objects are private, so the URL must go through the app's own routes — one to upload, one to serve (the `storage` skill covers both in depth).

**`app/routes/api.upload.tsx`** — store the file, return the serving URL:

```ts
import type { Route } from "./+types/api.upload";
import { requireAuth } from "~stencil/auth/server";
import { createStorage } from "~stencil/storage";

export async function action({ request, context }: Route.ActionArgs) {
  await requireAuth(request, context.cloudflare.env);
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file" }, { status: 400 });
  }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `editor/${crypto.randomUUID()}-${safe}`;
  await createStorage(context.cloudflare.env).put(key, file, {
    httpMetadata: { contentType: file.type },
  });
  return Response.json({ url: `/api/files/${key}` });
}
```

Drop the `requireAuth` line only if the app is public-only.

**`app/routes/api.files.$.tsx`** — serve stored files (skip if the app already has it):

```ts
import type { Route } from "./+types/api.files.$";
import { createStorage, serveR2Object } from "~stencil/storage";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const key = params["*"];
  if (!key) throw new Response("Not found", { status: 404 });
  return serveR2Object(createStorage(context.cloudflare.env), key, request);
}
```

Register both in `app/routes.ts`:

```ts
route("api/upload", "routes/api.upload.tsx"),
route("api/files/*", "routes/api.files.$.tsx"),
```

## 5. Store markdown, render with the existing markdown component

The editor's value is a markdown string — persist it to D1 as-is (a `text` column). **Do not convert it to HTML or store editor JSON**: the read side is already in the template and round-trips markdown for free.

```tsx
import { Markdown } from "~/components/markdown";

<Markdown>{post.body}</Markdown>
```

Uploaded images come out as standard markdown image syntax pointing at `/api/files/…`, so they render on the read side with no extra work.

## Checklist

- Packages added with `bun add`, every `@tiptap/*` pinned to `2.27.2`, `tiptap-markdown` to `0.8.10`. Nothing added to apps that didn't ask for an editor.
- `@plugin "@tailwindcss/typography";` added to `app/app.css` — without it the editor's lists and code blocks render unstyled.
- Component copied from `.claude/skills/rich-text-editor/rich-text-editor.tsx` to `app/components/rich-text-editor.tsx`, `immediatelyRender: false` intact.
- `api/upload` + `api/files/*` routes created and registered; uploads land in R2 via `createStorage`, never in D1.
- D1 stores the markdown string; reading renders through `~/components/markdown`, not `dangerouslySetInnerHTML`.
