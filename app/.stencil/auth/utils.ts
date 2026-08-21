import { betterAuth } from "better-auth/minimal";

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
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "./schema";
import { sendAuthEmail } from "./auth-email";
import { withConsumerHooks } from "./hooks";
import { handleCompleteRegistration } from "./meta-capi";
import { handleSignupFanout } from "./signup-fanout";

/** Helper to check if we're in dev mode. */
function isDev() {
  return import.meta.env.DEV;
}

/** Helper to return a value or undefined based on whether we're in dev mode. */
function ifDev<T>(value: T) {
  return () => (isDev() ? value : undefined);
}

const authConfig = {
  betterAuthSecret(env: Env) {
    return !isDev()
      ? env.BETTER_AUTH_SECRET
      : "dev-local-secret-do-not-use-in-prod";
  },
  issuerUrl(env: Env) {
    return !isDev() ? env.AUTH_ISSUER_URL : "http://localhost:8787";
  },
  clientId(env: Env) {
    // The OIDC client_id is the app's immutable id, so it survives a URL rename.
    // It is opaque to the dispatcher (round-tripped and self-consistency-checked
    // only), so deploys that still carry a slug-based client_id keep working.
    return !isDev() ? env.APP_ID : "local-app";
  },
  baseURL: ifDev("http://localhost:8787"),
  trustedOrigins: ifDev([
    "http://localhost:8787",
    "http://localhost:5173",
    "http://apps.hellostencil.com",
    "https://apps.hellostencil.com",
  ]),
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
 *  `disableSignup` makes the passwordless methods reject unknown addresses; the
 *  dispatcher sets it per request from the app's `allowSignup` setting. `ctx` is
 *  the request's ExecutionContext, so platform hooks can run past the response.
 *  `request` supplies the base URL from its own origin (see `baseURL` below). */
export function createAuth(
  env: Env,
  disableSignup = false,
  ctx?: ExecutionContext,
  request?: Request,
) {
  const issuer = authConfig.issuerUrl(env);
  const doFetch = authFetch(env);

  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB, { schema: authSchema }), {
      provider: "sqlite",
      schema: authSchema,
    }),
    secret: authConfig.betterAuthSecret(env),
    // Base URL comes from the request's own origin: one app serves several origins
    // (custom domain, apps./previews.hellostencil.com) so a fixed URL would break
    // redirects for the others. The dispatcher only routes the app's own hostnames.
    baseURL: request ? new URL(request.url).origin : authConfig.baseURL(),
    trustedOrigins: authConfig.trustedOrigins(),
    basePath: "/api/auth",
    advanced: {
      defaultCookieAttributes: { sameSite: "none", secure: true },
    },
    databaseHooks: withConsumerHooks(env, {
      user: {
        create: {
          after: async (user, hookCtx) => {
            handleCompleteRegistration(env, ctx, user, hookCtx);
            handleSignupFanout(env, ctx, user);
          },
        },
      },
    }),
    emailAndPassword: {
      enabled: true,
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
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(env, user.email, {
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
        disableSignUp: disableSignup,
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
        disableSignUp: disableSignup,
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
    ],
  });
}
