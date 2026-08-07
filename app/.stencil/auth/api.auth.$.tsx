import { createAuth } from "./utils";
import type { Route } from "./+types/api.auth.$";
import { handleBypass } from "./bypass";

/** Better Auth catch-all for /api/auth/*. */
async function authHandler({
  request,
  context,
}: Route.LoaderArgs | Route.ActionArgs) {
  const auth = createAuth(context.cloudflare.env)
  
  const bypassResponse = await handleBypass(request, auth, context.cloudflare.env);
  if (bypassResponse) return bypassResponse;

  return auth.handler(request);
}

export const loader = authHandler;
export const action = authHandler;
