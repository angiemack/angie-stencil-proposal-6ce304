---
name: file-export
description: Handing an app user a file — a "Download" or "Export" button, a "Download all", CSV or spreadsheet export, saving a generated image or canvas, serving a stored file (an upload, a finished video render) as a download, or relaying a file that lives on another host (a render provider, a connected service) as a download. Load before wiring any download or export, before touching code that imports `~stencil/files`, and for fixes — a download that does nothing, the wrong file type, "download all" saving only one file, a file that won't open in Excel or doesn't match the preview. Never hand-roll CSV escaping, MIME types, Content-Disposition, or blob-anchor code. For printable documents (invoice, report) see `print-to-pdf`.
metadata:
  agents: [chat, builder]
---

# File export & downloads

`~stencil/files` is the one supported path for handing an app user a finished file. Every
helper derives the Content-Type from the filename's extension and builds the download
headers correctly — hand-rolled versions of any of this (CSV string-joins, MIME lookup
tables, blob-anchor snippets) are bugs waiting to be re-found; don't write them.

## Pick the path

| The file is… | Use |
| --- | --- |
| Tabular data — records, a report, "export my data" | `toCsv(rows)` → `fileResponse` in a resource route |
| Generated or fetched on the server — AI output, a transformed image | `fileResponse(bytes, "name.ext")` |
| Already in R2 — an upload, a finished video render | `serveR2Object(storage, key, request, { downloadAs: "name.ext" })` |
| On another host — a render provider, a connected service's URL | `downloadResponse(url, "name.ext", { hosts })` in a resource route |
| Generated in the browser — a canvas, composed text | `saveFile(data, "name.ext")` |
| A printable document — invoice, receipt, report, ticket | Compose HTML and use the `print-to-pdf` skill; the browser's own print dialog saves the PDF |

Prefer the server rows: a download served with `Content-Disposition` behaves identically
in every browser and needs no client code beyond a plain `<a href>`. Reach for `saveFile`
only when the bytes genuinely originate in the browser.

## Spreadsheet / CSV export

```tsx
// app/routes/api.export-contacts.tsx — register route("api/export-contacts", ...)
import type { Route } from "./+types/api.export-contacts";
import { requireAuth } from "~stencil/auth/server";
import { createDb } from "~stencil/db";
import { toCsv, fileResponse } from "~stencil/files";
import { contacts } from "~/generated/db-schema";
import { eq } from "drizzle-orm";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const db = createDb(context.cloudflare.env);
  const rows = await db.select().from(contacts).where(eq(contacts.createdBy, user.id));

  return fileResponse(
    toCsv(rows, [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "createdAt", label: "Added" },
    ]),
    "contacts.csv",
  );
}
```

The download button is a plain anchor — never `fetch` the route and re-save the bytes:

```tsx
<Button asChild>
  <a href="/api/export-contacts">Export CSV</a>
</Button>
```

What `toCsv` settles so you don't have to:

- **Formula injection is neutralised.** A text cell starting with `=`, `+`, `-`, or `@`
  would be executed as a formula by Excel and Google Sheets — a security hole when the
  cell came from app-user input. `toCsv` prefixes those with an apostrophe. Never bypass
  it with hand-joined strings, and never strip the apostrophes back out.
- Excel-friendly output: UTF-8 BOM (accents decode correctly), CRLF lines, RFC 4180 quoting.
- Columns default to every key across the rows; pass `columns` to control order and headers.

CSV opens in Excel, Numbers, and Google Sheets — it is the supported spreadsheet export.
Generating real `.xlsx` is not a platform capability; don't install spreadsheet libraries
to fake it.

## Delivering a stored artifact

Anything already in the app's R2 — an upload, or the finished `key` from a video render —
becomes a download by serving it with a filename:

```ts
return serveR2Object(storage, video.r2Key, request, { downloadAs: `${video.title}.mp4` });
```

A "Download video" button is an anchor pointing at that route. Omit `downloadAs` when the
route feeds an inline `<video>`/`<img>` — the option exists for the take-away copy.

## Downloading a file from another host

Browsers ignore the `download` attribute on a cross-origin `<a>`, so a link straight at a
provider URL navigates or opens a tab instead of saving. Any file the app did not serve
itself goes through the app — a resource route fetches it server-side and streams it back
same-origin with `downloadResponse`:

```tsx
// app/routes/download.$id.tsx — register route("download/:id", ...)
import type { Route } from "./+types/download.$id";
import { requireAuth } from "~stencil/auth/server";
import { createDb } from "~stencil/db";
import { downloadResponse } from "~stencil/files";
import { renders } from "~/generated/db-schema";
import { and, eq } from "drizzle-orm";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const db = createDb(context.cloudflare.env);
  const [file] = await db
    .select()
    .from(renders)
    .where(and(eq(renders.id, params.id), eq(renders.createdBy, user.id)));
  if (!file) return new Response("Not found", { status: 404 });

  return downloadResponse(file.url, `${file.title}.pdf`, {
    hosts: ["renders.example-provider.com"],
  });
}
```

The download button is a plain anchor at `/download/${file.id}`.

- **`hosts` is required and stays narrow.** List the app's own known hosts — its render
  provider, its storage bucket's public host — as exact names or `*.` wildcards. It is what
  keeps the route from being an open proxy: never derive it from the request or from the
  stored URL itself.
- **One app-user click → one download.** For "Download all", give each file its own anchor,
  or build one ZIP server-side and serve that. Never loop programmatic clicks on a timer —
  popup blockers cancel every download after the first.
- Files already in the app's own R2 keep using `serveR2Object`; `downloadResponse` is only
  for files on a host the app doesn't serve.

## Saving client-generated files

```tsx
import { saveFile } from "~stencil/files";

async function downloadCard(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Canvas export failed");
  saveFile(blob, "card.png");
}
```

`saveFile` is browser-only: call it from an event handler, never during render or SSR.

When the app draws the exported image itself (a canvas of creatives, cards, slides), the
recurring bugs live upstream of the save — settle each the same way every time:

- **Wait for webfonts**: `await document.fonts.ready` before drawing text to the canvas,
  or the export renders in fallback glyphs while the preview looked right.
- **Explicit output size**: set the canvas `width`/`height` to the intended pixel
  dimensions (× `devicePixelRatio` for sharp output) — never whatever the viewport gave you.
- **Name matches encoder**: `canvas.toBlob(cb, "image/png")` → `.png`. Don't label a PNG
  `.jpg`; `saveFile` derives the MIME type from the extension you pass.
- **Show state**: disable the button and show a spinner while generating, and a clear done
  signal after — the save itself fires no event the app can observe.

## Printable documents

For a document the app user keeps on paper or as a PDF — invoices, receipts, reports,
certificates, tickets — compose it as ordinary HTML + Tailwind and use the print pattern
from the `print-to-pdf` skill. The browser's print dialog does the PDF making, with page
sizes, fonts, and pagination handled by the layout engine.

Do **not** hand-draw documents: no jsPDF or canvas page geometry, no manual font
embedding, no laying out lines in point coordinates. There is no server-side PDF
*generator* on the platform; `createImage(env).fromPdf` (the `pdf-preview` skill) goes the
other way — it rasterises an existing PDF into an image.
