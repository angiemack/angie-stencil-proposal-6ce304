import type { HandlerArgs } from "./types/context";

/** Constant-time string compare so a bearer check can't be timed byte-by-byte. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

/**
 * Authenticate a platform-internal request. The platform injects
 * `SCHEDULE_TRIGGER_SECRET` at deploy time and presents it as a bearer on the
 * routes it calls directly (schedules, probes, render-complete). Returns a 401
 * Response to return as-is when the caller isn't the platform, or null when the
 * request is trusted. Fails closed when the secret is unset (local dev without
 * the binding), so an unconfigured route trusts no one.
 */
export function verifyPlatformBearer(request: Request, env: Env): Response | null {
  const expected = env.SCHEDULE_TRIGGER_SECRET;
  if (!expected) return Response.json({ error: "unauthorized" }, { status: 401 });
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token || !timingSafeEqual(token, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** What a schedule handler receives when its schedule fires. */
export type ScheduleHandlerArgs = {
  /** The schedule that fired (from `x-stencil-schedule-name`). */
  name: string;
  /** Its cron expression (from `x-stencil-schedule-cron`), for logging/context. */
  cron: string | null;
  env: Env;
  request: Request;
};

/**
 * Wrap a map of schedule handlers (keyed by schedule `name`) as the trusted
 * scheduled route's action: it acks 202 as soon as the schedule matches a handler
 * and runs the handler in the background — the platform is only the trigger and
 * never learns the result. A failure is logged as `[schedule:<name>] failed`.
 */
export function scheduledAction(
  handlers: Record<string, (args: ScheduleHandlerArgs) => Promise<void>>,
) {
  return async ({ request, context }: HandlerArgs) => {
    const env = context.cloudflare.env;

    const unauthorized = verifyPlatformBearer(request, env);
    if (unauthorized) return unauthorized;

    const name = request.headers.get("x-stencil-schedule-name");
    if (!name) {
      return Response.json({ error: "missing schedule name" }, { status: 400 });
    }

    const handler = handlers[name];
    if (!handler) {
      return Response.json({ error: `no handler for schedule "${name}"` }, { status: 404 });
    }

    const cron = request.headers.get("x-stencil-schedule-cron");
    context.cloudflare.ctx.waitUntil(
      handler({ name, cron, env, request }).catch((err) =>
        console.error(
          `[schedule:${name}] failed`,
          err instanceof Error ? (err.stack ?? err.message) : err,
        ),
      ),
    );

    return Response.json({ accepted: true, name }, { status: 202 });
  };
}

/** The body the platform POSTs when a video render reaches a terminal state. */
export type RemotionCompletePayload = {
  /** The render's job id, as returned by `createRemotion(env).render()`. */
  jobId: string;
  status: "succeeded" | "failed" | "cancelled";
  /** The finished video's R2 key in this app's storage. Present when `succeeded`. */
  key?: string;
  /** Billed container seconds for the run. */
  durationSeconds?: number;
  /** The failure reason when `failed`. */
  error?: string;
};

/**
 * Wrap an app callback as a trusted platform-internal POST receiver: it runs the
 * platform side (bearer check, JSON parse, retry contract) and hands the callback
 * the parsed payload. Reuse for any platform→app internal route.
 */
export function internalAction<T>(
  handle: (payload: T, env: Env) => Promise<void> | void,
) {
  return async ({ request, context }: HandlerArgs) => {
    const env = context.cloudflare.env;

    const unauthorized = verifyPlatformBearer(request, env);
    if (unauthorized) return unauthorized;

    const payload = (await request.json().catch(() => null)) as T | null;
    if (payload == null) {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    try {
      await handle(payload, env);
    } catch (err) {
      // Surface a 500 so the platform retries, instead of throwing past here.
      console.error("internal route handler failed:", err);
      return Response.json({ ok: false, error: "handler failed" }, { status: 500 });
    }

    return Response.json({ ok: true });
  };
}
