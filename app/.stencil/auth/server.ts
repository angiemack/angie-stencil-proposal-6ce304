import { redirect } from "react-router";
import { createAuth } from "./utils";

/**
 * Get the current session without redirecting. Returns null if unauthenticated.
 *
 * Use this in the root loader to make session data available to useOptionalAuthUser().
 */
export async function getSession(request: Request, env: Env) {
  const auth = createAuth(env);
  return await auth.api.getSession({ headers: request.headers });
}

/**
 * Require an authenticated session. Redirects to /login if unauthenticated.
 *
 * Usage in any route loader:
 *   const { user, session } = await requireAuth(request, context.cloudflare.env);
 */
export async function requireAuth(request: Request, env: Env) {
  const result = await getSession(request, env);
  if (!result) {
    const url = new URL(request.url);
    const returnTo = url.pathname + url.search;
    throw redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return result;
}
