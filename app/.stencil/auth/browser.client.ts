import { createAuthClient } from "better-auth/react";
import { genericOAuthClient, twoFactorClient } from "better-auth/client/plugins";

const client = createAuthClient({
  plugins: [
    genericOAuthClient(),
    // An enrolled app user's sign-in answers with twoFactorRedirect instead of a
    // session; the stock challenge page finishes it and returns them here.
    twoFactorClient({
      onTwoFactorRedirect() {
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = `/auth/two-factor?returnTo=${encodeURIComponent(returnTo)}`;
      },
    }),
  ],
});

// Only expose action methods. Do NOT use client hooks (useSession etc.) —
// read auth state from loaders via requireAuth / getSession instead.
export const { signIn, signOut, changeEmail } = client;

// Google won't render inside a frame (the App preview is one), so the authorize URL opens
// in a popup and /auth/done posts the outcome back. Resolves with an error code to show,
// or null once the browser is navigating to callbackURL.
export async function signInWithGoogle({
  callbackURL = "/",
}: { callbackURL?: string } = {}): Promise<{ error: string | null }> {
  const { data, error } = await signIn.oauth2({
    providerId: "stencil",
    callbackURL: "/auth/done",
    errorCallbackURL: "/auth/done",
    disableRedirect: true,
  });
  if (error || !data?.url) return { error: error?.code ?? "start_failed" };

  const authorizeUrl = new URL(data.url, window.location.origin);
  authorizeUrl.searchParams.set("provider", "google");
  const w = 500;
  const h = 600;
  const left = window.screenX + (window.outerWidth - w) / 2;
  const top = window.screenY + (window.outerHeight - h) / 2;
  const popup = window.open(
    authorizeUrl.toString(),
    "google-auth",
    `width=${w},height=${h},left=${left},top=${top}`,
  );
  if (!popup) return { error: "popup_blocked" };

  return new Promise((resolve) => {
    const finish = (code: string | null) => {
      window.removeEventListener("message", onMessage);
      clearInterval(closedCheck);
      if (!popup.closed) popup.close();
      resolve({ error: code });
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (type === "auth-complete") {
        window.location.href = callbackURL;
        finish(null);
      } else if (type === "auth-error") {
        finish(String(event.data.error ?? "unknown"));
      }
    };
    window.addEventListener("message", onMessage);
    const closedCheck = setInterval(() => {
      if (popup.closed) finish("cancelled");
    }, 500);
  });
}
