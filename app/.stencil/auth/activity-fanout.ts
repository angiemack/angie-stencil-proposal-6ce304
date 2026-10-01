import { BACKEND_BASE, createBackendFetch } from "../backend";
import { isDev } from "../context";

/** `session.create/update.after` handler: report member activity to the platform
 *  past the response — on `waitUntil`, skipped in dev, errors swallowed so a
 *  platform hiccup never breaks a login or a session refresh. Better Auth only
 *  re-saves a session once per updateAge window, so this fires ~once per member
 *  per day; the platform dedupes the remainder. */
export function handleActivityFanout(
  env: Env,
  ctx: ExecutionContext | undefined,
  session: { userId: string },
): void {
  // Two different failures, both silent. A local run must never post to the
  // platform even when a backend binding happens to be present; a deploy that
  // lost the binding must not fall through to an unauthenticated plain fetch.
  if (isDev(env) || !env.BACKEND_SERVICE) return;
  const run = sendActivityFanout(env, session.userId).catch((err) =>
    console.error("[activity-fanout] platform /users/active POST failed:", err),
  );
  if (ctx) ctx.waitUntil(run);
  else void run;
}

/** POST the activity ping to the platform's backend service. */
export async function sendActivityFanout(env: Env, userId: string): Promise<void> {
  const res = await createBackendFetch(env)(`${BACKEND_BASE}/users/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(`platform /users/active returned ${res.status}`);
}
