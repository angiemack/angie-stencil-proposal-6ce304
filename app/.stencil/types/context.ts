/**
 * What a request handler receives, independent of the framework routing it.
 *
 * React Router's Cloudflare preset produces this shape already, so a loader can
 * pass its own `context` straight to a platform SDK typed against `AppContext`.
 * It is not React Router's to own, though — any adapter can build it in a line:
 *
 *   app.post("/api/internal/scheduled", (c) =>
 *     scheduledAction(HANDLERS)({
 *       request: c.req.raw,
 *       context: { cloudflare: { env: c.env, ctx: c.executionCtx } },
 *     }),
 *   );
 *
 * Keeping it is what lets the platform SDKs hold their signatures across a
 * framework change: `requireSubscription(request, context)` means the same thing
 * on both sides, so app code calling it does not move.
 */
export interface AppContext {
  cloudflare: {
    env: Env;
    ctx: ExecutionContext;
  };
}

/**
 * A handler's arguments. Deliberately not named for React Router's route-module
 * vocabulary — "loader" and "action" are that framework's words, and this shape
 * outlives them.
 */
export interface HandlerArgs {
  request: Request;
  context: AppContext;
}
