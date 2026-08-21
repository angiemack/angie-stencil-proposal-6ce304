import { createAuth } from "./utils";
import type { Route } from "./+types/api.auth.$";
import { handleBypass } from "./bypass";

/** Better Auth catch-all for /api/auth/*. */
async function authHandler({
  request,
  context,
}: Route.LoaderArgs | Route.ActionArgs) {
  // The dispatcher sets this header from the app's `allowSignup` setting; when
  // off, unknown addresses can't self-register through the passwordless methods.
  const disableSignup = request.headers.get("x-stencil-signup") === "off";
  const auth = createAuth(context.cloudflare.env, disableSignup, context.cloudflare.ctx, request)

  const bypassResponse = await handleBypass(request, auth, context.cloudflare.env);
  if (bypassResponse) return bypassResponse;

  return auth.handler(request);
}

export const loader = authHandler;
export const action = authHandler;
