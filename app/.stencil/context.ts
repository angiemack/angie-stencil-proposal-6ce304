import type { HandlerArgs } from "./types/context";

/**
 * Whether this is a local dev run.
 *
 * Read from the environment, not the build: `import.meta.env.DEV` is a bundler
 * substitution and the layer cannot assume a bundler. `STENCIL_ENV` is set to
 * "development" by the template's own wrangler.jsonc and stripped at deploy (it
 * is in the deployer's PLATFORM_MANAGED list), so a deployed app leaves it unset
 * and reads as not-dev.
 *
 * Nothing may trust this flag with a value the platform injects. Callers prefer
 * the injected value and fall back only when it is absent, so a stray
 * "development" on a real deploy cannot downgrade a working app.
 */
export function isDev(env: Env): boolean {
  return env.STENCIL_ENV === "development";
}

/** Whether this deploy is the draft slot the App preview shows. `IS_DRAFT` is injected
 *  on every deploy ("true" or "false"); it is absent only in local dev, which counts as draft. */
export function isDraft(env: Env): boolean {
  return env.IS_DRAFT != null ? env.IS_DRAFT === "true" : isDev(env);
}

/**
 * Hono's context, described structurally rather than imported.
 *
 * The template has no Hono dependency and the layer should not gain one for a
 * type. Any object with these three is accepted, which is what a Hono `Context`
 * on Workers is.
 */
type HonoContext = {
  req: { raw: Request };
  env: Env;
  executionCtx: ExecutionContext;
};

/**
 * The `{ request, context }` the platform SDKs take — from a Hono context.
 *
 * This is the same shape React Router hands a loader today, so `requireAuth`,
 * `requireSubscription`, `scheduledAction` and the rest are called identically
 * on either side.
 *
 * @example
 *   app.post("/api/internal/scheduled", (c) =>
 *     scheduledAction(SCHEDULE_HANDLERS)(fromHono(c)),
 *   );
 *
 *   app.get("/app/billing", async (c) => {
 *     const { request, context } = fromHono(c);
 *     await requireSubscription(request, context, tiers.pro.id);
 *   });
 */
export function fromHono(c: HonoContext): HandlerArgs {
  return {
    request: c.req.raw,
    context: { cloudflare: { env: c.env, ctx: c.executionCtx } },
  };
}
