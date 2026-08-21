/**
 * Minting the handoff that vouches for a member (PRD-180, TDD-424).
 *
 * The member has no Stencil session and never will. The only party that can say
 * "this is my member, and this is their id" is this app, and it says so by
 * signing a short-lived token with its own per-app key.
 *
 * That key already identifies this app to the platform: it is minted per app and
 * resolves back to an `appId` on the other side. So an app cannot mint a handoff
 * naming a different app, because it does not hold that app's key.
 *
 * **120 seconds, and it must stay there.** The key rotates on every deploy, so a
 * handoff minted just before one and presented just after cannot verify. At two
 * minutes that is a rare retryable click. Lengthening the window to paper over
 * it widens exactly the credential that must never sign anything long-lived.
 */

const HANDOFF_TTL_SECONDS = 120;

export interface HandoffPayload {
  appId: string;
  memberId: string;
  provider: string;
  returnUrl: string;
}

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * HS256 over the raw UTF-8 secret, matching `verifyJwt` in `@shared/token`
 * exactly. Takes the secret rather than `Env` so the platform side can import
 * this module and prove the two agree; a mismatch here is invisible until a real
 * member tries to connect.
 */
export async function signHandoff(
  secret: string,
  payload: HandoffPayload,
): Promise<string> {
  if (!secret) {
    throw new Error(
      "This app has no BACKEND_SERVICE_API_KEY, so it cannot vouch for its " +
        "members. Publish the app once and the key is set at deploy.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();

  const header = base64Url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })).buffer as ArrayBuffer,
  );
  const body = base64Url(
    encoder.encode(
      JSON.stringify({ ...payload, iat: now, exp: now + HANDOFF_TTL_SECONDS }),
    ).buffer as ArrayBuffer,
  );

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${body}`),
  );

  return `${header}.${body}.${base64Url(signature)}`;
}
