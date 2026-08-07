import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { stencilAuthRoutes } from "./.stencil/auth";

export default [
  index("routes/home.tsx"),
  route("app", "routes/app.tsx"),
  // Trusted route the platform calls to run recurring actions (bearer-gated).
  // Keep it registered at this path.
  route("api/internal/scheduled", "routes/api.internal.scheduled.tsx"),
  // Trusted route the platform calls after deploy to verify payments is wired
  // up correctly (bearer-gated). Keep it registered.
  route("api/internal/payments-probe", "routes/api.internal.payments-probe.tsx"),
  // Stencil auth route pack. Remove if your app is public-only.
  ...stencilAuthRoutes,
] satisfies RouteConfig;
