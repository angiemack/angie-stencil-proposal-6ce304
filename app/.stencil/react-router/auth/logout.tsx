import { redirect } from "react-router";
import { getSession } from "../../auth/server";
import { createAuth } from "../../auth/utils";
import { SignOutButton } from "../../ui/auth/sign-out-button";
import type { Route } from "./+types/logout";

/**
 * /logout — the session ends only on POST. A GET (history traversal, link
 * prefetch) never signs anyone out: it shows a confirm form when signed in
 * and redirects to "/" when not.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const auth = createAuth(context.cloudflare.env, false, undefined, request);

  // Replay as a POST to Better Auth's own sign-out endpoint (DB delete +
  // clear cookie); the body headers are dropped since the replay has no body.
  const headers = new Headers(request.headers);
  headers.delete("content-type");
  headers.delete("content-length");
  const signOutReq = new Request(new URL("/api/auth/sign-out", request.url), {
    method: "POST",
    headers,
  });
  const res = await auth.handler(signOutReq);

  const outHeaders = new Headers();
  for (const cookie of res.headers.getSetCookie())
    outHeaders.append("set-cookie", cookie);

  return redirect("/", { headers: outHeaders });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await getSession(request, context.cloudflare.env);
  if (!session) throw redirect("/");
  return null;
}

export default function Logout() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-medium">Sign out?</h1>
        <div className="mt-4 flex items-center justify-center gap-4">
          <SignOutButton className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" />
          <a href="/" className="text-sm text-muted-foreground hover:underline">
            Cancel
          </a>
        </div>
      </div>
    </div>
  );
}
