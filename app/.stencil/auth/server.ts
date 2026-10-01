import { redirect } from "../http";
import { isDraft } from "../context";
import { createAuth } from "./utils";

/** The account the App preview is signed in as. It exists in every app's user table. */
export const PREVIEW_USER_EMAIL = "preview@stencil.local";

/** Whether `user` is the preview user, seen from the App preview. True only on the
 *  draft slot, so an admin or owner gate keyed on it opens in the preview and nowhere
 *  else; prefer it to seeding the preview user into role data the published app reads. */
export function isPreviewUser(user: { email: string }, env: Env): boolean {
  return isDraft(env) && user.email === PREVIEW_USER_EMAIL;
}

/**
 * Get the current session without redirecting. Returns null if unauthenticated.
 *
 * Use this in the root loader to make session data available to useOptionalAuthUser().
 */
export async function getSession(request: Request, env: Env) {
  const auth = createAuth(env, false, undefined, request);
  const result = await auth.api.getSession({ headers: request.headers });
  // The preview user is signed out everywhere but the draft slot, so no gate
  // an app writes for it can open on the published app.
  if (result && !isDraft(env) && result.user.email === PREVIEW_USER_EMAIL) return null;
  return result;
}

/**
 * Confine a caller-supplied redirect target to this app's own origin. The value
 * is resolved by the URL parser and rejected unless it stays same-origin, which
 * catches absolute, protocol-relative (//host) and backslash forms a string test misses.
 */
export function safeReturnTo(
  raw: string | null | undefined,
  fallback = "/app",
): string {
  if (!raw) return fallback;
  const base = "https://app.invalid";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  return url.pathname + url.search + url.hash;
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
