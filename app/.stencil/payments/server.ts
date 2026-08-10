import { redirect } from "react-router";
import { requireAuth } from "~stencil/auth/server";
import { createDb } from "~stencil/db";
import { subscription } from "~stencil/auth/schema";
import { tierOrder } from "~/generated/tiers";
import { eq } from "drizzle-orm";
import type { AppLoadContext } from "react-router";

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
  context: AppLoadContext,
  tierId?: string,
  opts?: { exact?: boolean },
): Promise<{
  user: Awaited<ReturnType<typeof requireAuth>>["user"];
  sub: typeof subscription.$inferSelect | null;
  paymentsEnabled: boolean;
}> {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const db = createDb(context.cloudflare.env);

  const [[sub], paymentsEnabled] = await Promise.all([
    db.select().from(subscription).where(eq(subscription.userId, user.id)).limit(1),
    fetchPaymentsEnabled(context.cloudflare.env),
  ]);

  if (!paymentsEnabled) return { user, sub: sub ?? null, paymentsEnabled: false };

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
 */
export async function getSubscription(
  request: Request,
  context: AppLoadContext,
): Promise<{
  sub: typeof subscription.$inferSelect | null;
  paymentsEnabled: boolean;
}> {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const db = createDb(context.cloudflare.env);

  const [[sub], paymentsEnabled] = await Promise.all([
    db.select().from(subscription).where(eq(subscription.userId, user.id)).limit(1),
    fetchPaymentsEnabled(context.cloudflare.env),
  ]);

  return { sub: sub ?? null, paymentsEnabled };
}

/**
 * Start a checkout flow for the given tier. Throws a redirect to the hosted
 * checkout page — after payment the user is sent to successUrl.
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
  context: AppLoadContext,
  opts: { tierId: string; interval?: "month" | "year"; successUrl?: string; cancelUrl?: string },
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
      interval: opts.interval ?? "month",
      endUserId: user.id,
      successUrl: opts.successUrl ?? `${base}/app`,
      cancelUrl: opts.cancelUrl ?? `${base}/upgrade`,
      customerEmail: user.email,
    },
    "Failed to start checkout",
  );
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
  context: AppLoadContext,
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
