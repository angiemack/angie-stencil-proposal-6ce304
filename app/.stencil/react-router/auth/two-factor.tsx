import { Form, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getSession, safeReturnTo } from "../../auth/server";
import { createAuth } from "../../auth/utils";
import { forwardCookies, postToAuth } from "../../auth/two-factor";

/** /auth/two-factor — the second step of signing in for an enrolled app user. The
 *  first factor already succeeded and left a short-lived challenge cookie; this
 *  page trades a valid code for the real session. */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  if (await getSession(request, context.cloudflare.env)) throw redirect(returnTo);
  return { returnTo };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  const returnTo = safeReturnTo(String(form.get("returnTo") ?? ""));
  const auth = createAuth(context.cloudflare.env, false, undefined, request);

  // Six digits is an authenticator code; anything else is one of the backup codes.
  const path = /^\d{6}$/.test(code) ? "/two-factor/verify-totp" : "/two-factor/verify-backup-code";
  const res = await postToAuth(auth, request, path, { code });
  if (res.ok) return redirect(returnTo, { headers: forwardCookies(res) });

  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  const expired = body?.code === "INVALID_TWO_FACTOR_COOKIE";
  return data(
    {
      error: expired
        ? "This sign-in has expired. Please start again."
        : "That code didn't work. Check your authenticator app and try again.",
      expired,
    },
    { status: expired ? 401 : 400 },
  );
}

export default function TwoFactorChallenge() {
  const { returnTo } = useLoaderData() as { returnTo: string };
  const result = useActionData() as { error: string; expired: boolean } | undefined;
  const busy = useNavigation().state !== "idle";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Form method="post" className="w-full max-w-sm">
        <h1 className="text-2xl font-medium">Two-factor authentication</h1>
        <p className="mt-2 text-muted-foreground">
          Enter the code from your authenticator app, or one of your backup codes.
        </p>
        <input type="hidden" name="returnTo" value={returnTo} />
        <label htmlFor="code" className="mt-6 block text-sm font-medium">
          Code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-center text-lg tracking-widest"
        />
        {result?.error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {result.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <a href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="hover:underline">
            Start over
          </a>
        </p>
      </Form>
    </main>
  );
}
