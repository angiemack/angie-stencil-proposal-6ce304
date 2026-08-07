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
  /** The image as a byte stream — pipe straight into R2 with `createStorage().put()`. */
  body: ReadableStream<Uint8Array>;
  /** Image MIME type (e.g. image/png, image/jpeg), from the model's output. */
  contentType: string;
}

/**
 * Generate an image from a text prompt at runtime, proxied through the Stencil
 * backend service (Workers AI). No keys required. Server-side only (loaders /
 * actions / scheduled handlers). Pipe the returned stream into R2 with
 * `createStorage().put()` and keep only the key in D1 — never image bytes.
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
  };
}

export type Image = ReturnType<typeof createImage>;
