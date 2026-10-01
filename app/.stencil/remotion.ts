import { BACKEND_BASE, createBackendFetch } from "./backend";

/** A render's lifecycle: queued → rendering → one of succeeded / failed / cancelled. */
export type RemotionStatus = "queued" | "rendering" | "succeeded" | "failed" | "cancelled";

export interface RenderParams {
  /** Which composition to render, by its Remotion `id`. */
  composition: string;
  /** Serializable props passed to the composition. Must be plain JSON — a
   *  composition renders with no request context, so pass everything it needs. */
  props?: Record<string, unknown>;
  /** Binary inputs by name, each an app-storage key or an absolute http(s) URL.
   *  The platform materializes them into the render before the first frame, so
   *  the composition reads them with `staticFile("<name>.<ext>")`. */
  assets?: Record<string, string>;
}

export interface RenderJob {
  /** The job id — poll `status(jobId)`, and store it against your own row. */
  jobId: string;
  status: RemotionStatus;
  /** Rough seconds the render will take, when the platform can estimate it. */
  estimatedSeconds?: number;
}

export interface RenderStatus {
  jobId: string;
  status: RemotionStatus;
  /** Render progress 0–100 while `rendering`, from Remotion's own per-frame count. */
  percent: number | null;
  /** The finished video's R2 key in the app's own storage, once `succeeded`. Serve
   *  it from your own route with range requests (see the `storage` skill). */
  key: string | null;
  /** Billed container seconds, recorded for succeeded, failed and cancelled runs. */
  durationSeconds: number | null;
  /** The failure reason when `failed`. */
  error: string | null;
}

export interface RenderSummary extends RenderStatus {
  composition: string;
  createdAt: string;
}

/**
 * Render video from the app's own Remotion compositions, proxied through the
 * Stencil backend service. No keys required. Server-side only (loaders /
 * actions / scheduled handlers). Renders run on the platform and return an R2
 * key in the app's storage — never bytes — so keep the `jobId` and the finished
 * key in D1 and serve the video from your own route.
 */
export function createRemotion(env: Env) {
  const backendFetch = createBackendFetch(env);

  return {
    /** Enqueue a render and return immediately with a `jobId` to poll. */
    async render(params: RenderParams): Promise<RenderJob> {
      const res = await backendFetch(`${BACKEND_BASE}/remotion/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Which of the app's stored bundles to render. The preview and the live
        // app are separate deploys of separate code, so each renders its own —
        // otherwise a preview would render whatever production last published.
        body: JSON.stringify({ ...params, draft: env.IS_DRAFT === "true" }),
      });
      if (!res.ok) throw new Error(`Render failed: ${await res.text()}`);
      return res.json() as Promise<RenderJob>;
    },

    /** The current state of one render. Always available, whether or not the
     *  completion webhook is wired — polling is the primary path. */
    async status(jobId: string): Promise<RenderStatus> {
      const res = await backendFetch(
        `${BACKEND_BASE}/remotion/status/${encodeURIComponent(jobId)}`,
      );
      if (!res.ok) throw new Error(`Render status failed: ${await res.text()}`);
      return res.json() as Promise<RenderStatus>;
    },

    /** Cancel a render. Kills a running container (and still bills its partial
     *  time); a still-queued job is just marked cancelled. */
    async cancel(jobId: string): Promise<{ ok: boolean; status: RemotionStatus }> {
      const res = await backendFetch(`${BACKEND_BASE}/remotion/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) throw new Error(`Render cancel failed: ${await res.text()}`);
      return res.json() as Promise<{ ok: boolean; status: RemotionStatus }>;
    },

    /** This app's recent renders, newest first (default 50, max 100). */
    async list(limit?: number): Promise<RenderSummary[]> {
      const query = typeof limit === "number" ? `?limit=${limit}` : "";
      const res = await backendFetch(`${BACKEND_BASE}/remotion/list${query}`);
      if (!res.ok) throw new Error(`Render list failed: ${await res.text()}`);
      const body = (await res.json()) as { renders: RenderSummary[] };
      return body.renders;
    },
  };
}

export type Remotion = ReturnType<typeof createRemotion>;
