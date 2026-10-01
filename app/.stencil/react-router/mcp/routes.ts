import { route, type RouteConfigEntry } from "@react-router/dev/routes";

/**
 * The Stencil MCP route pack: the `/mcp` endpoint AI clients call, the two
 * well-known discovery documents, and the consent page an app user sees when
 * authorizing a client. All three stay hidden until `app/mcp.ts` declares a tool.
 *
 * Spread into your routes config alongside the auth pack, with a RELATIVE path
 * — React Router's config loader runs before tsconfig aliases resolve:
 *
 *   import { stencilMcpRoutes } from "./.stencil/react-router/mcp/routes";
 *
 *   export default [
 *     ...stencilAuthRoutes,
 *     ...stencilMcpRoutes,
 *   ] satisfies RouteConfig;
 */
export const stencilMcpRoutes: RouteConfigEntry[] = [
  route("mcp", ".stencil/react-router/mcp/route.ts"),
  route(".well-known/oauth-authorization-server", ".stencil/react-router/mcp/discovery.ts", {
    id: "mcp-oauth-authorization-server",
  }),
  route(".well-known/oauth-protected-resource", ".stencil/react-router/mcp/discovery.ts", {
    id: "mcp-oauth-protected-resource",
  }),
  route("oauth/consent", ".stencil/react-router/mcp/consent.tsx"),
];
