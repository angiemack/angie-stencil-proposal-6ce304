import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { createAuth } from "./utils";
import { user, verification } from "./schema";
import { sendAuthEmail } from "./auth-email";

/**
 * Platform-internal account grant. The only entry point is the bearer-gated
 * internal route (`react-router/auth/grant-access.tsx`), called by the platform
 * over the dispatch namespace — app code goes through the app's own auth flows
 * instead, so a grant is always preceded by the platform's revocation check.
 */

const WELCOME_LINK_EXPIRES_IN = 60 * 60 * 24 * 30;
const SIGN_IN_LINK_EXPIRES_IN = 60 * 10;

/**
 * Mint a single-use sign-in link. The token row is stored in the exact shape
 * the magic-link plugin writes its own tokens, so the standard verify endpoint
 * accepts it and enforces this row's own expiry and single use; the plugin's
 * 5-minute default only applies to rows it mints.
 */
async function mintSignInLink(
  origin: string,
  env: Env,
  email: string,
  name: string | undefined,
  expiresInSeconds: number,
): Promise<string> {
  // 24 random bytes → 32 URL-safe chars.
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const now = new Date();
  // The raw token as `identifier` matches at verify time only because the
  // magic-link plugin's `storeToken` is left at its "plain" default (utils.ts).
  // Setting it to "hashed" must change this insert too, or every link INVALID_TOKENs.
  await drizzle(env.DB)
    .insert(verification)
    .values({
      id: crypto.randomUUID(),
      identifier: token,
      value: JSON.stringify({ email, name, attempt: 0 }),
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
      createdAt: now,
      updatedAt: now,
    });

  const url = new URL("/api/auth/magic-link/verify", origin);
  url.searchParams.set("token", token);
  url.searchParams.set("callbackURL", "/app");
  url.searchParams.set("errorCallbackURL", "/login");
  return url.toString();
}

/** Mint a 30-day welcome link and email it. The URL never leaves this module —
 *  it exists only inside the email. */
async function sendWelcomeLink(
  origin: string,
  env: Env,
  email: string,
  name: string | undefined,
): Promise<void> {
  const url = await mintSignInLink(origin, env, email, name, WELCOME_LINK_EXPIRES_IN);
  await sendAuthEmail(env, email, {
    origin,
    heading: "Your account is ready",
    intro:
      "Click the button below to sign in to your account. This link expires in 30 days and can only be used once.",
    buttonLabel: "Sign in",
    actionUrl: url,
    footer: "If you weren't expecting this email, you can safely ignore it.",
  });
}

export interface GrantAccessInput {
  email: string;
  /** Display name for a newly created account. Defaults to the address's local part. */
  name?: string;
  /**
   * Origin the welcome link (and the session it sets) lives on — the app's
   * custom domain when one serves. Defaults to the incoming request's origin,
   * which over the dispatch namespace is the platform host.
   */
  linkOrigin?: string;
  /**
   * Also return a 10-minute single-use sign-in URL in the result; the welcome
   * email still goes out. Deliberate exception to "the token is only ever
   * emailed": reserved for a caller that proved possession of the buyer's paid
   * checkout session — never one that merely names an email address.
   */
  signInLink?: boolean;
  /**
   * Send the welcome email (default true). Set false only when this purchase
   * already produced one — a suppressed email must never leave an account with
   * no way in.
   */
  welcomeEmail?: boolean;
}

export interface GrantAccessResult {
  userId: string;
  /** `reactivated` = the address already had an account; it is returned in place. */
  outcome: "created" | "reactivated";
  /** Present only under `signInLink`: the short-lived single-use verify URL. */
  signInUrl?: string;
}

/**
 * Create or reactivate the app-user account for an address. Idempotent: the
 * same address always resolves to the same account, and an existing account
 * (however dormant) is returned in place with all its data. Every call emails
 * a fresh welcome link that signs the person in, unless `welcomeEmail` is
 * false; the account has no password until they choose to set one. Works
 * while public signups are closed, because the account exists before the
 * link is clicked and the signup gate only applies to unknown addresses.
 *
 * The welcome token is only ever emailed — the result carries the user id and
 * the outcome, nothing else — so a caller never holds a sign-in credential for
 * an address it does not own. The one exception is `signInLink` (see
 * `GrantAccessInput`), which additionally returns a separate short-lived
 * sign-in URL. A failed email send throws (after the account write): with no
 * password set, the emailed link is the person's recovery path, so the caller
 * must retry rather than treat the grant as delivered.
 */
export async function grantAccess(
  request: Request,
  env: Env,
  input: GrantAccessInput,
  ctx?: ExecutionContext,
): Promise<GrantAccessResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error(`grantAccess: "${input.email}" is not a valid email`);
  }
  const name = input.name?.trim() || email.split("@")[0];

  const db = drizzle(env.DB);
  // lower() matching: Better Auth lowercases the addresses it stores, but
  // OAuth-created rows keep the provider's casing.
  const findByEmail = () =>
    db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${email}`)
      .limit(1);

  let userId: string;
  let outcome: GrantAccessResult["outcome"];
  const [existing] = await findByEmail();
  if (existing) {
    userId = existing.id;
    outcome = "reactivated";
  } else {
    // Created through Better Auth's internal adapter so the platform and app
    // database hooks (signup fanout, auth-hooks.server.ts) run as on any signup.
    const authContext = await createAuth(env, false, ctx, request).$context;
    try {
      const row = await authContext.internalAdapter.createUser({
        email,
        name,
        emailVerified: false,
      });
      userId = row.id;
      outcome = "created";
    } catch (err) {
      // Two concurrent grants can race on the unique email; the loser adopts
      // the row the winner created.
      const [won] = await findByEmail();
      if (!won) throw err;
      userId = won.id;
      outcome = "reactivated";
    }
  }

  const origin = input.linkOrigin ?? new URL(request.url).origin;
  if (input.welcomeEmail !== false) {
    await sendWelcomeLink(origin, env, email, name);
  }
  if (input.signInLink) {
    const signInUrl = await mintSignInLink(origin, env, email, name, SIGN_IN_LINK_EXPIRES_IN);
    return { userId, outcome, signInUrl };
  }

  return { userId, outcome };
}
