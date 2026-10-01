/**
 * Which third-party accounts this app asks its app users to connect.
 *
 * Each entry is one provider an app user connects for themselves — their Google
 * Calendar, their Slack — so the app can act on their behalf. One app user's
 * data is never visible to another. This is not the app owner connecting a
 * single shared account.
 *
 * Empty by default: an app that connects nothing ships this file unchanged.
 *
 * Adding an entry is half the change. The other half is spreading
 * `...stencilConnectionRoutes` (from `./.stencil/react-router/connections/routes`)
 * into `app/routes.ts` — a manifest with no route pack is a broken app, because
 * `requireConnection` then redirects people to a 404.
 *
 * Load the `member-connections` skill before filling this in.
 *
 * @example
 *   const connections: ConnectionManifest = [
 *     {
 *       provider: "google-calendar",
 *       reason: "To show your upcoming meetings alongside your tasks",
 *     },
 *     {
 *       provider: "slack",
 *       reason: "To post your daily summary to a channel you pick",
 *       optional: true,
 *     },
 *   ];
 */
import type { ConnectionManifest } from "~stencil/connections";

const connections: ConnectionManifest = [];

export default connections;
