import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString, symmetricEncrypt } from "better-auth/crypto";
import type { createAuth } from "./utils";

/** The stock challenge page the auth route pack serves. */
export const TWO_FACTOR_CHALLENGE_PATH = "/auth/two-factor";

/** How long an app user has to enter a code after the first factor succeeds. */
const CHALLENGE_MAX_AGE = 600;

/** Better Auth's twoFactor plugin only challenges password sign-in. These are
 *  the passwordless paths that also mint a session and so need the same guard. */
const PASSWORDLESS_SIGN_IN_PATHS = new Set(["/magic-link/verify", "/sign-in/email-otp"]);

/** After a magic link or one-time code signs an enrolled app user in, withdraw the
 *  session and park them behind the challenge. Mirrors the plugin's own guard on
 *  `/sign-in/email`, setting the same cookie its verify endpoints read. */
export const twoFactorChallengeHook = createAuthMiddleware(async (ctx) => {
  if (!PASSWORDLESS_SIGN_IN_PATHS.has(ctx.path)) return;
  const data = ctx.context.newSession;
  if (!data || !(data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) return;

  deleteSessionCookie(ctx, true);
  await ctx.context.internalAdapter.deleteSession(data.session.token);

  const cookie = ctx.context.createAuthCookie("two_factor", { maxAge: CHALLENGE_MAX_AGE });
  const identifier = `2fa-${generateRandomString(20)}`;
  await ctx.context.internalAdapter.createVerificationValue({
    value: data.user.id,
    identifier,
    expiresAt: new Date(Date.now() + CHALLENGE_MAX_AGE * 1000),
  });
  await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes);

  if (ctx.path === "/magic-link/verify") {
    // A link click is a navigation, so the answer is a redirect rather than JSON.
    const callbackURL = typeof ctx.query?.callbackURL === "string" ? ctx.query.callbackURL : "/";
    const target = `${TWO_FACTOR_CHALLENGE_PATH}?returnTo=${encodeURIComponent(callbackURL)}`;
    ctx.setHeader("Location", target);
    throw ctx.redirect(target);
  }
  return ctx.json({ twoFactorRedirect: true });
});

function base32(input: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = new TextEncoder().encode(input);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** Create (or replace) an app user's pending authenticator secret and backup codes
 *  in the plugin's own format. Its enable endpoint demands a password, which an app
 *  user who signs in by magic link or code does not have; verify finishes the job. */
export async function startTwoFactorEnrollment(
  auth: ReturnType<typeof createAuth>,
  user: { id: string; email: string },
  issuer: string,
): Promise<{ totpUri: string; manualKey: string }> {
  const ctx = await auth.$context;
  const secret = generateRandomString(32);
  const backupCodes = Array.from({ length: 10 }, () => {
    const code = generateRandomString(10, "a-z", "0-9", "A-Z");
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
  const [encryptedSecret, encryptedCodes] = await Promise.all([
    symmetricEncrypt({ key: ctx.secretConfig, data: secret }),
    symmetricEncrypt({ key: ctx.secretConfig, data: JSON.stringify(backupCodes) }),
  ]);
  await ctx.adapter.deleteMany({ model: "twoFactor", where: [{ field: "userId", value: user.id }] });
  await ctx.adapter.create({
    model: "twoFactor",
    data: { secret: encryptedSecret, backupCodes: encryptedCodes, userId: user.id },
  });

  const manualKey = base32(secret);
  const params = new URLSearchParams({ secret: manualKey, issuer, digits: "6", period: "30" });
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}`;
  return { totpUri: `otpauth://totp/${label}?${params}`, manualKey };
}

/** Replay a page's form post as a JSON call to one of the plugin's endpoints,
 *  keeping the browser's cookies and origin so the call is the app user's own. */
export async function postToAuth(
  auth: ReturnType<typeof createAuth>,
  request: Request,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return auth.handler(
    new Request(new URL(`/api/auth${path}`, request.url), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

/** The cookies an auth response set, ready to attach to the page's own response. */
export function forwardCookies(res: Response): Headers {
  const headers = new Headers();
  for (const cookie of res.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return headers;
}
