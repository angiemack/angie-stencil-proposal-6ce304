// The watermark half of `createImage().transform`: the `watermark` option's
// types and request encoding live here. The mark is composited onto the
// picture server-side, so the delivered bytes are already marked.

export interface TransformWatermarkParams {
  /**
   * Storage key of the mark to draw — an object in this app's own storage
   * (the same keys `createStorage()` uses), so the mark is uploaded once and
   * named on every transform rather than re-sent. Max 20 MB.
   */
  key: string;
  /** Where the mark sits on the picture. Default `center`. */
  position?:
    | "center"
    | "top-left"
    | "top"
    | "top-right"
    | "left"
    | "right"
    | "bottom-left"
    | "bottom"
    | "bottom-right";
  /** Mark opacity, 0–1. Default 1 (opaque). */
  opacity?: number;
  /** Mark width as a fraction (0–1] of the delivered width. Default 0.25 — an unscaled mark can cover the whole picture. */
  scale?: number;
  /** Tile the mark across the whole picture; `position` and `margin` are ignored. */
  repeat?: boolean;
  /** Inset in pixels from the edges the mark is anchored to. Default 0. */
  margin?: number;
}

/**
 * Encode the watermark half of a transform request: the options become
 * `watermark*` query params. The mark itself never goes over the wire — the
 * backend reads it from this app's storage by key.
 */
export function appendWatermark(query: URLSearchParams, params: TransformWatermarkParams): void {
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(`watermark${key[0].toUpperCase()}${key.slice(1)}`, String(value));
  }
}
