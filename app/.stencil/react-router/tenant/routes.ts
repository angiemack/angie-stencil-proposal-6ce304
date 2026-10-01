import { route, type RouteConfigEntry } from "@react-router/dev/routes";

/**
 * The Stencil app-user subdomain route pack: the API `<SubdomainField />`
 * checks words against and saves through.
 *
 * Spread into your routes config, with a RELATIVE path — React Router's
 * config loader runs before tsconfig aliases resolve:
 *
 *   import { stencilTenantRoutes } from "./.stencil/react-router/tenant/routes";
 *
 *   export default [
 *     index("routes/home.tsx"),
 *     ...stencilTenantRoutes,
 *   ] satisfies RouteConfig;
 */
export const stencilTenantRoutes: RouteConfigEntry[] = [
  route("api/subdomain/*", ".stencil/react-router/tenant/api.$.tsx"),
];
