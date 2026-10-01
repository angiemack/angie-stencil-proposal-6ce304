import {
  oAuthDiscoveryMetadata,
  oAuthProtectedResourceMetadata,
} from "better-auth/plugins";
import type { LoaderFunctionArgs } from "react-router";
import { createAuth } from "../../auth/utils";
import { loadMcpManifest } from "../../mcp/app-manifest";

// The two OAuth discovery documents (RFC 8414 and RFC 9728), served from the
// origin root. An AI client fetches them cross-origin before connecting, so the
// document is returned with permissive CORS.
export async function loader({ request, context }: LoaderFunctionArgs) {
  // An app that declares no tools exposes no MCP surface, so it advertises no
  // OAuth either — otherwise a client would discover auth for an endpoint that 404s.
  if (!loadMcpManifest()) throw new Response("Not found", { status: 404 });

  const { env, ctx } = context.cloudflare;
  const auth = createAuth(env, false, ctx, request);

  // The two endpoints are added by the mcp plugin, which auth/utils.ts casts to
  // BetterAuthPlugin (to keep TS4058 out of createAuth's type); that cast drops
  // them from the inferred api, so re-assert the ones these helpers require.
  // Called branched rather than through a union-typed variable — the helpers'
  // generic signatures are incompatible, so the union isn't callable (TS2349).
  const mcpAuth = auth as typeof auth & {
    api: {
      getMcpOAuthConfig: (...args: unknown[]) => unknown;
      getMCPProtectedResource: (...args: unknown[]) => unknown;
    };
  };
  const response = new URL(request.url).pathname.endsWith("oauth-protected-resource")
    ? await oAuthProtectedResourceMetadata(mcpAuth)(request)
    : await oAuthDiscoveryMetadata(mcpAuth)(request);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
}
