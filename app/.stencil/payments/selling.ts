import { redirect } from "../http";
import { requireAuth, getSession } from "~stencil/auth/server";
import { requireSubscription } from "./server";
import type { AppContext } from "../types/context";
import { buyerRefCandidates, guestBuyerRef } from "./buyer-refs";

export { guestBuyerRef };

/**
 * Selling SDK — let *your users* charge *their own* customers (one-time card
 * payments, plus the recurring plans a seller manages with `createPlan` and
 * friends). This is the opposite direction from `~stencil/payments/server.ts`,
 * which is how *you* charge *your* users (subscriptions). No Stripe types or ids
 * ever leak into app code.
 *
 * The seller is one of your app's users who has completed Stripe-hosted
 * onboarding; the buyer is whoever pays them. **Buyers do NOT need an account
 * in your app.** Two modes:
 *
 * - **Guest (the default):** collect the buyer's email on your buy page and pass
 *   it as `buyerEmail`. The email *is* the buyer's identity: entitlement is
 *   answered per (email, reference), so `hasPurchased({ reference, buyerEmail })`
 *   is the gate. How the buyer later proves that email is your design — a link
 *   you email them (`~stencil/email`), an access code, a sign-in — Stencil
 *   stores no token or link for them.
 * - **Signed-in:** if you want buyers to register, put the buy flow behind your
 *   app's auth — a signed-in buyer is identified by their user id, as before.
 *   Roles and gating for registered buyers are then yours to build.
 *
 * `reference` is *your* own id for the thing being sold (a package id, a
 * listing id, …) — it's how you later ask "did this buyer pay for this?".
 *
 * Every call authenticates with the app's own per-app key and talks to the
 * hosted payments worker; you never handle card data or Stripe objects.
 */

const PAYMENTS_BASE = "https://payments.hellostencil.com";

/**
 * The app's `appId`, resolved once and cached. A deployed app worker is a single
 * isolate with a constant bearer key, so one lookup per isolate is enough. The
 * per-app routes are scoped by `appId`, which the app only learns at runtime.
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
function paymentsFetch(
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<Response> {
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

export type SellerStatus = {
  /**
   * `none` — never started · `onboarding` — Stripe KYC incomplete ·
   * `active` — can accept charges · `restricted` — Stripe needs more info.
   * Show selling UI only when `active`.
   */
  status: "none" | "onboarding" | "active" | "restricted";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** Requirement keys Stripe is still waiting on (drives a "finish setup" nudge). */
  currentlyDue: string[];
  disabledReason: string | null;
};

export type Purchase = {
  orderId: string;
  /** Your own id for the thing that was sold. */
  reference: string;
  description: string;
  /** Amount paid, in cents. */
  amount: number;
  currency: string;
  /** ISO timestamp, or null if not yet captured. */
  purchasedAt: string | null;
};

/**
 * Start (or resume) Stripe-hosted seller onboarding for the current user, then
 * throw a redirect to Stripe's hosted KYC. Also the "fix it" entry point when a
 * seller is `restricted` — Stripe re-collects whatever is missing.
 *
 * Gated on an active subscription: only a paying subscriber of this app may
 * become a seller, so this throws a redirect to `/upgrade` if the user isn't
 * subscribed.
 *
 * The first time a seller onboards you MUST pass their `country` (ISO 3166-1
 * alpha-2, e.g. "GB") — collect it in your own UI, because a Stripe account's
 * country is fixed at creation and can never change afterwards. An unsupported
 * country throws an error; surface it and let them pick another. `country` is
 * ignored once the account exists (resuming/fixing onboarding). Call from a
 * form action:
 *
 *   export async function action({ request, context }: Route.ActionArgs) {
 *     const form = await request.formData();
 *     await onboardSeller(request, context, { country: String(form.get("country")) });
 *   }
 *
 * After Stripe, the seller returns to `returnUrl` (defaults to `/app/sell`) —
 * re-check `getSellerStatus()` there, since onboarding may still be pending.
 */
export async function onboardSeller(
  request: Request,
  context: AppContext,
  opts?: { country?: string; returnUrl?: string; refreshUrl?: string },
): Promise<never> {
  const env = context.cloudflare.env;
  const { user } = await requireSubscription(request, context);
  const appId = await resolveAppId(env);
  const base = new URL(request.url).origin;

  const res = await paymentsFetch(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(user.id)}/onboard`,
    {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        displayName: user.name,
        country: opts?.country,
        returnUrl: opts?.returnUrl ?? `${base}/app/sell`,
        refreshUrl: opts?.refreshUrl ?? `${base}/app/sell`,
      }),
    },
  );
  if (!res.ok) {
    const err = await res
      .json<{ error?: string }>()
      .catch(() => ({}) as { error?: string });
    throw new Error(err.error ?? "Failed to start seller onboarding");
  }
  const { url } = await res.json<{ url: string }>();
  throw redirect(url);
}

/**
 * The current user's seller status. Never redirects — use it to decide what
 * selling UI to render (a "Start accepting payments" button when `none`, a
 * "finish setup" nudge when `onboarding`/`restricted`, the seller tools when
 * `active`).
 *
 *   export async function loader({ request, context }: Route.LoaderArgs) {
 *     const seller = await getSellerStatus(request, context);
 *     return { canSell: seller.status === "active" };
 *   }
 */
export async function getSellerStatus(
  request: Request,
  context: AppContext,
): Promise<SellerStatus> {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const appId = await resolveAppId(env);

  const res = await paymentsFetch(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(user.id)}`,
  );
  if (!res.ok) throw new Error("Failed to load seller status");
  const data = await res.json<Partial<SellerStatus>>();
  return {
    status: data.status ?? "none",
    chargesEnabled: data.chargesEnabled ?? false,
    payoutsEnabled: data.payoutsEnabled ?? false,
    detailsSubmitted: data.detailsSubmitted ?? false,
    currentlyDue: data.currentlyDue ?? [],
    disabledReason: data.disabledReason ?? null,
  };
}

/**
 * Can this seller take a payment right now? The buyer-side readiness check for
 * public buy pages: `getSellerStatus` reads the *current* user, so a buyer's
 * loader can't use it to ask about the seller — this one takes any seller's
 * user id and never authenticates or redirects. Fails closed: any lookup
 * problem reports `{ ready: false }`.
 *
 * Gate the buy button on it — when the seller isn't ready, render a "not
 * accepting payments yet" notice instead of a checkout that would be rejected.
 *
 *   export async function loader({ context, params }: Route.LoaderArgs) {
 *     const item = await loadItem(params.reference);
 *     const { ready } = await getSellerReadiness(context, {
 *       sellerUserId: item.sellerUserId,
 *     });
 *     return { item, sellerReady: ready };
 *   }
 */
export async function getSellerReadiness(
  context: AppContext,
  opts: { sellerUserId: string },
): Promise<{ ready: boolean }> {
  const env = context.cloudflare.env;
  try {
    const appId = await resolveAppId(env);
    const res = await paymentsFetch(
      env,
      `/v1/apps/${appId}/sellers/${encodeURIComponent(opts.sellerUserId)}`,
    );
    if (!res.ok) return { ready: false };
    const data = await res.json<{ chargesEnabled?: boolean }>();
    return { ready: data.chargesEnabled === true };
  } catch {
    return { ready: false };
  }
}

/**
 * Start a card checkout: the buyer pays the given seller for `reference`.
 * Throws a redirect to Stripe Checkout; after payment the buyer is sent to
 * `successUrl`. Enforces a $5 USD minimum on the server.
 *
 * **`amountCents` and `sellerUserId` must come from state the buyer cannot
 * write** — the stored item you look up by `reference` inside the action. The
 * platform charges exactly the amount you pass and never checks it against a
 * price list, so a number read from a form field, JSON body, or query string is
 * a number the buyer chose: they can pay $5 for a $500 item and the order is
 * recorded as paid.
 *
 * The buyer needs no account. Signed in, they're identified by their user id.
 * Signed out, they check out as a guest and you MUST pass `buyerEmail` — collect
 * it on the buy page (it also pre-fills Stripe). A guest checkout without an
 * email redirects back to `cancelUrl` with `?checkout_error=buyer_required`.
 *
 * If this buyer already owns `reference` this resolves cleanly by redirecting
 * to `successUrl` — they keep their access, they're never charged twice.
 *
 * Put whatever your success/purchase page needs to identify the buyer into
 * `successUrl` yourself (e.g. `?ref=<reference>&buyer=<email>`); Stencil adds
 * nothing to it.
 *
 * Expected rejections never crash the page: when the checkout can't start —
 * the seller isn't charge-ready yet (`seller_not_onboarded` /
 * `seller_not_ready`), the price is below the minimum (`below_minimum`), or
 * the request is otherwise invalid — this redirects back to `cancelUrl` with
 * `?checkout_error=<code>` appended. Read that param in the buy page's loader
 * and render it as a notice. Gate the buy button with `getSellerReadiness` so
 * buyers rarely reach a checkout that would bounce.
 *
 *   export async function action({ request, context, params }: Route.ActionArgs) {
 *     const pkg = await loadPackage(params.packageId); // your own DB read
 *     const form = await request.formData();
 *     await sellerCheckout(request, context, {
 *       sellerUserId: pkg.sellerUserId,
 *       reference: pkg.id,
 *       amountCents: pkg.priceCents,
 *       description: pkg.title,
 *       buyerEmail: String(form.get("email") || "") || undefined,
 *       successUrl: new URL("/app/purchases/success", request.url).toString(),
 *     });
 *   }
 */
export async function sellerCheckout(
  request: Request,
  context: AppContext,
  opts: {
    sellerUserId: string;
    amountCents: number;
    reference: string;
    description?: string;
    successUrl?: string;
    cancelUrl?: string;
    /** The guest buyer's email — required when nobody is signed in. */
    buyerEmail?: string;
  },
): Promise<never> {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  const appId = await resolveAppId(env);
  const base = new URL(request.url).origin;
  const successUrl = opts.successUrl ?? `${base}/app/purchases/success`;
  const cancelUrl = opts.cancelUrl ?? `${base}/app`;

  const buyerEmail = session?.user.email ?? opts.buyerEmail?.trim();
  if (!session && !buyerEmail) {
    // A guest is identified by email alone — without one there is nobody to
    // sell to. Same shape as every other expected rejection: back with a code.
    const back = new URL(cancelUrl, base);
    back.searchParams.set("checkout_error", "buyer_required");
    throw redirect(back.toString());
  }

  const res = await paymentsFetch(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(opts.sellerUserId)}/checkout`,
    {
      method: "POST",
      body: JSON.stringify({
        buyerRef: session?.user.id,
        buyerEmail,
        amountCents: opts.amountCents,
        reference: opts.reference,
        description: opts.description,
        successUrl,
        cancelUrl,
      }),
    },
  );
  const data = await res
    .json<{ url?: string; error?: string; code?: string }>()
    .catch(() => ({}) as { url?: string; error?: string; code?: string });

  if (res.ok && data.url) throw redirect(data.url);
  // Already owned — clean, idempotent: keep access, don't double-charge.
  if (res.status === 409 && data.code === "already_purchased") {
    throw redirect(successUrl);
  }
  // Every other 4xx is an expected business state (seller not charge-ready,
  // price below minimum, …), not a crash: send the buyer back with a
  // machine-readable code the page can render as a notice. A thrown Error here
  // would hit the root ErrorBoundary, which hides messages in production — the
  // buyer would see a blank "unexpected error" page.
  if (res.status >= 400 && res.status < 500) {
    const back = new URL(cancelUrl, base);
    back.searchParams.set("checkout_error", data.code ?? "checkout_failed");
    throw redirect(back.toString());
  }
  throw new Error(data.error ?? "Failed to start checkout");
}

/** The buyer identities a purchase read runs as: an explicit `buyerRef` alone,
 *  else a guest's `buyerEmail` and the signed-in user, whichever exist. Never
 *  redirects — a visitor with no identity simply has no purchases. */
async function resolveBuyerRefs(
  request: Request,
  env: Env,
  opts?: { buyerRef?: string; buyerEmail?: string },
): Promise<string[]> {
  const session = opts?.buyerRef ? null : await getSession(request, env);
  return buyerRefCandidates({
    buyerRef: opts?.buyerRef,
    buyerEmail: opts?.buyerEmail,
    sessionUserId: session?.user.id,
  });
}

/**
 * Has the buyer paid for `reference`? The one-line entitlement gate. The buyer
 * resolves from an explicit `buyerRef`, else from a guest's `buyerEmail` and the
 * signed-in user together (a buyer who paid while signed in is found either
 * way) — and reports `false` when none exists, never redirecting to login. Reads
 * live from paid orders, so a refunded or disputed-lost purchase reports `false`
 * automatically — no revocation bookkeeping on your side. Fails closed (returns
 * `false`) if the check can't be completed.
 *
 * For a guest, *you* decide how they prove their email before you call this
 * with it — a link you emailed, an access code, a sign-in. Never read the email
 * straight from an untrusted query string on a page that delivers the purchase.
 *
 *   export async function loader({ request, context }: Route.LoaderArgs) {
 *     if (!(await hasPurchased(request, context, { reference: packageId }))) {
 *       throw redirect("/app/buy/" + packageId);
 *     }
 *     return { unlocked: true };
 *   }
 */
export async function hasPurchased(
  request: Request,
  context: AppContext,
  opts: { reference: string; buyerRef?: string; buyerEmail?: string },
): Promise<boolean> {
  const env = context.cloudflare.env;
  const buyerRefs = await resolveBuyerRefs(request, env, opts);
  if (!buyerRefs.length) return false;
  const appId = await resolveAppId(env);

  const results = await Promise.all(
    buyerRefs.map(async (buyerRef) => {
      try {
        const res = await paymentsFetch(
          env,
          `/v1/apps/${appId}/buyers/${encodeURIComponent(buyerRef)}/purchases/${encodeURIComponent(opts.reference)}`,
        );
        if (!res.ok) return false;
        const { purchased } = await res.json<{ purchased: boolean }>();
        return purchased === true;
      } catch {
        return false;
      }
    }),
  );
  return results.some(Boolean);
}

/**
 * Every current paid purchase for a buyer. The buyer resolves like
 * `hasPurchased` (explicit `buyerRef`, else guest `buyerEmail` and signed-in
 * user together), and a visitor with no identity gets `[]` — never a login
 * redirect. Like `hasPurchased`, refunds and lost disputes drop out
 * automatically. Use it for a "My purchases" screen.
 *
 *   export async function loader({ request, context }: Route.LoaderArgs) {
 *     return { purchases: await getPurchases(request, context) };
 *   }
 */
export async function getPurchases(
  request: Request,
  context: AppContext,
  opts?: { buyerRef?: string; buyerEmail?: string },
): Promise<Purchase[]> {
  const env = context.cloudflare.env;
  const buyerRefs = await resolveBuyerRefs(request, env, opts);
  if (!buyerRefs.length) return [];
  const appId = await resolveAppId(env);

  const perBuyer = await Promise.all(
    buyerRefs.map(async (buyerRef): Promise<Purchase[]> => {
      try {
        const res = await paymentsFetch(
          env,
          `/v1/apps/${appId}/buyers/${encodeURIComponent(buyerRef)}/purchases`,
        );
        if (!res.ok) return [];
        const { purchases } = await res.json<{ purchases: Purchase[] }>();
        return purchases ?? [];
      } catch {
        return [];
      }
    }),
  );
  const byOrder = new Map<string, Purchase>();
  for (const purchase of perBuyer.flat()) byOrder.set(purchase.orderId, purchase);
  return [...byOrder.values()].sort((a, b) => {
    if (a.purchasedAt === b.purchasedAt) return 0;
    if (a.purchasedAt === null) return 1;
    if (b.purchasedAt === null) return -1;
    return b.purchasedAt.localeCompare(a.purchasedAt);
  });
}

/**
 * Remove the current user's seller account entirely — closes their Stripe
 * account so they can start over (for example after onboarding in the wrong
 * country, which Stripe can't change). Re-onboarding afterwards mints a
 * brand-new Stripe account. Returns `{ removed: false, reason }` without
 * deleting anything if the seller has already taken payments — surface `reason`
 * to them rather than treating it as an error.
 *
 *   export async function action({ request, context }: Route.ActionArgs) {
 *     return await disconnectSeller(request, context); // render reason when removed === false
 *   }
 */
export async function disconnectSeller(
  request: Request,
  context: AppContext,
): Promise<{ removed: boolean; reason?: string }> {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const appId = await resolveAppId(env);

  const res = await paymentsFetch(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(user.id)}`,
    { method: "DELETE" },
  );
  if (res.ok) return { removed: true };

  const data = await res
    .json<{ error?: string; code?: string }>()
    .catch(() => ({}) as { error?: string; code?: string });
  if (res.status === 409 && data.code === "has_transactions") {
    return {
      removed: false,
      reason: data.error ?? "You have already taken payments, so this account can't be removed.",
    };
  }
  throw new Error(data.error ?? "Could not remove the seller account");
}

/**
 * Mint a single-use, short-lived magic link for the current user (a seller) and
 * throw a redirect straight into their hosted seller dashboard — one click, no
 * password, no email. The dashboard is where sellers see revenue and sales and
 * issue refunds / respond to disputes (all panel-only, not in this SDK).
 *
 *   export async function action({ request, context }: Route.ActionArgs) {
 *     await sellerPanelLink(request, context);
 *   }
 *
 * `panelPath` is an optional page inside the hosted dashboard to open (e.g. "/payouts").
 * It is never an app URL: the dashboard lives on its own origin, and a URL outside it is
 * ignored. Unlike `onboardSeller`'s `returnUrl`, the seller is not sent back to the app.
 */
export async function sellerPanelLink(
  request: Request,
  context: AppContext,
  opts?: { panelPath?: string },
): Promise<never> {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const appId = await resolveAppId(env);

  const res = await paymentsFetch(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(user.id)}/panel-link`,
    {
      method: "POST",
      body: JSON.stringify({ callbackURL: opts?.panelPath }),
    },
  );
  const data = await res
    .json<{ url?: string; error?: string }>()
    .catch(() => ({}) as { url?: string; error?: string });

  if (res.ok && data.url) throw redirect(data.url);
  throw new Error(data.error ?? "Could not open the seller dashboard");
}

export type SellerPlan = {
  id: string;
  name: string;
  description: string;
  /** Price per interval, in cents. */
  amountCents: number;
  currency: string;
  interval: "month" | "year";
  /** Upgrade/downgrade order, low → high. */
  position: number;
  /** Archived plans take no new subscribers; existing ones keep renewing. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * A rejected write is `ok: false` with a `code` (`below_minimum`, `name_taken`,
 * `plan_limit`, `seller_not_ready`, …); show `error` to the seller.
 */
export type PlanResult =
  | { ok: true; plan: SellerPlan }
  | { ok: false; code: string; error: string };

async function planWrite(env: Env, path: string, init: RequestInit): Promise<PlanResult> {
  const res = await paymentsFetch(env, path, init);
  const data = await res
    .json<{ plan?: SellerPlan; error?: string; code?: string }>()
    .catch(() => ({}) as { plan?: SellerPlan; error?: string; code?: string });
  if (res.ok && data.plan) return { ok: true, plan: data.plan };
  if (res.status >= 400 && res.status < 500) {
    return { ok: false, code: data.code ?? "plan_failed", error: data.error ?? "The plan could not be saved" };
  }
  throw new Error(data.error ?? "The plan could not be saved");
}

/**
 * Create a recurring plan the current user sells to their own customers. Needs
 * `getSellerStatus()` to be `active`; at most 10 active plans per seller.
 */
export async function createPlan(
  request: Request,
  context: AppContext,
  opts: {
    name: string;
    description?: string;
    amountCents: number;
    interval: "month" | "year";
    position?: number;
  },
): Promise<PlanResult> {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const appId = await resolveAppId(env);
  return planWrite(env, `/v1/apps/${appId}/sellers/${encodeURIComponent(user.id)}/plans`, {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

/**
 * A seller's plans by `position`: `sellerUserId` for a public pricing page (no
 * sign-in), else the current user's own. Archived plans only with `includeArchived`.
 */
export async function listPlans(
  request: Request,
  context: AppContext,
  opts?: { sellerUserId?: string; includeArchived?: boolean },
): Promise<SellerPlan[]> {
  const env = context.cloudflare.env;
  const sellerUserId = opts?.sellerUserId ?? (await requireAuth(request, env)).user.id;
  const appId = await resolveAppId(env);
  const query = opts?.includeArchived ? "?include_archived=true" : "";
  const res = await paymentsFetch(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(sellerUserId)}/plans${query}`,
  );
  if (!res.ok) throw new Error("Failed to load plans");
  const { plans } = await res.json<{ plans: SellerPlan[] }>();
  return plans ?? [];
}

/**
 * Edit one of the current user's plans. A new `amountCents` applies to new
 * subscribers only; the interval can't change (archive and create a new plan).
 */
export async function updatePlan(
  request: Request,
  context: AppContext,
  opts: { planId: string; name?: string; description?: string; amountCents?: number; position?: number },
): Promise<PlanResult> {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const appId = await resolveAppId(env);
  const { planId, ...changes } = opts;
  return planWrite(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(user.id)}/plans/${encodeURIComponent(planId)}`,
    { method: "PUT", body: JSON.stringify(changes) },
  );
}

/**
 * Archive one of the current user's plans: no new subscribers, existing ones keep
 * renewing, and it frees a plan slot. Plans are never deleted.
 */
export async function archivePlan(
  request: Request,
  context: AppContext,
  opts: { planId: string },
): Promise<PlanResult> {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const appId = await resolveAppId(env);
  return planWrite(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(user.id)}/plans/${encodeURIComponent(opts.planId)}/archive`,
    { method: "POST" },
  );
}

export type SellerSubscription = {
  planId: string;
  sellerUserId: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired";
  /** End of the paid period. A canceled subscription keeps access until then. */
  currentPeriodEnd: Date | null;
  /** Set while a cancellation is pending: access runs until this date, then stops. */
  cancelAt: Date | null;
  /** Whether this subscription grants access right now. */
  active: boolean;
};

type SellerSubscriptionRow = {
  plan_id: string;
  seller_user_id: string;
  status: SellerSubscription["status"];
  current_period_end: number | null;
  cancel_at: number | null;
};

function toSellerSubscription(r: SellerSubscriptionRow): SellerSubscription {
  const periodEnd = r.current_period_end ? new Date(r.current_period_end * 1000) : null;
  return {
    planId: r.plan_id,
    sellerUserId: r.seller_user_id,
    status: r.status,
    currentPeriodEnd: periodEnd,
    cancelAt: r.cancel_at ? new Date(r.cancel_at * 1000) : null,
    active:
      r.status === "active" ||
      r.status === "trialing" ||
      r.status === "past_due" ||
      (r.status === "canceled" && !!periodEnd && periodEnd > new Date()),
  };
}

/** The signed-in user's seller subscriptions, from the app's own database. The
 *  table appears with the app's first subscriber, so until then there are none. */
async function readSellerSubscriptions(env: Env, userId: string, planId?: string) {
  try {
    const stmt = planId
      ? env.DB.prepare(
          "SELECT plan_id, seller_user_id, status, current_period_end, cancel_at FROM seller_subscription WHERE user_id = ? AND plan_id = ?",
        ).bind(userId, planId)
      : env.DB.prepare(
          "SELECT plan_id, seller_user_id, status, current_period_end, cancel_at FROM seller_subscription WHERE user_id = ?",
        ).bind(userId);
    const { results } = await stmt.all<SellerSubscriptionRow>();
    return results.map(toSellerSubscription);
  } catch (err) {
    if (/no such table/i.test(String(err))) return [];
    throw err;
  }
}

/**
 * Subscribe the signed-in user to a seller's plan: throws a redirect to Stripe
 * Checkout. **Access is granted by Stripe's confirmation, not by the redirect** —
 * the `successUrl` page may load a moment before it lands, so gate every page with
 * `hasActiveSubscription`, never with the success redirect.
 *
 * Subscriptions need a signed-in buyer. Expected rejections redirect back to
 * `cancelUrl` with `?checkout_error=<code>`: `buyer_required` (nobody signed in),
 * `already_subscribed` (they already subscribe to this seller — plan changes are
 * made in `manageSellerSubscription`), `seller_not_ready`, `plan_not_found`.
 *
 *   export async function action({ request, context, params }: Route.ActionArgs) {
 *     await sellerSubscribe(request, context, {
 *       sellerUserId: params.sellerId,
 *       planId: String((await request.formData()).get("planId")),
 *       successUrl: new URL("/app/members-area", request.url).toString(),
 *     });
 *   }
 */
export async function sellerSubscribe(
  request: Request,
  context: AppContext,
  opts: { sellerUserId: string; planId: string; successUrl?: string; cancelUrl?: string },
): Promise<never> {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  const base = new URL(request.url).origin;
  const successUrl = opts.successUrl ?? `${base}/app`;
  const cancelUrl = opts.cancelUrl ?? request.url;
  const back = (code: string) => {
    const url = new URL(cancelUrl, base);
    url.searchParams.set("checkout_error", code);
    return redirect(url.toString());
  };
  if (!session) throw back("buyer_required");

  const appId = await resolveAppId(env);
  const res = await paymentsFetch(
    env,
    `/v1/apps/${appId}/sellers/${encodeURIComponent(opts.sellerUserId)}/subscribe`,
    {
      method: "POST",
      body: JSON.stringify({
        buyerUserId: session.user.id,
        buyerEmail: session.user.email,
        planId: opts.planId,
        successUrl,
        cancelUrl,
      }),
    },
  );
  const data = await res
    .json<{ url?: string; error?: string; code?: string }>()
    .catch(() => ({}) as { url?: string; error?: string; code?: string });
  if (res.ok && data.url) throw redirect(data.url);
  if (res.status >= 400 && res.status < 500) throw back(data.code ?? "checkout_failed");
  throw new Error(data.error ?? "Failed to start checkout");
}

/**
 * Does the signed-in user have access to `planId` right now? The gate for
 * subscriber-only pages: one read of the app's own database, `false` for a
 * signed-out visitor, never a redirect. Past-due subscribers keep access while
 * Stripe retries the card; a canceled one keeps it until the paid period ends.
 *
 *   export async function loader({ request, context }: Route.LoaderArgs) {
 *     if (!(await hasActiveSubscription(request, context, { planId }))) {
 *       throw redirect("/app/pricing");
 *     }
 *     return { unlocked: true };
 *   }
 */
export async function hasActiveSubscription(
  request: Request,
  context: AppContext,
  opts: { planId: string },
): Promise<boolean> {
  return (await getSubscription(request, context, opts))?.active === true;
}

/** The signed-in user's subscription to `planId` (plan name, status and next date
 *  for a billing section), or null. Never redirects. */
export async function getSubscription(
  request: Request,
  context: AppContext,
  opts: { planId: string },
): Promise<SellerSubscription | null> {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  if (!session) return null;
  const [sub] = await readSellerSubscriptions(env, session.user.id, opts.planId);
  return sub ?? null;
}

/** Every seller subscription of the signed-in user, ended ones included (check
 *  `active`). `[]` for a signed-out visitor. */
export async function getSubscriptions(
  request: Request,
  context: AppContext,
): Promise<SellerSubscription[]> {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  if (!session) return [];
  return readSellerSubscriptions(env, session.user.id);
}

/**
 * The "Manage billing" button: throws a redirect to Stripe's billing portal for
 * the signed-in user's subscription to `planId`, returning to `returnUrl`. The
 * portal is where subscribers switch plans, update their card, see invoices and
 * cancel — do not build any of those in the app. Every change there flows back
 * to `hasActiveSubscription` on its own. Without a subscription it redirects to
 * `returnUrl` with `?billing_error=not_subscribed`.
 */
export async function manageSellerSubscription(
  request: Request,
  context: AppContext,
  opts: { planId: string; returnUrl?: string },
): Promise<never> {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const returnUrl = opts.returnUrl ?? request.url;
  const [sub] = await readSellerSubscriptions(env, user.id, opts.planId);
  const res = sub
    ? await paymentsFetch(
        env,
        `/v1/apps/${await resolveAppId(env)}/sellers/${encodeURIComponent(sub.sellerUserId)}/portal`,
        { method: "POST", body: JSON.stringify({ buyerUserId: user.id, returnUrl }) },
      )
    : null;
  const data = res
    ? await res
        .json<{ url?: string; error?: string; code?: string }>()
        .catch(() => ({}) as { url?: string; error?: string; code?: string })
    : { code: "not_subscribed" };
  if (res?.ok && data.url) throw redirect(data.url);
  if (!res || (res.status >= 400 && res.status < 500)) {
    const back = new URL(returnUrl, new URL(request.url).origin);
    back.searchParams.set("billing_error", data.code ?? "portal_failed");
    throw redirect(back.toString());
  }
  throw new Error(data.error ?? "Could not open billing");
}
