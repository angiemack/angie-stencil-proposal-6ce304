import { createAuth } from "../../auth/utils";
import type { Route } from "./+types/api.auth.$";
import { handleBypass } from "../../auth/bypass";
import { ensureTwoFactorSchema } from "../../auth/ensure-tables";
import { ensureMcpTables } from "../../mcp/ensure-tables";
import { handleDcrThrottle } from "../../mcp/dcr-throttle";

/** Better Auth catch-all for /api/auth/*. */
async function authHandler({
  request,
  context,
}: Route.LoaderArgs | Route.ActionArgs) {
  await ensureTwoFactorSchema(context.cloudflare.env);

  // Apps provisioned before the MCP tables shipped create them on first OAuth
  // traffic; the register/authorize/token endpoints all live under these paths.
  const { pathname } = new URL(request.url);
  if (pathname.includes("/oauth2") || pathname.includes("/mcp")) {
    await ensureMcpTables(context.cloudflare.env);
  }

  const throttled = await handleDcrThrottle(request, context.cloudflare.env);
  if (throttled) return throttled;

  const auth = createAuth(context.cloudflare.env, false, context.cloudflare.ctx, request)

  const bypassResponse = await handleBypass(request, auth, context.cloudflare.env);
  if (bypassResponse) return bypassResponse;

  return auth.handler(request);
}

export const loader = authHandler;
export const action = authHandler;
