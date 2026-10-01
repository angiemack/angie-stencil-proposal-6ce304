/**
 * Pages the Stencil dispatcher serves itself, before a request reaches the app.
 *
 * Framework-agnostic on purpose. These are a platform fact, not a routing
 * choice, and every adapter needs the same list for the same reason: a
 * client-side router must not swallow them. A full-page navigation hands the
 * path back to the dispatcher, which owns it.
 *
 * Only the ones an app can plausibly LINK TO. Plenty of other paths are
 * dispatcher-served and absent here on purpose:
 *   - `/api/*`, `/assets/`, `/theme.css`, `/themes/`, `/robots.txt`,
 *     `/.well-known/*` — the browser fetches these directly, never through a
 *     router.
 *   - `/auth/done`, `/oauth/authorize`, `/oauth/callback` — these arrive as
 *     top-level navigations from somewhere else (an auth redirect, an OAuth
 *     provider, an MCP client), so the dispatcher answers them before the app's
 *     JavaScript ever runs. A passthrough for them would be dead code.
 *
 * Keeping the list here means adding a platform page later is one edit rather
 * than one per adapter — exactly the kind of thing that silently goes out of
 * step.
 */

export const DISPATCHER_PAGE_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

/** Whether this path belongs to the dispatcher rather than to the app. */
export function isDispatcherPage(pathname: string): boolean {
  return (DISPATCHER_PAGE_PATHS as readonly string[]).includes(pathname);
}
