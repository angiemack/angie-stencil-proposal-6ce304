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
          return (options?: R2ListOptions) =>
            value.call(target, {
              ...options,
              prefix: `${prefix}${options?.prefix ?? ""}`,
            });
        default:
          return value.bind(target);
      }
    },
  });
}

/**
 * Serve an R2 object as an HTTP response, honoring the request's `Range`
 * header with a `206 Partial Content` reply. Required for <video>/<audio>
 * seeking of large media. `storage` should be the `createStorage(env)` client
 * so the key is scoped automatically.
 */
export async function serveR2Object(
  storage: R2Bucket,
  key: string,
  request: Request,
  opts: { cacheControl?: string } = {},
): Promise<Response> {
  const cacheControl =
    opts.cacheControl ?? "public, max-age=31536000, immutable";
  const rangeHeader = request.headers.get("Range");

  if (!rangeHeader) {
    const obj = await storage.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set(
      "Content-Type",
      obj.httpMetadata?.contentType ?? "application/octet-stream",
    );
    headers.set("Content-Length", String(obj.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", cacheControl);
    headers.set("ETag", obj.httpEtag);
    return new Response(obj.body, { headers });
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

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType ?? "application/octet-stream",
  );
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", cacheControl);
  headers.set("ETag", obj.httpEtag);
  return new Response(obj.body, { status: 206, headers });
}
