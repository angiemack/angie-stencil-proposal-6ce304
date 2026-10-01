import { BACKEND_BASE, createBackendFetch } from "../backend";
import { isDev } from "../context";

/** `user.create.after` handler: fan the new signup out to the platform (drives
 *  Flodesk segment sync) past the signup response — on `waitUntil`, skipped in
 *  dev, errors swallowed so a platform hiccup never turns signup into a 500. */
export function handleSignupFanout(
  env: Env,
  ctx: ExecutionContext | undefined,
  user: { id: string; email: string; name: string; createdAt: Date },
): void {
  // Two different failures, both silent. A local run must never post to the
  // platform even when a backend binding happens to be present; a deploy that
  // lost the binding must not fall through to an unauthenticated plain fetch.
  if (isDev(env) || !env.BACKEND_SERVICE) return;
  const run = sendSignupFanout(env, user).catch((err) =>
    console.error("[signup-fanout] platform signup POST failed:", err),
  );
  if (ctx) ctx.waitUntil(run);
  else void run;
}

/** POST the signup event to the platform's backend service. */
export async function sendSignupFanout(
  env: Env,
  user: { id: string; email: string; name: string; createdAt: Date },
): Promise<void> {
  const res = await createBackendFetch(env)(`${BACKEND_BASE}/users/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    }),
  });
  if (!res.ok) throw new Error(`platform /users/signup returned ${res.status}`);
}
