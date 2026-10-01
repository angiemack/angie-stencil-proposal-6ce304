import { route, type RouteConfigEntry } from "@react-router/dev/routes";

/**
 * The Stencil connections route pack: `/app/connections` and the API the
 * connect flow posts to.
 *
 * Spread into your routes config, with a RELATIVE path. React Router's config
 * loader runs before tsconfig aliases resolve, so the `~stencil` alias does not
 * work in `routes.ts` even though it works everywhere else:
 *
 *   import { stencilConnectionRoutes } from "./.stencil/react-router/connections/routes";
 *
 *   export default [
 *     index("routes/home.tsx"),
 *     ...stencilConnectionRoutes,
 *   ] satisfies RouteConfig;
 */
export const stencilConnectionRoutes: RouteConfigEntry[] = [
  route("app/connections", ".stencil/react-router/connections/page.tsx"),
  route("api/connections/*", ".stencil/react-router/connections/api.$.tsx"),
];
