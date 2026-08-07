import type { Route } from "./+types/api.internal.scheduled";

/**
 * Trusted inbound route for platform-triggered recurring actions.
 *
 * The Stencil platform evaluates each app's schedule on its cron tick and, when
 * one fires, POSTs here through the dispatch namespace with:
 *   - `Authorization: Bearer <SCHEDULE_TRIGGER_SECRET>`  (the injected secret)
 *   - `x-stencil-schedule-name: <name>`                  (which schedule fired)
 *   - `x-stencil-schedule-cron: <expression>`            (its cron, for context)
 *
 * The bearer secret is injected by the platform at deploy time — it is NOT the
 * public internet's to know, so this route rejects any request whose bearer
 * doesn't match `env.SCHEDULE_TRIGGER_SECRET`. That is the only thing standing
 * between "the platform asked me to run this" and "anyone can run this," so the
 * check happens before any work.
 *
 * Delivery is best-effort: a scheduled run can be missed, and a transient dispatch
 * failure (timeout, 5xx) is retried once — so a run can also arrive twice. A 4xx is
 * never retried. Handlers MUST therefore be idempotent (safe to run twice) and
 * should guard against overlap if a run could still be in flight when the next one
 * arrives (e.g. check/stamp a `last_run_at` row before doing work). A run is one
 * normal request and must fit normal limits — no long crawls or multi-minute batch
 * jobs. Every attempt is recorded, and a non-2xx response shows as a failed run in
 * the app's Automations panel.
 */

type ScheduleHandlerArgs = {
  /** The schedule that fired (from `x-stencil-schedule-name`). */
  name: string;
  /** Its cron expression (from `x-stencil-schedule-cron`), for logging/context. */
  cron: string | null;
  env: Env;
  request: Request;
};

/**
 * Map of schedule `name` → handler. Add one entry per recurring action; the
 * `name` must match the `name` in `app/schedules.ts` (the declarative manifest
 * the platform reconciles into its registry). Keep each handler idempotent.
 *
 * Example:
 *
 *   const SCHEDULE_HANDLERS = {
 *     "refresh-events": async ({ env }) => {
 *       const db = createDb(env);
 *       // ...fetch and upsert; upsert (not insert) keeps it idempotent.
 *     },
 *   } satisfies Record<string, (args: ScheduleHandlerArgs) => Promise<void>>;
 */
const SCHEDULE_HANDLERS = {} satisfies Record<
  string,
  (args: ScheduleHandlerArgs) => Promise<void>
>;

/** Constant-time string compare so the bearer check can't be timed byte-by-byte. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;

  // Fail closed: with no configured secret there is nothing to authenticate
  // against, so no caller can be trusted. (In production the platform always
  // injects it; this only trips in local dev without the binding.)
  const expected = env.SCHEDULE_TRIGGER_SECRET;
  if (!expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token || !timingSafeEqual(token, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const name = request.headers.get("x-stencil-schedule-name");
  if (!name) {
    return Response.json({ error: "missing schedule name" }, { status: 400 });
  }

  const handler = (SCHEDULE_HANDLERS as Record<
    string,
    (args: ScheduleHandlerArgs) => Promise<void>
  >)[name];
  if (!handler) {
    return Response.json({ error: `no handler for schedule "${name}"` }, { status: 404 });
  }

  const cron = request.headers.get("x-stencil-schedule-cron");
  try {
    await handler({ name, cron, env, request });
  } catch (err) {
    // Surface the failure (the platform records the non-2xx as a failed run) but
    // never throw past here — one failing action must not take the route down.
    console.error(`scheduled action "${name}" failed:`, err);
    return Response.json({ ok: false, error: "handler failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
