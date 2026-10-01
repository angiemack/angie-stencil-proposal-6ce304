import type { BetterAuthOptions } from "better-auth";
import appHooks from "~/auth-hooks.server";

/** Better Auth's native database-hook map: user/session/account/verification,
 *  each with create/update and before/after. */
export type DatabaseHooks = NonNullable<BetterAuthOptions["databaseHooks"]>;

/** What an app default-exports from `app/auth-hooks.server.ts`. The factory form
 *  gets the worker `env` for bindings/secrets — the usual case, since hooks exist
 *  to call out with a stored key; a plain object works when `env` is unused. */
export type AuthHooks = DatabaseHooks | ((env: Env) => DatabaseHooks);

/** The app's optional hooks, factory resolved against `env`.
 *
 *  A plain static import: `app/auth-hooks.server.ts` always exists (the template
 *  ships it exporting `{}`), so an app that reacts to nothing costs nothing here.
 *  It cannot be a dynamic import — Rollup fails the build on a specifier it
 *  cannot resolve rather than deferring to runtime, which is why this used to
 *  need `import.meta.glob`. Shipping the file removes the need for either. */
function loadAppHooks(env: Env): DatabaseHooks | undefined {
  if (!appHooks) return undefined;
  return typeof appHooks === "function" ? appHooks(env) : appHooks;
}

type Hook = (data: unknown, ctx: unknown) => unknown;

/** Chain two hooks that land on the same leaf so both run, platform first. An
 *  `after` leaf is observe-only; a `before` leaf threads each hook's returned data
 *  into the next, and either hook returning `false` aborts the operation. */
function chainHooks(timing: string, platform: Hook, app: Hook): Hook {
  if (timing !== "before") {
    return async (data, ctx) => {
      await platform(data, ctx);
      await app(data, ctx);
    };
  }
  return async (data, ctx) => {
    const first = await platform(data, ctx);
    if (first === false) return false;
    const threaded =
      first && typeof first === "object" && "data" in first ? (first as { data: unknown }).data : data;
    const second = await app(threaded, ctx);
    if (second === false) return false;
    return second ?? { data: threaded };
  };
}

/** Deep-merge the app's hook map over the platform's. A branch only one side has
 *  passes through untouched; where both define the same leaf hook, chainHooks runs
 *  both; branches both sides share recurse. */
function mergeHooks(platform: DatabaseHooks, app: DatabaseHooks): DatabaseHooks {
  const merged = { ...platform } as Record<string, unknown>;
  for (const [key, appNode] of Object.entries(app)) {
    const platformNode = merged[key];
    if (typeof platformNode === "function" && typeof appNode === "function") {
      merged[key] = chainHooks(key, platformNode as Hook, appNode as Hook);
    } else if (platformNode && typeof platformNode === "object" && appNode && typeof appNode === "object") {
      merged[key] = mergeHooks(platformNode as DatabaseHooks, appNode as DatabaseHooks);
    } else {
      merged[key] = appNode;
    }
  }
  return merged as DatabaseHooks;
}

/** The `databaseHooks` for this app: the app's optional `auth-hooks.server.ts`
 *  merged over `platformHooks` (ours — empty until we add some), colliding leaves
 *  composed so both run, platform first. Empty on both sides yields `{}`. */
export function withConsumerHooks(env: Env, platformHooks: DatabaseHooks = {}): DatabaseHooks {
  const appHooks = loadAppHooks(env);
  return appHooks ? mergeHooks(platformHooks, appHooks) : platformHooks;
}
