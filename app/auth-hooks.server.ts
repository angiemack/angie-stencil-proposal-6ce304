/**
 * React to auth events — a new signup, a profile change, a session starting.
 *
 * These are Better Auth's `databaseHooks`, so they run inside the auth write
 * itself: `user`, `session`, `account` and `verification`, each with `create`
 * and `update`, each with `before` and `after`.
 *
 * - `after` is observe-only. Use it to do something because the write happened.
 * - `before` can reshape the row, or return `false` to abort the write entirely.
 *
 * The platform composes its own hooks with yours and runs both, platform first.
 *
 * Empty by default: an app that reacts to nothing ships this file unchanged.
 * Export a plain object if you don't need `env`, or the factory form below if
 * you do — which is the usual case, since a hook normally calls out with a key.
 *
 * @example
 *   export default (env: Env) => ({
 *     user: {
 *       create: {
 *         after: async (user) => {
 *           await createEmail(env).send({
 *             to: user.email,
 *             subject: "Welcome",
 *             text: `Thanks for signing up, ${user.name}.`,
 *           });
 *         },
 *       },
 *     },
 *   });
 */
import type { AuthHooks } from "~stencil/auth/hooks";

const hooks: AuthHooks = {};

export default hooks;
