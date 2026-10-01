import { BACKEND_BASE, createBackendFetch } from "./backend";
import { appendWatermark, type TransformWatermarkParams } from "./watermark";

export type { TransformWatermarkParams } from "./watermark";

export interface GenerateImageParams {
  /** What to draw. Required. */
  prompt: string;
  /**
   * Which text-to-image model to use. Defaults to Cloudflare Workers AI
   * `@cf/black-forest-labs/flux-1-schnell`; any Workers AI image model id is
   * accepted. OpenAI's `gpt-image-1` and Google's `gemini-3.1-flash-image` are
   * also available but cost more — reach for them only when the app builder
   * specifically asks. See the runtime-image skill.
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
  /**
   * Draw a mark over the picture server-side, so the returned bytes are already
   * composited — the clean source never reaches the visitor. A client-side
   * overlay is decoration, not protection. The mark is named by its storage
   * key, not sent with the request. Options in `./watermark`.
   */
  watermark?: TransformWatermarkParams;
}

export interface PdfPreviewParams {
  /** Which page to render, 1-based. Default 1. */
  page?: number;
  /** Rendered width in px (max 2000); height follows the page's aspect ratio. Default 1000. */
  width?: number;
  /** Output format. Default `image/webp`. */
  format?: "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif";
}

export interface PdfPreview extends GeneratedImage {
  /** Total pages in the document — useful for a "1 of 12" caption. */
  pageCount: number | null;
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
     * Resize / crop / convert / watermark an existing image at runtime via the
     * Cloudflare Images binding — the worker-compatible path (Sharp and other
     * native codecs can't run on Workers). Pass the source bytes (an uploaded
     * `File`, or bytes read from R2); pass the returned `body` straight to
     * `createStorage().put(key, body)` and keep only the key in D1.
     */
    async transform(
      /** The image bytes. Max 20 MB — a larger source is rejected with a 413. */
      source: Blob | ArrayBuffer | Uint8Array,
      params: TransformImageParams = {},
    ): Promise<GeneratedImage> {
      const { watermark, ...options } = params;
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) query.set(key, String(value));
      }
      if (watermark) appendWatermark(query, watermark);
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

    /**
     * Render one page of a PDF to an image — a first-page thumbnail for an
     * uploaded document, say. Cloudflare Images cannot read a PDF, so this goes
     * through the platform's PDF renderer rather than `transform`.
     *
     * Do this **once, when the file is uploaded**, and store the result beside
     * the PDF; never re-render on every page view. Pass the returned `body`
     * straight to `createStorage().put(key, body)` and keep only the key in D1.
     *
     * Throws with the reason when the PDF cannot be read — a password-protected
     * file says so, which is worth showing the person who uploaded it.
     */
    async fromPdf(
      source: Blob | ArrayBuffer | Uint8Array,
      params: PdfPreviewParams = {},
    ): Promise<PdfPreview> {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) query.set(key, String(value));
      }
      const res = await backendFetch(`${BACKEND_BASE}/pdf/render?${query.toString()}`, {
        method: "POST",
        // The current TS lib's generic Uint8Array<ArrayBufferLike> no longer widens to BodyInit - requires casting.
        body: source as BodyInit,
      });
      if (!res.ok) {
        let reason = await res.text();
        try {
          reason = (JSON.parse(reason) as { error?: string }).error ?? reason;
        } catch {
          // Not JSON — use the raw body.
        }
        throw new Error(`PDF preview failed: ${reason}`);
      }
      if (!res.body) throw new Error("PDF preview returned an empty response");
      const pageCount = Number(res.headers.get("X-Page-Count"));
      return {
        body: res.body as ReadableStream<Uint8Array>,
        contentType: res.headers.get("Content-Type") ?? "image/webp",
        pageCount: Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null,
      };
    },
  };
}

export type Image = ReturnType<typeof createImage>;
