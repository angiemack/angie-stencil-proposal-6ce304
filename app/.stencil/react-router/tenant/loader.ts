import { getTenant } from "../../tenant";

/** Loader factory that resolves the request's tenant once, for `useTenant()`.
 *  Compose it the way `withStrings` composes:
 *  `export const loader = withStrings(withTenant<Route.LoaderArgs>())` */
export function withTenant<
  TArgs extends { request: Request; context: { cloudflare: { env: Env } } },
>(loader?: (args: TArgs) => Record<string, unknown> | Promise<Record<string, unknown>>) {
  return async (args: TArgs) => ({
    ...(loader ? await loader(args) : {}),
    tenant: await getTenant(args.request, args.context.cloudflare.env),
  });
}
