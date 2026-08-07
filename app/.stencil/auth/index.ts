import { route, type RouteConfigEntry } from "@react-router/dev/routes";

/**
 * The Stencil auth route pack: /login, /signup, /logout, /api/auth/*.
 *
 * Spread into your routes config:
 *
 *   import { stencilAuthRoutes } from "~stencil/auth";
 *
 *   export default [
 *     index("routes/home.tsx"),
 *     ...stencilAuthRoutes,
 *   ] satisfies RouteConfig;
 */
export const stencilAuthRoutes: RouteConfigEntry[] = [
  route("login", ".stencil/auth/login.tsx"),
  route("signup", ".stencil/auth/signup.tsx"),
  route("logout", ".stencil/auth/logout.tsx"),
  route("api/auth/*", ".stencil/auth/api.auth.$.tsx"),
];
