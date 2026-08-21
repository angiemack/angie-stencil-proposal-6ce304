import { BACKEND_BASE, createBackendFetch } from "./backend";

export interface GenerateImageParams {
  /** What to draw. Required. */
  prompt: string;
  /**
   * The Cloudflare Workers AI text-to-image model id, e.g.
   * `@cf/black-forest-labs/flux-1-schnell` (the default) or
   * `@cf/stabilityai/stable-diffusion-xl-base-1.0`. Any Workers AI image model
   * is accepted — see the runtime-image skill for recommendations.
   */
  model?: string;
}

export interface GeneratedImage {
  /** The image as a byte stream — pass straight to `createStorage().put(key, body)`;
   *  the response is known-length, so R2 accepts the stream directly. */
  body: ReadableStream<Uint8Array>;
  /** Image MIME type (e.g. image/png, image/jpeg), from the model's output. */
  contentType: string;
}

export interface TransformImageParams {
  /** Target width in pixels. Omit one dimension to scale by the other. */
  width?: number;
  /** Target height in pixels. */
  height?: number;
  /** How the image fills the target box. Default `scale-down`. */
  fit?: "scale-down" | "contain" | "pad" | "squeeze" | "cover" | "crop";
  /** Right-angle rotation applied before resizing. */
  rotate?: 90 | 180 | 270;
  /** Output format. Default `image/webp`. */
  format?: "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif";
  /** Output quality 1–100 for lossy formats. */
  quality?: number;
}

/**
 * Generate an image from a text prompt at runtime, proxied through the Stencil
 * backend service (Workers AI). No keys required. Server-side only (loaders /
 * actions / scheduled handlers). Pass the returned `body` straight to
 * `createStorage().put(key, body)` and keep only the key in D1 — never image bytes.
 */
export function createImage(env: Env) {
  const backendFetch = createBackendFetch(env);

  return {
    async generate(params: GenerateImageParams): Promise<GeneratedImage> {
      const res = await backendFetch(`${BACKEND_BASE}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`Image generation failed: ${await res.text()}`);
      if (!res.body) throw new Error("Image generation returned an empty response");
      const contentType = res.headers.get("Content-Type") ?? "image/png";
      return { body: res.body as ReadableStream<Uint8Array>, contentType };
    },

    /**
     * Resize / crop / convert an existing image at runtime via the Cloudflare
     * Images binding — the worker-compatible path (Sharp and other native
     * codecs can't run on Workers). Pass the source bytes (an uploaded `File`,
     * or bytes read from R2); pass the returned `body` straight to
     * `createStorage().put(key, body)` and keep only the key in D1.
     */
    async transform(
      source: Blob | ArrayBuffer | Uint8Array,
      params: TransformImageParams = {},
    ): Promise<GeneratedImage> {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) query.set(key, String(value));
      }
      const res = await backendFetch(`${BACKEND_BASE}/image/transform?${query.toString()}`, {
        method: "POST",
        // The current TS lib's generic Uint8Array<ArrayBufferLike> no longer widens to BodyInit - requires casting.
        body: source as BodyInit,
      });
      if (!res.ok) throw new Error(`Image transform failed: ${await res.text()}`);
      if (!res.body) throw new Error("Image transform returned an empty response");
      const contentType = res.headers.get("Content-Type") ?? "image/webp";
      return { body: res.body as ReadableStream<Uint8Array>, contentType };
    },
  };
}

export type Image = ReturnType<typeof createImage>;
