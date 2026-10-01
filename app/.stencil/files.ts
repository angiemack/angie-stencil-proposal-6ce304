/**
 * File export and download helpers — one path for handing an app user a
 * finished file. `toCsv` turns rows into spreadsheet-safe CSV, `fileResponse`
 * serves any bytes as a download from a loader/action, `downloadResponse`
 * relays a file from another host as a same-origin download, and `saveFile`
 * saves client-generated data (a canvas blob, say) from the browser. Filename,
 * Content-Type and Content-Disposition are derived here — never hand-build them.
 */

const MIME_BY_EXT: Record<string, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json",
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  ics: "text/calendar;charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  zip: "application/zip",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** The MIME type for a filename's extension; `application/octet-stream` when unknown. */
export function contentTypeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * A `Content-Disposition` header value carrying `filename` safely: an ASCII
 * fallback plus the RFC 5987 UTF-8 form, so non-Latin names survive every browser.
 */
export function contentDisposition(
  filename: string,
  type: "attachment" | "inline" = "attachment",
): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const utf8 = encodeURIComponent(filename).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export interface CsvColumn {
  /** The row property to read. */
  key: string;
  /** Header text; defaults to `key`. */
  label?: string;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // A text cell starting with = + - @ (or a tab/CR) is executed as a formula by
  // Excel and Sheets, so app-user input could run code on whoever opens the
  // export. The leading apostrophe forces plain text; real numbers stay numbers.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Rows → CSV text that desktop spreadsheet apps open correctly: RFC 4180
 * quoting, CRLF lines, a UTF-8 BOM so Excel decodes accents, and formula
 * injection neutralised (see `csvCell`) — never bypass this with hand-joined
 * strings. Columns default to every key seen across the rows, in first-seen
 * order. Pass the result to `fileResponse(csv, "report.csv")`.
 */
export function toCsv(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns?: ReadonlyArray<string | CsvColumn>,
): string {
  const cols: CsvColumn[] = columns
    ? columns.map((c) => (typeof c === "string" ? { key: c } : c))
    : [...new Set(rows.flatMap((row) => Object.keys(row)))].map((key) => ({ key }));
  const lines = [cols.map((c) => csvCell(c.label ?? c.key)).join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => csvCell(row[c.key])).join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export interface FileResponseOptions {
  /** Overrides the type derived from the filename's extension. */
  contentType?: string;
  /** `inline` shows the file in the browser (a PDF viewer, say) instead of saving it. */
  disposition?: "attachment" | "inline";
}

/**
 * Serve bytes as a named file download. Return it from a loader or resource
 * route and point a plain `<a href>` at that route — the server-set headers
 * make the save behave identically in every browser. Content-Type and
 * Content-Disposition come from `filename`; don't set them by hand.
 */
export function fileResponse(
  data: string | Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array>,
  filename: string,
  opts: FileResponseOptions = {},
): Response {
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const headers = new Headers({
    "Content-Type": opts.contentType ?? contentTypeFor(filename),
    "Content-Disposition": contentDisposition(filename, opts.disposition ?? "attachment"),
  });
  const size =
    body instanceof Uint8Array || body instanceof ArrayBuffer
      ? body.byteLength
      : body instanceof Blob
        ? body.size
        : null;
  if (size !== null) headers.set("Content-Length", String(size));
  return new Response(body as BodyInit, { headers });
}

export interface DownloadResponseOptions {
  /**
   * Hostnames the URL may point at — the app's own known hosts (its storage
   * bucket, its render provider). Exact (`renders.example.com`) or a `*.`
   * wildcard for subdomains (`*.r2.dev`). Required so the route serving this
   * is never an open proxy.
   */
  hosts: readonly string[];
  /** Overrides the content type reported by the upstream response. */
  contentType?: string;
}

function hostAllowed(hostname: string, hosts: readonly string[]): boolean {
  return hosts.some((h) =>
    h.startsWith("*.") ? hostname.endsWith(h.slice(1)) : hostname === h,
  );
}

/**
 * Fetch a file from another host server-side and stream it back as a
 * same-origin download. Browsers ignore the `download` attribute on
 * cross-origin links, so any file the app did not serve itself must come
 * through a resource route returning this. The URL must resolve to one of
 * `opts.hosts`; anything else is refused.
 */
export async function downloadResponse(
  url: string,
  filename: string,
  opts: DownloadResponseOptions,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol) || !hostAllowed(parsed.hostname, opts.hosts)) {
    return new Response("Host not allowed", { status: 403 });
  }
  const upstream = await fetch(parsed.toString());
  // fetch follows redirects, which can leave the allowlist — check where it landed.
  if (upstream.url && !hostAllowed(new URL(upstream.url).hostname, opts.hosts)) {
    return new Response("Host not allowed", { status: 403 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream fetch failed", { status: 502 });
  }
  // Upstream Content-Length is not forwarded: fetch may hand back a decoded
  // body whose length no longer matches it, truncating the download.
  return new Response(upstream.body, {
    headers: {
      "Content-Type":
        opts.contentType ?? upstream.headers.get("Content-Type") ?? contentTypeFor(filename),
      "Content-Disposition": contentDisposition(filename),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Save client-generated data (a canvas blob, composed text, fetched bytes) to
 * the app user's device. Browser-only — call it from an event handler, never
 * during render and never on the server. For anything that already lives on
 * the server or in storage, prefer a route returning `fileResponse` /
 * `serveR2Object` instead of shipping bytes to the client to re-save.
 */
export function saveFile(
  data: Blob | Uint8Array | ArrayBuffer | string,
  filename: string,
  contentType?: string,
): void {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data as BlobPart], { type: contentType ?? contentTypeFor(filename) });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Firefox ignores a click on a detached anchor.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Deferred: revoking synchronously cancels the save in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
