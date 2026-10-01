declare module "react-router" {
  interface AppLoadContext {
    /** Platform strings loaded before React Router renders — powers <Text> components. */
    strings: Record<string, unknown>;
  }
}

/** Loader factory that injects platform strings into loader data.
 *  Optionally compose with additional loader logic:
 *  `export const loader = withStrings<Route.LoaderArgs>(({ context }) => ({ user: ... }))` */
export function withStrings<TArgs extends { context: { strings: Record<string, unknown> } }>(
  loader?: (args: TArgs) => Record<string, unknown> | Promise<Record<string, unknown>>,
) {
  return async (args: TArgs) => ({
    ...(loader ? await loader(args) : {}),
    strings: args.context.strings,
  });
}
