import { redirect } from "react-router";
import { createAuth } from "./utils";
import type { Route } from "./+types/logout";

/**
 * GET /logout — invalidate the Better Auth session (DB delete + clear cookie)
 * and redirect to "/". Replays the request as a POST to Better Auth's own
 * sign-out endpoint and forwards the resulting Set-Cookie headers through.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const auth = createAuth(context.cloudflare.env, false, undefined, request);

  const signOutReq = new Request(new URL("/api/auth/sign-out", request.url), {
    method: "POST",
    headers: request.headers,
  });
  const res = await auth.handler(signOutReq);

  const headers = new Headers();
  for (const cookie of res.headers.getSetCookie())
    headers.append("set-cookie", cookie);

  return redirect("/", { headers });
}
