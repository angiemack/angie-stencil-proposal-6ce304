import { route, type RouteConfigEntry } from "@react-router/dev/routes";

/**
 * The Stencil notifications route pack: the API the bell component reads from
 * and posts read state to.
 *
 * Spread into your routes config, with a RELATIVE path — React Router's
 * config loader runs before tsconfig aliases resolve:
 *
 *   import { stencilNotificationRoutes } from "./.stencil/react-router/notifications/routes";
 *
 *   export default [
 *     index("routes/home.tsx"),
 *     ...stencilNotificationRoutes,
 *   ] satisfies RouteConfig;
 */
export const stencilNotificationRoutes: RouteConfigEntry[] = [
  route("api/notifications/*", ".stencil/react-router/notifications/api.$.tsx"),
];
