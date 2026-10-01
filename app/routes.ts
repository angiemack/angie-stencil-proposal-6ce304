import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { stencilAuthRoutes } from "./.stencil/react-router/auth/routes";
import { stencilMcpRoutes } from "./.stencil/react-router/mcp/routes";

export default [
  index("routes/home.tsx"),
  // Shared-password gate in front of the letter.
  route("gate", "routes/gate.tsx"),
  route("app", "routes/app.tsx"),
  // Trusted route the platform calls to run recurring actions (bearer-gated).
  // Keep it registered at this path.
  route("api/internal/scheduled", "routes/api.internal.scheduled.tsx"),
  // Trusted route the platform calls after deploy to verify payments is wired
  // up correctly (bearer-gated). Keep it registered.
  route("api/internal/payments-probe", "routes/api.internal.payments-probe.tsx"),
  // Trusted route the platform calls when a Remotion render completes.
  route("api/internal/remotion-complete", "routes/api.internal.remotion-complete.tsx"),
  // Stencil auth route pack. Remove if your app is public-only.
  ...stencilAuthRoutes,
  // Stencil MCP route pack (OAuth discovery + consent + /mcp). Inert until
  // app/mcp.ts declares a tool.
  ...stencilMcpRoutes,
  // Catch-all: redirects dispatcher-owned pages, 404s everything else. Must stay last.
  route("*", ".stencil/react-router/catch-all/route.tsx"),
] satisfies RouteConfig;
