import { redirect } from "react-router";
import { createConnections, type ConnectionStatus } from "./index";

/**
 * Require that this member has connected a provider, or send them to connect it.
 *
 * Shaped like `requireAuth` on purpose: the platform guarantees the destination,
 * and your app decides where the entry points are.
 *
 *   export async function loader({ request, context }: Route.LoaderArgs) {
 *     const { user } = await requireAuth(request, context.cloudflare.env);
 *     await requireConnection(request, context.cloudflare.env, user.id, "google-calendar");
 *     ...
 *   }
 *
 * The redirect target is `/app/connections`, which comes from
 * `stencilConnectionRoutes`. If you have a manifest and have not spread that
 * pack into `app/routes.ts`, this redirects to a 404. Add both together.
 */
export async function requireConnection(
  request: Request,
  env: Env,
  memberId: string,
  provider: string,
): Promise<{ status: ConnectionStatus }> {
  const status = await createConnections(env).as(memberId).status(provider);

  if (status !== "connected") {
    const url = new URL(request.url);
    const returnTo = url.pathname + url.search;
    throw redirect(
      `/app/connections?needed=${encodeURIComponent(provider)}` +
        `&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  return { status };
}

/**
 * The same question without the redirect, for a page that degrades rather than
 * blocks. This is what an `optional: true` manifest entry is for.
 */
export async function getConnectionStatus(
  env: Env,
  memberId: string,
  provider: string,
): Promise<ConnectionStatus> {
  return createConnections(env).as(memberId).status(provider);
}
