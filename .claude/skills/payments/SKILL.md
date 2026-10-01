---
name: payments
description: Subscriptions — the app builder charging app users. Covers plans, pricing, payouts, coupons, and status via the payment tools (conversation), and gating, upgrade pages, and checkout/billing-portal via `~stencil/payments/*` (app code). Load before touching that code or the `subscription` table. Also load for fixes — a subscribe button doing nothing, `/upgrade` redirect or 404, a paywall, a plan not registering after checkout, `requireSubscription`, billing-portal issues, or letting someone in without paying (free/beta/comp). NOT for app users charging their own end users — see `selling`.
allowed-tools: getPaymentStatus setupPayments getPayoutSetupLink setSubscriptionPrice removeSubscription setFreeTrial createCoupon listCoupons removeCoupon getAuthConfig configureAuth
metadata:
  agents: [chat, builder]
---

# Payments

Stencil apps have a first-class payments layer built on Stripe. You never touch Stripe directly — the platform handles key management, checkout sessions, and webhooks. This skill has two halves: **setting up payments** (plans, pricing, payouts, discounts — done in conversation with the payment tools) and **building with payments** (gating features and wiring upgrade flows — done in app code). Use the half that matches the work in front of you.

# Part 1 — Setting up payments (conversation)

You help app builders monetise their apps by setting up subscription plans for their app users.

## The three-actor model — say this first, don't improvise

Payments confuse app builders because there are **three separate Stripe relationships**, not one. Whenever payments come up, explain this plainly up front. This wording is canned — say it, don't reword it into something vaguer:

- **You (the app builder)** verify your identity so the subscription money your app users pay you reaches your bank. Once **per app** — each app has its own Stripe account, so a new app repeats this quick step.
- **Your app users subscribe** to your app — they just pay by card, nothing for them to set up.
- **A subscribed app user who wants to sell** completes **their own** Stripe onboarding so **their** sale money reaches **their** bank; **their** end users just pay by card.

Two independent money flows: app users → you (subscriptions), and end users → your selling app users (sales). The identity you verify and the identity a seller verifies are **different Stripe accounts** — yours and theirs.

**Always present setup as a live checklist**, and re-render it with current status every time payments come up so the app builder can see exactly where they are:

```
Payments setup
  ① Verify your identity so subscriptions reach you   — Step 1 of 3  ✅ done
  ② Your app users subscribe                           — Step 2 of 3  ⬜ waiting on app users
  ③ Sellers onboard to get paid (end users just pay)   — Step 3 of 3  ⬜ not started
```

Derive each mark from live state, never guess: steps ① and ② from `getPaymentStatus` (`connect` / `tiers`); step ③ is each seller's own onboarding, completed inside the app (that's the `selling` skill), not something you switch on here. **This skill owns steps ① and ②** — step ③ lives in the `selling` skill.

## The first payments request on an app — offer a walkthrough

Payments is the most involved feature an app builder can add, and setup goes better when they hold the whole picture first. The **first** time they ask for payments on an app that has none yet — `getPaymentStatus` shows no connected account and `tiers` is empty — offer the choice, in one short message, before setting anything up. Roughly:

> Payments is the most involved thing you can add to an app — there are several moving parts (who verifies their identity with Stripe, who gets paid, what your app users pay you vs. what their customers pay them). It goes much better when you know how it fits together. Want a two-minute walkthrough first, or should I go ahead and set it up now?

Then **wait for the answer** — a real conversation turn, not a step to skip. First request only — never re-run the offer on a later turn about a plan change, a bug, or a stuck app user. That is a fix, not an introduction.

**If they want the walkthrough**, keep it a short spoken explanation — plain words, no code, no fee numbers, not a wall of text. Cover the pieces that apply to what they asked: the three-actor model above (the canned wording, as written); that connecting Stripe is a step they do themselves, in their own name; that a plan goes live only after the next build/publish; that `/upgrade` is the page ungated app users land on; and that receipts are automatic. End with "ready to set it up?" and proceed on yes.

**If they say set it up now**, proceed — and end the closing message with the facts they most need: a plan goes live only after a build/publish, and app users subscribe on the upgrade/pricing page the build ships.

## The model

- **Plans.** An app can offer up to **four** subscription plans. **Default to a single plan** — most apps want one plan that app users either subscribe to or don't. Only propose 2–4 plans (e.g. Basic / Pro / Premium) when the app builder asks for tiers or describes segments who should pay different amounts.
- **Plan order is the gating hierarchy.** Plans are ordered low→high by `position`; an app user on a higher plan unlocks everything gated to the plans below it. Keep cheaper plans at lower positions.
- **A plan can be monthly, yearly, or both** — at least one price is required. Default to a monthly price; a plan may instead be yearly-only, or carry both. A yearly price (including on a yearly-only plan) needs **annual billing** switched on in the app's **payments settings page** first. You cannot flip that toggle from chat — a yearly price write fails until it's on. If the builder wants annual pricing, tell them to enable annual billing on the payments settings page first, then set the annual price. See "Annual pricing" below.
- **Never volunteer fee details.** Don't bring up Stencil's fees or commission in conversation.
  If the app builder asks directly what Stencil charges, point them to Stencil's pricing page rather
  than quoting numbers.
- **One Stripe-hosted flow does everything.** Stripe hosts identity verification (KYC) *and* bank
  account collection in a single onboarding flow. Once charges are enabled, subscription funds
  accumulate in the app builder's Stripe balance; once a bank account is verified, Stripe pays that
  balance out. There is no separate "payout-only" step — resuming the same hosted flow re-collects
  whatever is still outstanding, the bank account included.
- **Each app has its own connected account, keyed per app + workspace.** The app builder completes
  onboarding once *per app* — it is NOT shared across the other apps in the workspace. Adding
  subscriptions to a second app means onboarding that app separately.

## Before doing anything

Call `getPaymentStatus` first. It returns:
- `connect` — the app's Stripe account readiness, reconciled live from Stripe. Branch on its
  **booleans**, not on any status string:
  - `chargesEnabled` — `true` once the account can accept subscription charges.
  - `payoutsEnabled` — `true` once a bank account is connected and payouts can be sent.
  - `currentlyDue` — a list of items Stripe still needs; non-empty means onboarding is unfinished.
  - `disabledReason` — set when Stripe has restricted the account (surface it to the app builder).
- `tiers` — the app's plans in gating order (low→high), or an empty list if none is configured yet.
- `annualEnabled` — whether annual billing is switched on for the app.
- `trialDays` — the free-trial length for new subscribers, `0` when there is no trial.

> **Branch on booleans, never on status vocabulary.** `connect` also carries a `status` string, but
> its exact values change over time — do not hard-code checks like `not_started`, `pending`, or
> `accepting_no_payout`. Read `chargesEnabled` / `payoutsEnabled` instead; those are the contract.

### The build-first gate

The payment tools reach the payments service with the app's own per-app key, which only exists once
the app has been built or published at least once. Until then, `getPaymentStatus` (and every other
payment tool) returns an error like *"Payments service key unavailable — build or publish the app
once first."* This is expected for a brand-new app that has never deployed — do NOT relay the raw
error. Explain it plainly: *"I need to build or publish the app once before I can set up payments —
that provisions its payment credentials. Want me to do that first?"* Then proceed once the app has
shipped a build.

## Setting up payments

1. Call `getPaymentStatus` to check current state (handle the build-first gate above if it errors).
2. If `connect.chargesEnabled` is `false`, call `setupPayments` to get a Stripe-hosted onboarding
   link. Give the app builder the link and tell them to complete identity verification — that enables the
   app to accept charges. (If payments are already fully set up, `setupPayments` reports that instead
   of a link.)
3. Once `connect.chargesEnabled` is `true`, call `setSubscriptionPrice` with the plan name and price.
   For a single-plan app that's the whole plan step; for tiers, call it once per plan.
4. If `connect.chargesEnabled` is `true` but `connect.payoutsEnabled` is still `false`, remind the
   app builder to connect a bank account so they can actually be paid — call `getPayoutSetupLink` for a
   direct link. Funds accumulate in the Stripe balance until then, and Stripe imposes a deadline
   (~30 days after funds first arrive), so don't let it wait too long.

## A plan only goes live on the next build/publish — never claim otherwise

The deployed app reads its plans from a **snapshot baked in at build time**, not live at runtime. A plan you create or change with `setSubscriptionPrice` **after the last build is not in the live bundle yet** — the subscribe/pricing page silently bounces even though the plan is saved and synced with Stripe.

- `setSubscriptionPrice` tells you which case you're in — the staleness check spans **all** plans, so any unpublished plan change flags the whole app. When it returns `rebuildRequired: true`, the change is saved but the live app still runs the previous bundle. **Relay that verbatim — do not tell the app builder that app users can subscribe yet.** Say the plan is saved and the app needs one rebuild (or publish) first. Only when it returns `rebuildRequired: false` may you say the plan is live.
- A **publish alone** cures a stale snapshot (the redeploy/publish path re-bakes the current plans), so the app builder does not need a full rebuild — just get the app republished once after the plans are set.
- **Mandatory new-app sequence:** `build → configure the plans → rebuild (or publish)`. A brand-new app must be built before a plan can be created (payments tooling is gated until the first build), so plans are always created *after* that first build and the app must be built/published once more before subscribe works. Never hand off a just-configured new app as "ready to subscribe" without that second build.

### Stripe verification takes a minute or two

After the app builder completes the Stripe-hosted onboarding and tells you they're "done", `getPaymentStatus` often still reports `connect.chargesEnabled: false` for **~1–2 minutes**. Stripe verifies the details in the background and flips the account to ready a little later. This dead moment is normal — it is **not** a failure and does not mean the app builder did anything wrong.

When the app builder says they've finished but `getPaymentStatus` is still not ready:
- **Do NOT imply it failed, and do NOT call `setupPayments` again or re-send the onboarding link.** Handing them a fresh link reads as "your first attempt didn't count" and sends them back through onboarding they already completed.
- Tell them plainly: **"Stripe is verifying — this usually takes a minute or two."**
- Wait briefly, then call `getPaymentStatus` again. Re-check once or twice before concluding anything is wrong.
- Only if it is still not ready after a couple of re-checks should you escalate — and then offer to re-open the onboarding link so they can see any outstanding requirements Stripe is still asking for, rather than restarting from scratch.

## Pricing

- Minimum $0.50 per price (monthly or yearly).
- Specify `priceCents` for a monthly price (e.g. $9.99/mo = `priceCents: 999`). A plan needs at least one price: pass a monthly price, a yearly price, or both. For a **yearly-only** plan omit `priceCents` and set only `yearlyPriceCents`.
- Set `position` when you want a specific plan order — lower numbers sit lower in the hierarchy. If you leave it out, new plans append to the end.
- Changing a price updates that plan's subscribers on their next renewal (Stripe handles the transition).

### Annual pricing

- A plan's annual price is set with `setSubscriptionPrice`'s `yearlyPriceCents` — but only after the app builder switches **annual billing** on in the app's payments settings page. This holds for a yearly-only plan too. You can't switch it on from chat; if the toggle is off, the write fails and you should tell the builder to enable annual billing there first.
- When the builder asks for an annual option, a good default discount is roughly **two months free (~17% off)** the monthly price × 12 — e.g. $10/mo → about $100/year. Suggest that only when they ask for annual pricing; don't push it otherwise.

### Free trial

- `setFreeTrial` sets the number of free days (1–90) new subscribers get before their first charge, on **every** plan — there is no per-plan trial. `days: 0` turns it off. The builder can also set it on the payments settings page.
- **Card upfront, always.** Checkout still collects the card; Stripe charges it automatically when the trial ends and the subscription simply carries on. There is no card-less trial. The app treats a trialing subscriber as subscribed from the moment they check out — nothing to gate differently, but the app must *show* it differently (see "Billing-page wording" below).
- **A trial is live the moment you set it — no rebuild, like a coupon.** Don't tell the builder to publish first. It applies to new checkouts only; existing subscribers are untouched.
- **Coupons still apply; the discount kicks in after the trial.** Checkout keeps the promo-code field (and honours a pre-applied code) whenever the app has a live coupon, trial or not. Stripe runs the trial first and applies the discount to the invoices that follow, and its checkout page shows the combined terms itself — pricing-page copy only needs the trial and the base price.
- **Pricing-page wording:** when `trialDays` is above `0`, the plan cards should say "N days free, then $X/mo" (and "then $Y/yr" for annual) so the app user knows the card is charged later. If a trial is switched on after the pricing page was built, offer a small copy update — the checkout itself already honours the trial without a rebuild.
- **Billing-page wording:** for the whole free period `getSubscription` returns `status: "trialing"`, and `currentPeriodEnd` is then the end of the trial — the date of the **first charge**, not a renewal. The billing page must say so: a "Free trial" status pill in its own tone (not the "Active" one) and "Free trial — first charge of $X on <date>", never "Active" or "Renews". Once the app user has cancelled during the trial (`cancelAt` set): "Trial ends <date> — you will not be charged". The snippet is under "Showing subscription status" in Part 2 §3; it is the billing-page counterpart of the pricing-page line above.
- Stencil emails the subscriber in the app's name when the trial starts (plan, trial length, first-charge date and amount, where to manage or cancel) and again three days before it ends. The builder configures nothing in Stripe for this.

## Managing plans

- To add or change a plan, call `setSubscriptionPrice` — it's keyed by plan **name**: reusing an existing name updates that plan in place, a new name adds a plan (up to four).
- To remove a plan, call `removeSubscription` with the plan `name` (the name is optional only when the app has exactly one plan). This archives its Stripe product; existing subscribers on it complete their current period.

## Discount codes

A discount code is a string an app user types when they subscribe — `LAUNCH20`, `FRIENDS` — and it comes off their subscription price. You create and manage these here, in chat; the builder never has to open Stripe. App code can also **pre-apply** a code at checkout so the app user sees the reduced price with nothing to type — see `checkout` in Part 2.

- `createCoupon` makes one. It needs the `code` (3–32 characters, letters, digits, dashes and underscores — it's stored uppercase), either `percentOff` or `amountOffCents`, and a `duration`.
- **Duration is the whole point — always confirm which one they mean.** `once` = the first payment only, `repeating` with `durationInMonths` (1–36) = that many months of payments, `forever` = every payment for as long as they stay subscribed. "20% off" is ambiguous; ask if they haven't said.
- `planName` limits a code to one plan, matched by name. Leave it out and the code works on every plan. That plan has to be set up in Stripe already.
- `maxRedemptions` caps how many app users can ever use the code, and `redeemBy` (`YYYY-MM-DD`) is the date it stops working. Both optional; suggest a limit or an expiry when the builder is running a launch or a promotion.
- **A code works the moment you create it — no rebuild, unlike a plan.** Don't tell the builder to publish first.
- `listCoupons` shows every live code with its terms and how many app users have redeemed it. Use it before answering "what discounts do I have running?" rather than guessing from the conversation.
- `removeCoupon` takes a code down (the `code` is optional only when the app has exactly one). Nobody new can redeem it; **app users who already redeemed it keep their discount for its full duration** — say that, because builders expect removal to claw it back.

**Terms are fixed once the code exists.** There's no editing a discount's percentage, duration or plan. If the builder wants different terms, create a new code and take the old one down — tell them that's what you're doing, since anyone holding the old code loses it.

When to suggest one: a launch, a first cohort of app users, winning back someone who's about to cancel, or a partner deal. Don't push discounts unprompted on a builder who's just setting pricing up.

## Receipts are automatic

If the app builder asks *"do my customers get a receipt?"* (or a variant), the answer is **yes, automatically** — you don't set anything up and app code doesn't send it. Stencil emails the payer a receipt on every subscription charge (signup and each renewal) and on every one-time sale, the moment Stripe confirms the payment. It's sent from the app's own email domain when the builder has connected one (otherwise Stencil's shared sender), and links Stripe's own receipt. Nothing to configure, and the app should not build its own receipt email on top of it.

# Part 2 — Building with payments (app code)

Your job in code is to (1) check whether a tier exists, (2) gate the right surfaces, and (3) wire up the upgrade and subscribe flows.

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

## 2. `paymentsEnabled` — read this carefully

Both `requireSubscription` and `getSubscription` return a `paymentsEnabled` boolean alongside the subscription data. This flag indicates whether the workspace has Stripe connected and payments active.

**When `paymentsEnabled` is `false`, all gating is bypassed** — every user should be treated as subscribed.

**Always factor `paymentsEnabled` into your "is this user active?" check:**

```ts
const isPro = !paymentsEnabled || sub?.status === "active" || sub?.status === "trialing";
```

Never gate on `sub?.status === "active"` alone — that locks everyone out when payments are disabled.

## 3. Server functions (`~stencil/payments/server`)

The payments server functions live in `~stencil/payments/server`. Import only what you use.

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

### Showing subscription status — `"trialing"` and `sub.cancelAt`

Both count as active for gating, and both change what you display. Never collapse them into one "Active — renews on <date>" line:

- `sub.status === "trialing"` for the whole free period, and `currentPeriodEnd` is then the end of the trial — the date of the **first charge**, not a renewal. An app user who reads "Active — renews 9/26" has no way to tell they are in a free period, or that 9/26 is the first time their card is charged. Show a "Free trial" pill in its own tone, and name the first charge date and amount.
- `sub.cancelAt` (a date, or `null`) is set while a cancellation is pending: the app user cancelled, but the subscription stays entitled until that date, then ends instead of renewing (during a trial, it ends without ever charging). **It does not change the active check above.** If it isn't visible, the app user who just cancelled sees "renews on …" and thinks the cancellation failed.

```tsx
import { tiers } from "~/generated/tiers";

const plan = Object.values(tiers).find((t) => t.id === sub?.tierId);
const price = plan ? `$${(plan.priceCents / 100).toFixed(0)}` : "";
const periodEnd = sub ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "";

{sub?.status === "trialing" ? (
  sub.cancelAt ? (
    <p>Trial ends {new Date(sub.cancelAt).toLocaleDateString()} — you will not be charged</p>
  ) : (
    <p>Free trial — first charge of {price} on {periodEnd}</p>
  )
) : sub?.cancelAt ? (
  <p>Cancelled — access until {new Date(sub.cancelAt).toLocaleDateString()}</p>
) : (
  sub && <p>Renews {periodEnd}</p>
)}
```

The status pill follows the same split: "Free trial" for `"trialing"`, "Active" for `"active"`, and a cancelling state whenever `cancelAt` is set. The pricing page already says "N days free, then $X/mo" (Part 1, Free trial); the billing page is where the app user checks back later, so it must tell the same story.

### `checkout` — start a Stripe checkout session

Call from a form `action` (POST). Throws a redirect to Stripe-hosted checkout. Do not call client-side. **`checkout` requires a session** — it resolves the payer from the signed-in app user and redirects a logged-out caller to `/login`. The only no-session checkout is `payFirstCheckout`, and only on a payment-required app (see §4).

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

**Pre-applying a discount code.** Pass `promoCode` to open checkout with one of the app's discount codes already applied: the app user sees the reduced price on the payment page with nothing to type, and the manual promo-code field is hidden (the payment page allows one or the other, never both). Use it when the builder runs a promotion — a promoted plan button, a sales-page CTA, or a link carrying the code as a query param (`?c=LAUNCH20`) that the action passes through. Never hand-build a "copy this code and paste it at checkout" box.

```ts
export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const promoCode = String(form.get("promoCode") ?? "") || undefined;
  await checkout(request, context, {
    tierId: tier!.id,
    promoCode,
    successUrl: new URL("/app", request.url).toString(),
    cancelUrl: new URL("/upgrade", request.url).toString(),
  });
}
```

The code must be one of the app's own live codes (check `listCoupons`) — an unknown, removed or expired code makes `checkout` throw rather than silently charging full price, so validate or fall back to a codeless checkout when the code comes from a URL. `payFirstCheckout` accepts the same option.

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

Only render the "Manage billing" button when `isPro` is `true` — free users will just get redirected to `/upgrade`. The billing page that hosts this button is also where the plan's status and next date are shown; render those per "Showing subscription status" above, so a trialing app user sees "Free trial — first charge of $X on <date>" there and not "Active — Renews".

## 4. Upgrade page

**The `/upgrade` route is mandatory the moment a subscription plan or selling is enabled.** `requireSubscription`, `manageSubscription`, and seller onboarding all hard-redirect unsubscribed app users to `/upgrade` — if the route isn't registered, every one of those redirects lands on a 404 and nobody can subscribe. Before finishing any payments turn, check `app/routes.ts` for the `upgrade` route; if it's missing, add it (copy the scaffold below, or register a route that redirects to the app's own pricing page).

**Pick the scaffold by plan count — never guess it.** Read the count from `getPaymentStatus`
(`tiers.length`; in app code, the entries of `~/generated/tiers`):

| Plans | Session flow (open / invite-only) | Pay-first (`payment-required`) |
|---|---|---|
| 1 | `upgrade.tsx` | `upgrade-pay-first.tsx` |
| 2+ | `pricing.tsx` | `pricing-pay-first.tsx` |

The pay-first column applies only when `getAuthConfig` reports `payment-required` (see the
pay-first section below). **A multi-plan app must never ship a single-plan scaffold**: those
render `tier` — the first plan only — and silently hide every other plan.

**One plan** — copy the upgrade scaffold; do not build the page from scratch:

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

**Two or more plans** — copy the pricing scaffold instead:

```bash
cp /opt/design/scaffolds/subscriptions/pricing.tsx app/routes/pricing.tsx
```

It renders every plan from `tiers` in gating order, with a monthly/annual toggle when a plan
carries both prices. The gates still redirect to `/upgrade`, so register the pricing page and
keep `/upgrade` as a redirect to it:

```ts
route("pricing", "routes/pricing.tsx"),
route("upgrade", "routes/upgrade.tsx"),   // gates land here — redirect to /pricing
route("subscribe", "routes/subscribe.tsx"),
```

```ts
// app/routes/upgrade.tsx
import { redirect } from "react-router";
export const loader = () => redirect("/pricing");
```

Its plan cards post `tierId` and `interval`, so the `/subscribe` action reads both from the
form instead of hard-coding `tier`:

```ts
export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  await checkout(request, context, {
    tierId: String(form.get("tierId")),
    interval: form.get("interval") === "year" ? "year" : "month",
    successUrl: new URL("/app", request.url).toString(),
    cancelUrl: new URL("/pricing", request.url).toString(),
  });
}
```

### Pay-first: the payment-required front door

An app can make a completed purchase the only way to get an account: access mode
`payment-required`, set with `configureAuth` (`accessMode: "payment-required"`). When the builder
asks for "paid only", "no free accounts", or "pay to join", **set the mode with `configureAuth`
and use the scaffolds below — never hand-roll a gate.** Do not block signup in app code, invent a
beta list, or bounce fresh accounts to a paywall: the hosted signup page of a payment-required app
already sends visitors to `/upgrade`, so `/upgrade` is the front door and must work logged out.

The deployed app cannot read its own access mode, so the right upgrade page is chosen at build
time: call `getAuthConfig`, and only when it reports `payment-required` copy the pay-first variant
instead of the plain scaffold. **An open or invite-only app must never ship the email field** —
the payments worker refuses its pay-first checkout, and its logged-out visitors belong at
`/signup` or `/login`.

Pick the pay-first scaffold by plan count, exactly as in the table above. Both variants are
copied to `app/routes/upgrade.tsx` — `/upgrade` is the front door the hosted signup redirects
to, so the pay-first page lives there directly, with no `/pricing` redirect split:

```bash
# one plan
cp /opt/design/scaffolds/subscriptions/upgrade-pay-first.tsx app/routes/upgrade.tsx
# two or more plans
cp /opt/design/scaffolds/subscriptions/pricing-pay-first.tsx app/routes/upgrade.tsx
# either way — the success page
cp /opt/design/scaffolds/subscriptions/subscribe-success.tsx app/routes/subscribe.success.tsx
```

```ts
route("upgrade", "routes/upgrade.tsx"),
route("subscribe/success", "routes/subscribe.success.tsx"),
```

The pay-first page's forms post to its own action, so the `/subscribe` resource route is
not needed. How the flow works:

- A **logged-out** visitor sees the plan — every plan, on the multi-plan page — and **one email
  field** (shared across the plan cards), not a signup form. The action
  calls `payFirstCheckout(context, { email, tierId, interval?, successUrl, cancelUrl })` with the
  collected address. `checkout()` still requires a session, so never wire it for this branch.
- Stripe locks its checkout email to that address. On payment the platform creates the account —
  the purchase itself is the signup; the app never creates the account.
- The success page signs the buyer **straight in, no email hop**: Stripe fills the `session_id`
  param `payFirstCheckout` puts on the success URL, and the scaffold's loader claims it with
  `claimPayFirstCheckout(context, sessionId)` and redirects into a signed-in session. Its
  check-your-email screen renders only when the claim is refused (reused or expired link) — the
  platform's emailed sign-in link is the recovery path for a closed tab or another device. Point
  `successUrl` at `/subscribe/success` (the scaffold already does, carrying `?email=` for the
  fallback).
- A **signed-in** visitor on the same page goes through `checkout()`, unchanged.
- An address whose account the builder removed is refused at checkout creation, before any Stripe
  page — `payFirstCheckout` throws with that reason, and the scaffold shows it inline.

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

## 6. Displaying plan details in UI

Use `tier` directly from `~/generated/tiers`:

```tsx
import { tier } from "~/generated/tiers";

// Price display
const price = tier ? `$${(tier.priceCents / 100).toFixed(0)} / ${tier.interval}` : null;

// Benefits list
{tier?.benefits.map((b) => <li key={b}>{b}</li>)}
```

## 7. Single-plan vs multi-plan

Most apps have one plan — for those, always use the `tier` shorthand and pass `tier!.id` to `requireSubscription`. A multi-plan app (up to four, ordered low→high) reads `tiers` instead and ships the pricing scaffolds (§4); gate each surface with the lowest plan that unlocks it — a subscriber on a higher plan qualifies automatically. If `tier` is `null`, don't pass `undefined` as a workaround — that accepts any active subscription and is semantically wrong. Don't call `requireSubscription` at all until a plan exists.

## 8. Payment receipts are automatic — do not send your own

The platform sends the payment receipt email itself, on Stripe's settled-payment webhook: a new receipt on every subscription charge (signup and each renewal) and one on every one-time sale. It goes to the payer, from the app's own email domain when the builder has connected one (otherwise the shared sender), and links Stripe's own receipt. **No wiring is required and app code must not send its own receipt** — adding one via the `email` skill (`~stencil/email`) just double-sends. Only add a *different* transactional email (e.g. an order-shipped notice) through that skill.

## 9. Platform-owned tables are read-only

The tables `subscription`, `user`, `session`, `account`, `verification`, and every `oauth_*` table are platform-owned: `subscription` mirrors Stripe, the rest belong to the auth layer, and the platform rewrites all of them from its own sources. Reading them is always fine. **Never INSERT, UPDATE, or DELETE them** — via `dbExecute`, raw SQL, or anything else. A hand-written row (for example a comped `subscription` marked active) is a forgery: it lies to every gate that reads it, and the platform will overwrite it.

If a platform gate blocks something the builder wants — most commonly "let these app users in without paying" — the answer is a Stencil-side path, never a row and never switching the gate off:

- **Never disable or bypass a paywall as a workaround.** Free, beta or comped access for chosen app users is a dashboard action, not app code: in **Settings → Users**, the builder opens a person and clicks **Give free access** (choosing the plan and an optional end date), or uses **Add person** on an invite-only or pay-first app to create the account with a plan and get a sign-in link. The grant writes the platform's own `subscription` row, so `requireSubscription` and `getSubscription` honour it with no app changes. Send the builder there — do not invent a "beta mode", a comp flag, an allowlist, or comment the gate out. Bulk grants ("everyone who signed up before a date") are not offered yet; say so and point to Stencil support.
- **Never claim Stencil is working on or restoring something.** State what the platform does today; if you don't know, say you don't know.

# Rules

In conversation:

- Default to a single plan; only build tiers when the app builder asks. The cap is four plans per app (the tools enforce it).
- Never claim a plan is live for app users while `setSubscriptionPrice` reports `rebuildRequired: true` — the live bundle is stale until the next build/publish. See "A plan only goes live on the next build/publish" above.
- You can't enable annual billing from chat — it's a payments-settings-page toggle, off by default. Send the builder there when they want annual pricing.
- Branch on `chargesEnabled` / `payoutsEnabled`, never on the `status` string.
- Never send an app builder to the Stripe dashboard to create, edit or cancel a discount code — `createCoupon`, `listCoupons` and `removeCoupon` do all of it from chat.
- A paid-only app is `configureAuth` with `accessMode: "payment-required"` plus the pay-first scaffold matching the plan count (see §4 in Part 2) — never a hand-rolled gate.
- The Payouts settings page is where the app builder manages bank details for this app.

In app code:

- **Never build custom Stripe integration.** No `stripe.js`, no `loadStripe()`, no `STRIPE_SECRET_KEY`.
- **Never store subscription state yourself.** Use `getSubscription()` / `requireSubscription()` — they read from the platform's D1 table.
- **Platform tables are read-only** (see §9). Never INSERT/UPDATE/DELETE `subscription`, `user`, `session`, `account`, `verification`, or `oauth_*`.
- **Never disable or bypass a paywall, and never claim Stencil is working on something** (see §9) — free access for a chosen app user is given in Settings → Users.
- **Always use `!paymentsEnabled || ...` in your active check.** Never gate on `sub?.status === "active"` alone.
- **`sub` is always nullable** — it's `null` any time the user hasn't subscribed. Don't use `sub === null` as a signal that payments are disabled; use `paymentsEnabled` directly.
- **`checkout()` and `manageSubscription()` must be called from server actions**, not loaders or client code. Both throw a redirect.
- **Pick the upgrade/pricing scaffold by plan count** (the table in §4): one plan → the upgrade scaffolds, two or more → the pricing scaffolds. A multi-plan app must never ship a single-plan scaffold — it silently hides every plan but the first.
- **The pay-first email field belongs only to a payment-required app.** Check `getAuthConfig` before copying `upgrade-pay-first.tsx` / `pricing-pay-first.tsx`; an open or invite-only app uses the session scaffolds and `checkout()` (see §4).
- **`tier` can be null.** Always null-check before using (`tier?.id`, `tier!.id` only after confirming it exists).
- The upgrade page lives at `/upgrade` — this is the default redirect target for ungated users. Don't change this path, and **don't skip the route**: it is mandatory whenever a plan or selling exists (see §4). Check `app/routes.ts` before finishing any payments turn.
- **A trial must read as a trial.** `"trialing"` is active for gating, never for display: the billing page says "Free trial — first charge of $X on <date>", not "Active — Renews" (see §3). Before finishing a payments turn on an app with `trialDays` above `0`, open the billing page as a trialing app user and confirm that wording.
- **Never send your own payment receipt.** The platform sends it automatically on payment (see §8); a receipt built with the `email` skill only double-sends.

Both halves:

- **A price that arrives in the request is never charged.** Subscription prices resolve on the server
  from `~/generated/tiers`; a one-off sale's `amountCents` is re-read from the stored item inside the
  action (the `selling` skill). A hidden form field, JSON body, or query string is something the payer
  can edit.
- Receipts are automatic — the platform emails the payer on every charge. Don't tell a builder to add one, and don't have the app send its own.
