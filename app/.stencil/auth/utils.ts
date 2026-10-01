import { betterAuth } from "better-auth/minimal";
import { isDev } from "../context";
import { ensureTenantSchema, tenantDomain } from "../tenant";

const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

function _b64uDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}

export async function verifyJwt<T extends Record<string, unknown>>(
  token: string,
  secret: string,
): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const key = await crypto.subtle.importKey(
    "raw",
    _encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    _b64uDecode(sig),
    _encoder.encode(`${header}.${body}`),
  );
  if (!valid) return null;
  const payload = JSON.parse(_decoder.decode(_b64uDecode(body))) as T & { exp: number };
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { magicLink } from "better-auth/plugins/magic-link";
import { emailOTP } from "better-auth/plugins/email-otp";
import { mcp } from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { BetterAuthPlugin } from "better-auth/types";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "./schema";
import { sendAuthEmail } from "./auth-email";
import { withConsumerHooks } from "./hooks";
import { handleCompleteRegistration } from "./meta-capi";
import { handleSignupFanout } from "./signup-fanout";
import { handleActivityFanout } from "./activity-fanout";
import { readAttributionCookie } from "./attribution";
import { twoFactorChallengeHook } from "./two-factor";

/** The env keys that hold a string, so `injected` cannot be pointed at a binding. */
type StringEnvKey = {
  [K in keyof Env]-?: Env[K] extends string | undefined ? K : never;
}[keyof Env];

/** A platform-injected value, or its local-dev stand-in.
 *
 *  Reads the binding by name rather than taking the value, so the name in the
 *  error is always the name that was looked up — passing `env.APP_ID` beside
 *  `"AUTH_ISSUER_URL"` is not expressible.
 *
 *  Absent in a real deploy means the deployer failed to inject it: that is a
 *  broken app, and it says so rather than quietly running on a dev default. */
function injected(env: Env, name: StringEnvKey, devFallback: string): string {
  const value = env[name];
  if (value) return value;
  if (!isDev(env)) {
    throw new Error(
      `${name} is missing and STENCIL_ENV is not "development". On a deploy this ` +
        `binding is injected, so its absence means the app is misconfigured and ` +
        `falling back to the development default would be wrong. Running locally? ` +
        `Add "STENCIL_ENV": "development" to the vars block in wrangler.jsonc — ` +
        `the template ships it, apps created before it did not.`,
    );
  }
  return devFallback;
}

const authConfig = {
  betterAuthSecret(env: Env) {
    return injected(env, "BETTER_AUTH_SECRET", "dev-local-secret-do-not-use-in-prod");
  },
  issuerUrl(env: Env) {
    return injected(env, "AUTH_ISSUER_URL", "http://localhost:8787");
  },
  clientId(env: Env) {
    // The OIDC client_id is the app's immutable id, so it survives a URL rename.
    // It is opaque to the dispatcher (round-tripped and self-consistency-checked
    // only), so deploys that still carry a slug-based client_id keep working.
    return injected(env, "APP_ID", "local-app");
  },
  /** Undefined in a deploy — Better Auth then derives the base URL per request. */
  baseURL(env: Env) {
    return isDev(env) ? "http://localhost:8787" : undefined;
  },
  trustedOrigins(env: Env) {
    return isDev(env)
      ? [
          "http://localhost:8787",
          "http://localhost:5173",
          "http://apps.hellostencil.com",
          "https://apps.hellostencil.com",
        ]
      : undefined;
  },
};

/** The origin of a Better Auth action link, used to fetch that app's live
 *  `/theme.css` so the email matches the page the user came from. Returns
 *  null on a malformed URL so the email falls back to a neutral palette. */
function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Create a fetch function that uses the AUTH service binding when available.
 */
const authFetch = (env: Env): typeof fetch =>
  env.AUTH ? (...args) => env.AUTH!.fetch(...args) : fetch;

/** Create a Better Auth instance backed by the workspace D1 database.
 *  Passwordless methods reject unknown addresses when signups are closed, read
 *  off the `x-stencil-signup: off` header the dispatcher stamps from the app's
 *  `allowSignup` setting (`disableSignup` forces it); `x-stencil-verify-email:
 *  required` likewise carries the app's "Require email verification" setting.
 *  `ctx` lets platform hooks run past the response; `request` supplies the base
 *  URL (see `baseURL` below). */
export function createAuth(
  env: Env,
  disableSignup = false,
  ctx?: ExecutionContext,
  request?: Request,
) {
  const signupOff =
    disableSignup || request?.headers.get("x-stencil-signup") === "off";
  const verifyEmailRequired =
    request?.headers.get("x-stencil-verify-email") === "required";
  // On a domain serving app-user subdomains, one login covers the domain and
  // every address under it — otherwise signing in on the main site would leave
  // an app user signed out on their own.
  const apex = request ? tenantDomain(request) : null;
  const issuer = authConfig.issuerUrl(env);
  const doFetch = authFetch(env);
  const secret = authConfig.betterAuthSecret(env);

  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB, { schema: authSchema }), {
      provider: "sqlite",
      schema: authSchema,
    }),
    secret,
    // Base URL comes from the request's own origin: one app serves several origins
    // (custom domain, apps./previews.hellostencil.com) so a fixed URL would break
    // redirects for the others. The dispatcher only routes the app's own hostnames.
    baseURL: request ? new URL(request.url).origin : authConfig.baseURL(env),
    trustedOrigins: apex
      ? [`https://${apex}`, `https://*.${apex}`]
      : authConfig.trustedOrigins(env),
    basePath: "/api/auth",
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        ...(apex ? { domain: `.${apex}` } : {}),
      },
      // Only cf-connecting-ip — Cloudflare sets it and strips client-supplied copies.
      // Never add x-forwarded-for: it is caller-controlled, so an attacker could
      // rotate it to defeat the rate limiter.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    hooks: { after: twoFactorChallengeHook },
    databaseHooks: withConsumerHooks(env, {
      user: {
        create: {
          // Better Auth names every user column on insert; an app provisioned
          // before a column existed cannot sign anyone up until it is added.
          before: async (user, hookCtx) => {
            await ensureTenantSchema(env);
            const endpoint = hookCtx as { request?: Request; headers?: Headers } | undefined;
            const signupAttribution = readAttributionCookie(endpoint?.request?.headers ?? endpoint?.headers);
            return signupAttribution ? { data: { ...user, signupAttribution } } : undefined;
          },
          after: async (user, hookCtx) => {
            handleCompleteRegistration(env, ctx, user, hookCtx);
            handleSignupFanout(env, ctx, user);
          },
        },
      },
      // Better Auth re-saves a session at most once per updateAge window, so
      // create+update together approximate one touch per member per day.
      session: {
        create: {
          after: async (session) => {
            handleActivityFanout(env, ctx, session);
          },
        },
        update: {
          after: async (session) => {
            handleActivityFanout(env, ctx, session);
          },
        },
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: verifyEmailRequired,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(env, user.email, {
          origin: safeOrigin(url),
          heading: "Reset your password",
          intro: "We received a request to reset the password for your account. Click the button below to choose a new one. This link expires in 1 hour.",
          buttonLabel: "Reset password",
          actionUrl: url,
          footer: "If you didn't request a password reset, you can safely ignore this email — your password won't change.",
        });
      },
    },
    user: {
      additionalFields: {
        // Filled from the sign-up request's cookie in the create hook above, never from the form body.
        signupAttribution: { type: "string", required: false, input: false },
      },
      changeEmail: {
        enabled: true,
        // Sent to the current address; only its approval triggers the verification
        // to the new one, so a stolen session alone cannot move the account.
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await sendAuthEmail(env, user.email, {
            origin: safeOrigin(url),
            heading: "Approve your email change",
            intro: `We received a request to change the email on your account to ${newEmail}. Click the button below to approve it — we'll then send a confirmation link to the new address. This link expires in 1 hour.`,
            buttonLabel: "Approve change",
            actionUrl: url,
            footer: "If you didn't request this change, don't approve it — your email won't change. You may want to reset your password.",
          });
        },
      },
    },
    emailVerification: {
      // Sign-up sends the verification email whenever verification is required;
      // a blocked sign-in attempt only re-sends it with sendOnSignIn.
      sendOnSignIn: verifyEmailRequired,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        // The same callback verifies a signup and confirms a changed address;
        // only the token says which (it carries the address being switched to).
        const change = await verifyJwt<{ updateTo?: string }>(token, secret);
        await sendAuthEmail(env, user.email, change?.updateTo ? {
          origin: safeOrigin(url),
          heading: "Confirm your new email",
          intro: "Click the button below to confirm this is your new email address. Your account will use it to sign in from then on. This link expires in 1 hour.",
          buttonLabel: "Confirm new email",
          actionUrl: url,
          footer: "If you didn't ask to change the email on an account, you can safely ignore this email — nothing will change.",
        } : {
          origin: safeOrigin(url),
          heading: "Verify your email",
          intro: "Confirm this is your email address to finish setting up your account.",
          buttonLabel: "Verify email",
          actionUrl: url,
          footer: "If you didn't create an account, you can safely ignore this email.",
        });
      },
    },
    plugins: [
      // Opt-in per app user. The plugin challenges password sign-in and
      // twoFactorChallengeHook the passwordless paths; delegated Stencil sign-in
      // is not challenged, since that identity provider has its own security.
      twoFactor({ issuer: request ? new URL(request.url).hostname : env.APP_SLUG }),
      genericOAuth({
        config: [
          {
            providerId: "stencil",
            // Sign-in and sign-up share this endpoint and the identity is unknown
            // until the callback, so registration is gated per request: the
            // dispatcher forces `requestSignUp` from `allowSignup`.
            disableImplicitSignUp: true,
            clientId: authConfig.clientId(env),
            authorizationUrl: `${issuer}/oauth/authorize`,
            tokenUrl: `${issuer}/oauth/token`,
            userInfoUrl: `${issuer}/oauth/userinfo`,
            scopes: ["openid", "profile", "email"],
            pkce: true,
            getToken: async ({ code, redirectURI, codeVerifier }) => {
              const res = await doFetch(`${issuer}/oauth/token`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  code,
                  redirect_uri: redirectURI,
                  code_verifier: codeVerifier ?? "",
                  client_id: authConfig.clientId(env),
                  grant_type: "authorization_code",
                }),
              });
              if (!res.ok)
                throw new Error(`Token exchange failed: ${res.status}`);

              const data = await res.json<
                Record<string, unknown> & {
                  access_token: string;
                  token_type: string;
                  refresh_token?: string;
                  expires_in?: number;
                }
              >();
              return {
                accessToken: data.access_token,
                tokenType: data.token_type,
                refreshToken: data.refresh_token,
                accessTokenExpiresAt: data.expires_in
                  ? new Date(Date.now() + data.expires_in * 1000)
                  : undefined,
                raw: data,
              };
            },
            getUserInfo: async (tokens) => {
              const res = await doFetch(`${issuer}/oauth/userinfo`, {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              });
              if (!res.ok) {
                throw new Error(`Userinfo fetch failed: ${res.status}`);
              }
              const info = await res.json<{
                sub: string;
                email: string;
                name: string;
                email_verified: boolean;
              }>();
              return {
                id: info.sub,
                email: info.email,
                name: info.name,
                emailVerified: info.email_verified,
              };
            },
          },
        ],
      }),
      magicLink({
        disableSignUp: signupOff,
        sendMagicLink: async ({ email, url }) => {
          await sendAuthEmail(env, email, {
            origin: safeOrigin(url),
            heading: "Sign in",
            intro:
              "Click the button below to sign in. This link expires in 5 minutes and can only be used once.",
            buttonLabel: "Sign in",
            actionUrl: url,
            footer: "If you didn't request this, you can safely ignore this email.",
          });
        },
      }),
      emailOTP({
        disableSignUp: signupOff,
        sendVerificationOTP: async ({ email, otp }, ctx) => {
          await sendAuthEmail(env, email, {
            origin: ctx?.request ? safeOrigin(ctx.request.url) : null,
            heading: "Your sign-in code",
            intro: "Enter this code to continue. It expires in 5 minutes.",
            code: otp,
            footer: "If you didn't request this, you can safely ignore this email.",
          });
        },
      }),
      // Turns this app's Better Auth into an OAuth 2.1 provider for AI clients —
      // dynamic client registration plus the discovery documents. `consentPage`
      // is an app-rendered route under .stencil/mcp.
      mcp({
        loginPage: "/login",
        oidcConfig: {
          // OIDCOptions.loginPage is required (TS2741) — the top-level one does
          // not flow down into the oidc config.
          loginPage: "/login",
          consentPage: "/oauth/consent",
          allowDynamicClientRegistration: true,
        },
        // Cast erases mcp()'s return type, which names better-auth's unexported
        // MCPOptions; leaking it into createAuth's inferred type fails declaration
        // emit (TS4058). Type-only — runtime value unchanged.
      }) as unknown as BetterAuthPlugin,
    ],
  });
}
