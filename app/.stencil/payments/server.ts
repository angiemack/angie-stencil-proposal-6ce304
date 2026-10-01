import { redirect } from "../http";
import { requireAuth } from "~stencil/auth/server";
import { createDb } from "~stencil/db";
import { subscription } from "~stencil/auth/schema";
import { tierOrder } from "~/generated/tiers";
import { eq, sql } from "drizzle-orm";
import type { AppContext } from "../types/context";

/**
 * Read the current user's subscription row. Apps provisioned before `cancel_at`
 * shipped lack the column until the platform's first sync write heals it — add
 * it here on demand so the read never depends on that write having happened.
 */
async function selectSubscription(
  env: Env,
  userId: string,
): Promise<typeof subscription.$inferSelect | null> {
  const db = createDb(env);
  const query = () =>
    db.select().from(subscription).where(eq(subscription.userId, userId)).limit(1);
  try {
    const [sub] = await query();
    return sub ?? null;
  } catch (err) {
    if (!/no such column.*cancel_at/i.test(String(err))) throw err;
    await db.run(sql`ALTER TABLE subscription ADD COLUMN cancel_at integer`);
    const [sub] = await query();
    return sub ?? null;
  }
}

// A higher plan unlocks lower ones: `tierOrder` ranks plans low→high, so a member
// qualifies at or above the gated plan. `exact`, or a plan absent from the order
// (e.g. archived), falls back to an exact id match.
function planSatisfies(subTierId: string, requiredTierId: string, exact?: boolean): boolean {
  if (subTierId === requiredTierId) return true;
  if (exact) return false;
  const have = tierOrder.indexOf(subTierId);
  const need = tierOrder.indexOf(requiredTierId);
  if (have === -1 || need === -1) return false;
  return have >= need;
}

/**
 * Subscription transport — how *this app* charges *its own* users. Every call
 * goes to the hosted payments service's `/v1` API over the `PAYMENTS` service
 * binding, the same service and per-app bearer the selling SDK (`./selling.ts`)
 * uses. Card data and Stripe ids never touch app code.
 */

const PAYMENTS_BASE = "https://payments.hellostencil.com";

/**
 * The app's `appId`, resolved once and cached. A deployed app worker is a single
 * isolate with a constant bearer key, so one lookup per isolate is enough; the
 * per-app `/v1/apps/:appId/...` routes need the id, which the app only learns at
 * runtime.
 */
let cachedAppId: string | null = null;

/**
 * Fetch the payments service with the app's per-app bearer key attached.
 *
 * A deployed app must reach the service through its `PAYMENTS` service binding —
 * a plain `fetch()` to `payments.hellostencil.com` doesn't reach it. The plain
 * `fetch()` fallback is only used on the local dev server, which has no binding.
 * The bearer header is set the same way for either transport.
 */
function paymentsFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${env.BACKEND_SERVICE_API_KEY ?? ""}`);
  if (typeof init?.body === "string") headers.set("Content-Type", "application/json");
  const req = new Request(`${PAYMENTS_BASE}${path}`, { ...init, headers });
  return env.PAYMENTS ? env.PAYMENTS.fetch(req) : fetch(req);
}

async function resolveAppId(env: Env): Promise<string> {
  if (cachedAppId) return cachedAppId;
  const res = await paymentsFetch(env, "/v1/whoami");
  if (!res.ok) throw new Error("Could not reach the payments service");
  const { appId } = await res.json<{ appId: string }>();
  cachedAppId = appId;
  return appId;
}

/**
 * POST to a payments-worker endpoint, then redirect the user to the URL it
 * returns. Throws on non-OK responses — pass `errorMessage` to override the
 * generic fallback.
 */
async function paymentsRedirect(
  env: Env,
  path: string,
  body: Record<string, unknown>,
  errorMessage?: string,
): Promise<never> {
  const res = await paymentsFetch(env, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json<{ error?: string }>().catch(() => ({}) as { error?: string });
    throw new Error(err.error ?? errorMessage ?? `Payments request to ${path} failed`);
  }
  const { url } = await res.json<{ url: string }>();
  throw redirect(url);
}

async function fetchPaymentsEnabled(env: Env): Promise<boolean> {
  try {
    const appId = await resolveAppId(env);
    const res = await paymentsFetch(env, `/v1/apps/${appId}/payments/enabled`);
    const { enabled } = await res.json<{ enabled: boolean }>();
    return enabled;
  } catch {
    // Fail open: a payments outage shouldn't lock every user out of a gated app.
    return true;
  }
}

/**
 * Require an active subscription at the given tier.
 * Redirects to /login if unauthenticated, /upgrade if not subscribed.
 *
 * Returns `{ user, sub }` on success. `sub` is null when payments are disabled
 * for the app (gating bypassed) — always treat it as nullable.
 *
 * If tierId is omitted, any active subscription qualifies. When you pass one, a
 * higher plan also qualifies ("this plan or higher") per the plan order in
 * `~/generated/tiers`; pass `{ exact: true }` to require that exact plan.
 *
 * Use in loaders for gated routes:
 *
 *   import { requireSubscription } from "~stencil/payments/server";
 *   import { tiers } from "~/generated/tiers";
 *
 *   export async function loader({ request, context }: Route.LoaderArgs) {
 *     const { user } = await requireSubscription(request, context, tiers.pro.id);
 *     return { user };
 *   }
 */
export async function requireSubscription(
  request: Request,
  context: AppContext,
  tierId?: string,
  opts?: { exact?: boolean },
): Promise<{
  user: Awaited<ReturnType<typeof requireAuth>>["user"];
  sub: typeof subscription.$inferSelect | null;
  paymentsEnabled: boolean;
}> {
  const { user } = await requireAuth(request, context.cloudflare.env);

  const [sub, paymentsEnabled] = await Promise.all([
    selectSubscription(context.cloudflare.env, user.id),
    fetchPaymentsEnabled(context.cloudflare.env),
  ]);

  if (!paymentsEnabled) return { user, sub, paymentsEnabled: false };

  const isActive =
    sub &&
    (tierId ? planSatisfies(sub.tierId, tierId, opts?.exact) : true) &&
    (sub.status === "active" || sub.status === "trialing") &&
    sub.currentPeriodEnd !== null &&
    sub.currentPeriodEnd > new Date();

  if (!isActive) throw redirect("/upgrade");

  return { user, sub: sub!, paymentsEnabled: true };
}

/**
 * Return the current user's subscription and whether payments are enabled.
 * Use this for conditional UI (upgrade banners, feature locks) without
 * hard-blocking access to the page.
 *
 *   const { sub, paymentsEnabled } = await getSubscription(request, context);
 *   return { isPro: !paymentsEnabled || sub?.status === "active" };
 *
 * `sub.cancelAt` is set while a cancellation is pending: the subscription stays
 * `active` (and entitled) until that date, but will not renew — show
 * "Cancelled — access until {cancelAt}" instead of a renewal date.
 */
export async function getSubscription(
  request: Request,
  context: AppContext,
): Promise<{
  sub: typeof subscription.$inferSelect | null;
  paymentsEnabled: boolean;
}> {
  const { user } = await requireAuth(request, context.cloudflare.env);

  const [sub, paymentsEnabled] = await Promise.all([
    selectSubscription(context.cloudflare.env, user.id),
    fetchPaymentsEnabled(context.cloudflare.env),
  ]);

  return { sub, paymentsEnabled };
}

/**
 * Start a checkout flow for the given tier. Throws a redirect to the hosted
 * checkout page — after payment the user is sent to successUrl.
 *
 * Pass `promoCode` (one of the app's own discount codes) to open checkout with
 * that discount already applied — the reduced price shows with nothing to type,
 * and the manual promo-code field is hidden (the payment page allows one or the
 * other, never both). An unknown or removed code fails the checkout rather than
 * silently charging full price, so only pass a code the app is promoting.
 *
 * Call in a form action:
 *
 *   import { tier } from "~/generated/tiers";
 *
 *   export async function action({ request, context }: Route.ActionArgs) {
 *     await checkout(request, context, {
 *       tierId: tier!.id,
 *       successUrl: new URL("/subscribe/success", request.url).toString(),
 *       cancelUrl: new URL("/upgrade", request.url).toString(),
 *     });
 *   }
 */
export async function checkout(
  request: Request,
  context: AppContext,
  opts: {
    tierId: string;
    interval?: "month" | "year";
    successUrl?: string;
    cancelUrl?: string;
    promoCode?: string;
  },
): Promise<void> {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const base = new URL(request.url).origin;
  const appId = await resolveAppId(env);

  await paymentsRedirect(
    env,
    `/v1/apps/${appId}/subscriptions/checkout`,
    {
      tierId: opts.tierId,
      // Omit interval when the caller didn't set one, so the worker bills the
      // interval the plan actually offers (a yearly-only plan has no monthly price).
      ...(opts.interval ? { interval: opts.interval } : {}),
      ...(opts.promoCode ? { promoCode: opts.promoCode } : {}),
      endUserId: user.id,
      successUrl: opts.successUrl ?? `${base}/app`,
      cancelUrl: opts.cancelUrl ?? `${base}/upgrade`,
      customerEmail: user.email,
    },
    "Failed to start checkout",
  );
}

/**
 * Start a pay-first checkout for a visitor with **no account**. Collect their
 * email on the page (one field — not a signup form) and pass it here: Stripe
 * locks its checkout email field to it, and on payment the platform creates
 * (or reactivates) the account for that address — the purchase itself is the
 * signup. Point successUrl at a route whose loader calls
 * `claimPayFirstCheckout` with the `session_id` query param (appended here for
 * Stripe to fill in) so the buyer lands signed in with no email hop; the
 * platform's emailed sign-in link remains the recovery path for a closed tab.
 * Only for an app whose access mode is pay-first (the platform refuses
 * otherwise); anywhere a session exists, use `checkout`. An address whose
 * account the app's builder removed is refused before any charge — the thrown
 * error says so. `promoCode` pre-applies a discount exactly as on `checkout`.
 *
 * Call in a form action on a public page:
 *
 *   import { tier } from "~/generated/tiers";
 *
 *   export async function action({ request, context }: Route.ActionArgs) {
 *     const form = await request.formData();
 *     await payFirstCheckout(context, {
 *       email: String(form.get("email") ?? ""),
 *       tierId: tier!.id,
 *       successUrl: new URL("/subscribe/success", request.url).toString(),
 *       cancelUrl: new URL("/", request.url).toString(),
 *     });
 *   }
 */
export async function payFirstCheckout(
  context: AppContext,
  opts: {
    email: string;
    tierId: string;
    interval?: "month" | "year";
    successUrl: string;
    cancelUrl: string;
    promoCode?: string;
  },
): Promise<void> {
  const env = context.cloudflare.env;
  const appId = await resolveAppId(env);

  // Appended by hand: Stripe only substitutes the literal `{CHECKOUT_SESSION_ID}`
  // placeholder, and URL/searchParams helpers would percent-encode the braces.
  const successUrl =
    opts.successUrl +
    (opts.successUrl.includes("?") ? "&" : "?") +
    "session_id={CHECKOUT_SESSION_ID}";

  await paymentsRedirect(
    env,
    `/v1/apps/${appId}/subscriptions/checkout`,
    {
      customerEmail: opts.email,
      tierId: opts.tierId,
      ...(opts.interval ? { interval: opts.interval } : {}),
      ...(opts.promoCode ? { promoCode: opts.promoCode } : {}),
      payFirst: true,
      successUrl,
      cancelUrl: opts.cancelUrl,
    },
    "Failed to start checkout",
  );
}

/**
 * Sign in the buyer who just completed a pay-first checkout, in the browser
 * Stripe redirected back. Pass the `session_id` query param from the success
 * URL; returns a short-lived single-use sign-in URL to redirect the browser to
 * (magic-link verify → session cookie → `/app`), or null when the claim is
 * refused — already used, expired, or the payment didn't complete. On null,
 * render a fallback: the platform's emailed sign-in link covers a closed tab
 * or another device.
 *
 *   export async function loader({ request, context }: Route.LoaderArgs) {
 *     const sessionId = new URL(request.url).searchParams.get("session_id");
 *     if (sessionId) {
 *       const url = await claimPayFirstCheckout(context, sessionId);
 *       if (url) throw redirect(url);
 *     }
 *     return {};
 *   }
 */
export async function claimPayFirstCheckout(
  context: AppContext,
  sessionId: string,
): Promise<string | null> {
  const env = context.cloudflare.env;
  try {
    const appId = await resolveAppId(env);
    const res = await paymentsFetch(env, `/v1/apps/${appId}/subscriptions/claim`, {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) {
      // A refusal (reused/expired session) is an expected path the success page
      // handles; log it so a systemic failure is still visible.
      console.warn(`Pay-first claim refused (${res.status})`);
      return null;
    }
    const { url } = await res.json<{ url?: string }>();
    return url || null;
  } catch (err) {
    // Never crash the success page over the claim — the buyer's recovery is the
    // emailed sign-in link, which the fallback screen points at.
    console.warn(`Pay-first claim failed: ${String(err)}`);
    return null;
  }
}

/**
 * Open the subscription management portal for the current user. Throws a
 * redirect to the hosted portal where they can change plan, update payment
 * details, or cancel. Redirects to /upgrade if they have no subscription.
 *
 *   export async function action({ request, context }: Route.ActionArgs) {
 *     await manageSubscription(request, context,
 *       new URL("/app/settings", request.url).toString()
 *     );
 *   }
 */
export async function manageSubscription(
  request: Request,
  context: AppContext,
  returnUrl?: string,
): Promise<void> {
  const env = context.cloudflare.env;
  const { sub } = await getSubscription(request, context);

  if (!sub?.customerId) throw redirect("/upgrade");

  const appId = await resolveAppId(env);

  await paymentsRedirect(
    env,
    `/v1/apps/${appId}/subscriptions/portal`,
    { customerId: sub.customerId, returnUrl: returnUrl ?? request.url },
    "Failed to open subscription portal",
  );
}
