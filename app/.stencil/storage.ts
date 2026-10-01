import { contentDisposition } from "./files";
import { createImage } from "./image";

/** Create a storage client scoped to this app's prefix in the workspace R2 bucket. */
export function createStorage(env: Env): R2Bucket {
  // Key the app's storage by its immutable id, not its slug, so a URL rename is
  // a pure data change that touches no objects.
  const prefix = `public/${env.APP_ID}/`;
  const bucket = env.STORAGE;

  return new Proxy(bucket, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      switch (prop) {
        case "put":
        case "get":
        case "head":
          return (key: string, ...args: unknown[]) =>
            value.call(target, `${prefix}${key}`, ...args);
        case "createMultipartUpload":
          return (key: string, ...args: unknown[]) =>
            value.call(target, `${prefix}${key}`, ...args);
        case "resumeMultipartUpload":
          return (key: string, uploadId: string) =>
            value.call(target, `${prefix}${key}`, uploadId);
        case "delete":
          return (keys: string | string[]) => {
            const all =
              typeof keys === "string"
                ? `${prefix}${keys}`
                : keys.map((k: string) => `${prefix}${k}`);
            return value.call(target, all);
          };
        case "list":
          // Strip the app prefix back off returned keys so list is symmetric
          // with put/get/head/delete — otherwise a key read from list() and
          // passed back to get() double-prefixes and 404s (the object is lost).
          return async (options?: R2ListOptions): Promise<R2Objects> => {
            const listed: R2Objects = await value.call(target, {
              ...options,
              prefix: `${prefix}${options?.prefix ?? ""}`,
            });
            const strip = (key: string) =>
              key.startsWith(prefix) ? key.slice(prefix.length) : key;
            return {
              ...listed,
              objects: listed.objects.map(
                (obj) =>
                  new Proxy(obj, {
                    get(t, p, r) {
                      if (p === "key") return strip(t.key);
                      const v = Reflect.get(t, p, r);
                      return typeof v === "function" ? v.bind(t) : v;
                    },
                  }),
              ),
              delimitedPrefixes: listed.delimitedPrefixes.map(strip),
            };
          };
        default:
          return value.bind(target);
      }
    },
  });
}

// Content types safe to render inline from the app's own origin. Everything else
// — most importantly HTML, SVG and XML — is served as a download, so an uploaded
// file that is secretly a web page can't execute with the viewer's session.
const INLINE_SAFE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  "text/plain",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

// The transform engine's ingest formats — exactly the image entries of the
// inline-safe list, so a resized variant can never widen what renders inline.
const TRANSFORMABLE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

// The engine rejects a larger source with a 413.
const TRANSFORM_MAX_SOURCE_BYTES = 20_000_000;
const TRANSFORM_MAX_DIMENSION = 4096;

const SERVE_TRANSFORM_FITS = new Set([
  "scale-down",
  "contain",
  "pad",
  "squeeze",
  "cover",
  "crop",
]);

export interface ServeImageTransform {
  /** The app env — the transform runs through the platform's image engine. */
  env: Env;
  /** Target width in pixels (capped at 4096). Omit one dimension to scale by the other. */
  width?: number;
  /** Target height in pixels (capped at 4096). */
  height?: number;
  /** How the image fills the target box. Default `scale-down`. */
  fit?: "scale-down" | "contain" | "pad" | "squeeze" | "cover" | "crop";
  /** Output format. Default `image/webp`. */
  format?: "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif";
  /** Output quality 1–100 for lossy formats. */
  quality?: number;
}

/**
 * Read a serve-time image transform from the request's query string —
 * `?width=` / `?height=` (pixels), `?fit=`, `?format=` (`webp` or `image/webp`),
 * `?quality=` — for a file route to pass straight to `serveR2Object`'s
 * `transform` option. Returns undefined when the URL asks for no transform,
 * so a plain request serves the object as-is.
 */
export function imageTransformFromRequest(
  request: Request,
  env: Env,
): ServeImageTransform | undefined {
  const query = new URL(request.url).searchParams;
  const int = (name: string): number | undefined => {
    const raw = query.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const transform: ServeImageTransform = { env };
  const width = int("width");
  if (width) transform.width = width;
  const height = int("height");
  if (height) transform.height = height;
  const fit = query.get("fit");
  if (fit && SERVE_TRANSFORM_FITS.has(fit)) {
    transform.fit = fit as ServeImageTransform["fit"];
  }
  const rawFormat = query.get("format")?.toLowerCase();
  const format =
    rawFormat && !rawFormat.includes("/")
      ? `image/${rawFormat === "jpg" ? "jpeg" : rawFormat}`
      : rawFormat;
  if (format && TRANSFORMABLE_IMAGE_TYPES.has(format)) {
    transform.format = format as ServeImageTransform["format"];
  }
  const quality = int("quality");
  if (quality) transform.quality = quality;
  if (!transform.width && !transform.height && !transform.format && !transform.quality) {
    return undefined;
  }
  return transform;
}

// Renders the requested variant, or null when the transform fails — the caller
// then serves the original unchanged. Dimensions are clamped so a URL cannot
// request unbounded work; the engine's output type is always inline-safe.
async function renderImageVariant(
  transform: ServeImageTransform,
  source: ArrayBuffer,
  cacheControl: string,
  downloadAs?: string,
): Promise<Response | null> {
  const clamp = (value: number | undefined, max: number) =>
    value && Number.isInteger(value) && value > 0 ? Math.min(value, max) : undefined;
  try {
    const { body, contentType } = await createImage(transform.env).transform(source, {
      width: clamp(transform.width, TRANSFORM_MAX_DIMENSION),
      height: clamp(transform.height, TRANSFORM_MAX_DIMENSION),
      fit: transform.fit,
      format: transform.format,
      quality: clamp(transform.quality, 100),
    });
    const bytes = await new Response(body).arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": downloadAs ? contentDisposition(downloadAs) : "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return null;
  }
}

// The worker's default edge cache, keyed on the request URL (which carries the
// transform params), so each variant is computed once per edge location. Both
// sides are best-effort: a runtime without it just recomputes per request.
async function edgeCacheMatch(url: string): Promise<Response | undefined> {
  try {
    return await caches.default.match(url);
  } catch {
    return undefined;
  }
}

async function edgeCachePut(url: string, response: Response): Promise<void> {
  try {
    await caches.default.put(url, response);
  } catch {
    // Serving already succeeded; the next request recomputes.
  }
}

// Builds the serving headers for a stored object. Its content type came from the
// uploading client and can't be trusted: only the allowlist renders inline under a
// server-pinned type; anything else is forced to download as generic bytes.
function safeServingHeaders(obj: R2Object): Headers {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const base = (obj.httpMetadata?.contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const inline = INLINE_SAFE_CONTENT_TYPES.has(base);
  headers.set("Content-Type", inline ? base : "application/octet-stream");
  headers.set("Content-Disposition", inline ? "inline" : "attachment");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

/**
 * Serve an R2 object as an HTTP response, honoring the request's `Range`
 * header with a `206 Partial Content` reply. Required for <video>/<audio>
 * seeking of large media. `storage` should be the `createStorage(env)` client
 * so the key is scoped automatically.
 *
 * Bytes are served as a download unless the stored type is a known-safe media
 * type, so untrusted uploads can never execute on the app's own origin. Pass
 * `downloadAs` to make the browser save the object as a file with that name
 * instead of displaying it.
 *
 * Pass `transform` (usually `imageTransformFromRequest(request, env)`) to serve
 * a stored image resized or converted on the way out — the stored file stays
 * untouched, and the variant is cached at the edge per URL. A non-image, a
 * source over 20 MB, a failed transform, or a Range request serves the object
 * unchanged.
 */
export async function serveR2Object(
  storage: R2Bucket,
  key: string,
  request: Request,
  opts: {
    cacheControl?: string;
    downloadAs?: string;
    transform?: ServeImageTransform;
  } = {},
): Promise<Response> {
  const cacheControl =
    opts.cacheControl ?? "public, max-age=31536000, immutable";
  const rangeHeader = request.headers.get("Range");

  if (!rangeHeader) {
    const transform = request.method === "GET" ? opts.transform : undefined;
    if (transform) {
      const cached = await edgeCacheMatch(request.url);
      if (cached) return cached;
    }
    const obj = await storage.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    const headers = safeServingHeaders(obj);

    let body: BodyInit = obj.body;
    if (
      transform &&
      TRANSFORMABLE_IMAGE_TYPES.has(headers.get("Content-Type") ?? "") &&
      obj.size <= TRANSFORM_MAX_SOURCE_BYTES
    ) {
      const source = await obj.arrayBuffer();
      body = source;
      const variant = await renderImageVariant(
        transform,
        source,
        cacheControl,
        opts.downloadAs,
      );
      if (variant) {
        await edgeCachePut(request.url, variant.clone());
        return variant;
      }
    }

    headers.set("Content-Length", String(obj.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", cacheControl);
    headers.set("ETag", obj.httpEtag);
    if (opts.downloadAs) {
      headers.set("Content-Disposition", contentDisposition(opts.downloadAs));
    }
    return new Response(body, { headers });
  }

  const head = await storage.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  const size = head.size;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return new Response("Invalid range", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
    });
  }

  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }

  if (start > end || start >= size) {
    return new Response("Range not satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
    });
  }

  const obj = await storage.get(key, {
    range: { offset: start, length: end - start + 1 },
  });
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = safeServingHeaders(obj);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", cacheControl);
  headers.set("ETag", obj.httpEtag);
  if (opts.downloadAs) {
    headers.set("Content-Disposition", contentDisposition(opts.downloadAs));
  }
  return new Response(obj.body, { status: 206, headers });
}
