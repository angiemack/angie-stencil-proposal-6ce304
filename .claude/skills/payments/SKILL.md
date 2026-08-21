---
name: payments
description: How to gate features behind subscriptions, build upgrade pages, and trigger checkout/billing-portal flows using the platform's built-in payments layer. Load when the brief mentions subscriptions, paid plans, upgrades, or billing.
---

# Payments

Stencil apps have a first-class payments layer built on Stripe. You never touch Stripe directly — the platform handles key management, checkout sessions, and webhooks. Your job is to (1) check whether a tier exists, (2) gate the right surfaces, and (3) wire up the upgrade and subscribe flows.

---

## 1. Check the tiers file first

Before writing any payments code, read `~/generated/tiers`:

```ts
import { tier, tiers } from "~/generated/tiers";
```

- `tiers` — object keyed by slug (e.g. `tiers.professional`). Each value has `id`, `name`, `priceCents`, `interval`, `benefits[]`, `description`.
- `tier` — convenience shorthand: `Object.values(tiers)[0] ?? null`. For single-tier apps (the common case), always use `tier`.

**If `tier` is `null`, the app has no subscription plan configured.** Do not build any payments UI — skip gating entirely and leave a TODO comment where the gate would go.

```ts
// TODO: gate this with requireSubscription() once a subscription plan is configured
```

---

## 2. `paymentsEnabled` — read this carefully

Both `requireSubscription` and `getSubscription` return a `paymentsEnabled` boolean alongside the subscription data. This flag indicates whether the workspace has Stripe connected and payments active.

**When `paymentsEnabled` is `false`, all gating is bypassed** — every user should be treated as subscribed.

**Always factor `paymentsEnabled` into your "is this user active?" check:**

```ts
const isPro = !paymentsEnabled || sub?.status === "active" || sub?.status === "trialing";
```

Never gate on `sub?.status === "active"` alone — that locks everyone out when payments are disabled.

---

## 3. Server functions (`~stencil/payments/server`)

All four functions live in `~stencil/payments/server`. Import only what you use.

### `requireSubscription` — hard gate (redirect)

Blocks the route entirely. Unauthenticated users go to `/login`; authenticated users without an active subscription go to `/upgrade`.

**Returns `{ user, sub, paymentsEnabled }`.** When `paymentsEnabled` is `false` the function returns without throwing (gating bypassed). `sub` is the subscription row or `null` — it's nullable regardless of `paymentsEnabled`, so never use `sub` as a proxy for whether payments are enabled. Use `paymentsEnabled` directly for that.

```ts
import { requireSubscription } from "~stencil/payments/server";
import { tier } from "~/generated/tiers";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, sub, paymentsEnabled } = await requireSubscription(request, context, tier!.id);
  return { user };
}
```

Pass `tier!.id` as the third argument. Omit it only when any active subscription qualifies (multi-tier apps, rare).

### `getSubscription` — soft gate (conditional UI)

Returns `{ sub, paymentsEnabled }`. Use when you want upgrade prompts inline rather than a redirect. `sub` is the subscription row or `null`.

```ts
import { getSubscription } from "~stencil/payments/server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { sub, paymentsEnabled } = await getSubscription(request, context);
  const isPro = !paymentsEnabled || sub?.status === "active" || sub?.status === "trialing";
  return { isPro };
}
```

Active statuses: `"active"` and `"trialing"`. `"past_due"` and `"canceled"` are not active.

### `checkout` — start a Stripe checkout session

Call from a form `action` (POST). Throws a redirect to Stripe-hosted checkout. Do not call client-side.

```ts
import { checkout } from "~stencil/payments/server";
import { tier } from "~/generated/tiers";

// app/routes/subscribe.tsx
export async function action({ request, context }: Route.ActionArgs) {
  await checkout(request, context, {
    tierId: tier!.id,
    successUrl: new URL("/app", request.url).toString(),
    cancelUrl: new URL("/upgrade", request.url).toString(),
  });
}
```

`successUrl` and `cancelUrl` default to `/app` and `/upgrade` — only override when you need a different redirect.

### `manageSubscription` — Stripe billing portal

Lets the user update payment details, change plan, or cancel. Call from a form action (POST). Redirects to `/upgrade` if the user has no subscription.

```ts
import { manageSubscription } from "~stencil/payments/server";

// app/routes/app.billing.tsx
export async function action({ request, context }: Route.ActionArgs) {
  await manageSubscription(
    request,
    context,
    new URL("/app/settings", request.url).toString(), // returnUrl after portal
  );
}
```

Only render the "Manage billing" button when `isPro` is `true` — free users will just get redirected to `/upgrade`.

---

## 4. Upgrade page

Copy the scaffold — do not build the upgrade page from scratch:

```bash
cp /opt/design/scaffolds/subscriptions/upgrade.tsx app/routes/upgrade.tsx
```

The scaffold reads `tier` from `~/generated/tiers` and renders the plan name, price, interval, description, and benefits. Adapt the copy and visual design to match the app.

Register the route in `app/routes.ts`:

```ts
route("upgrade", "routes/upgrade.tsx"),
route("subscribe", "routes/subscribe.tsx"),  // action-only resource route
```

The upgrade scaffold's form posts to `/subscribe`. Create that resource route:

```ts
// app/routes/subscribe.tsx
import type { Route } from "./+types/subscribe";
import { checkout } from "~stencil/payments/server";
import { tier } from "~/generated/tiers";

export async function action({ request, context }: Route.ActionArgs) {
  await checkout(request, context, {
    tierId: tier!.id,
    successUrl: new URL("/app", request.url).toString(),
    cancelUrl: new URL("/upgrade", request.url).toString(),
  });
}
```

---

## 5. Inline upgrade prompt (soft gate)

When you want to tease a feature without hard-blocking:

```tsx
export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const { sub, paymentsEnabled } = await getSubscription(request, context);
  const isPro = !paymentsEnabled || sub?.status === "active" || sub?.status === "trialing";
  return { user, isPro };
}

export default function FeaturePage({ loaderData }: Route.ComponentProps) {
  const { isPro } = loaderData;

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-muted-foreground">This feature requires a subscription.</p>
        <a href="/upgrade" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Upgrade to unlock →
        </a>
      </div>
    );
  }

  return <FeatureContent />;
}
```

---

## 6. Displaying plan details in UI

Use `tier` directly from `~/generated/tiers`:

```tsx
import { tier } from "~/generated/tiers";

// Price display
const price = tier ? `$${(tier.priceCents / 100).toFixed(0)} / ${tier.interval}` : null;

// Benefits list
{tier?.benefits.map((b) => <li key={b}>{b}</li>)}
```

---

## 7. Single-tier pattern

Each Stencil app has **at most one active tier** — the database enforces this. Always use the `tier` shorthand and pass `tier!.id` to `requireSubscription`. If `tier` is `null`, don't pass `undefined` as a workaround — that accepts any active subscription and is semantically wrong. Don't call `requireSubscription` at all until a tier exists.

---

## 8. Payment receipts are automatic — do not send your own

The platform sends the payment receipt email itself, on Stripe's settled-payment webhook: a new receipt on every subscription charge (signup and each renewal) and one on every one-time sale. It goes to the payer, from the app's own email domain when the builder has connected one (otherwise the shared sender), and links Stripe's own receipt. **No wiring is required and app code must not send its own receipt** — adding one via the `email` skill (`~stencil/email`) just double-sends. Only add a *different* transactional email (e.g. an order-shipped notice) through that skill.

---

## Rules

- **Never build custom Stripe integration.** No `stripe.js`, no `loadStripe()`, no `STRIPE_SECRET_KEY`.
- **Never store subscription state yourself.** Use `getSubscription()` / `requireSubscription()` — they read from the platform's D1 table.
- **Always use `!paymentsEnabled || ...` in your active check.** Never gate on `sub?.status === "active"` alone.
- **`sub` is always nullable** — it's `null` any time the user hasn't subscribed. Don't use `sub === null` as a signal that payments are disabled; use `paymentsEnabled` directly.
- **`checkout()` and `manageSubscription()` must be called from server actions**, not loaders or client code. Both throw a redirect.
- **`tier` can be null.** Always null-check before using (`tier?.id`, `tier!.id` only after confirming it exists).
- The upgrade page lives at `/upgrade` — this is the default redirect target for ungated users. Don't change this path.
- **Never send your own payment receipt.** The platform sends it automatically on payment (see §8); a receipt built with the `email` skill only double-sends.
