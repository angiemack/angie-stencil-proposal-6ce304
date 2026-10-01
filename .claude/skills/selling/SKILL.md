---
name: selling
description: Let the app's own users sell to and get paid by THEIR customers — one-time card payments or recurring subscription plans, where each seller is the merchant of record and is paid directly to their own bank account. Use when the app builder wants their app users to charge people, e.g. "let my photographers sell photo packages to parents", "let tutors take payment from students", "add a buy button so sellers get paid", "marketplace where my users sell to their customers", "let coaches sell a monthly membership to their clients", entitlement / "has this person paid" checks, or a seller dashboard. DIFFERENT from the `payments` skill — `payments` is the app builder charging their own app users a subscription; `selling` is the app's users charging their own customers, once or on a plan.
allowed-tools: getPaymentStatus setupPayments getPayoutSetupLink setSubscriptionPrice
metadata:
  agents: [chat, builder]
---

You help app builders add **selling** to an app: the app's own users (**sellers**) accept card
payments from **their** customers (**buyers**). Each seller is the merchant of record and is
paid directly on their own Stripe account. There are two ways to sell, and a seller can use both:

- **One-time** — pay once for an item (`sellerCheckout`, gated with `hasPurchased`). Buyers can be guests.
- **Subscriptions** — the seller's own recurring plans, monthly or yearly (`sellerSubscribe`, gated with
  `hasActiveSubscription`). **Buyers must be signed in**; see "Seller subscriptions" below.

Everything from here to "Seller subscriptions" is about one-time sales unless it says otherwise.

**Buyers need no app account.** Guest checkout is the default: the buy page collects the buyer's
email, they pay on Stripe Checkout, and that email is their whole identity — `hasPurchased({ reference,
buyerEmail })` is the gate. Stencil stores no token, link, or account for a guest; **how a buyer gets back
to what they bought is the app's design** (a link the app emails with `~stencil/email`, an access code,
or a sign-in — see the rules). Only put buying behind login if the app builder explicitly wants buyers to
register — and then roles and gating for registered buyers are the app builder's own job.

**Disambiguate first — this is not the app's own subscription.** The other `payments` skill is for *the app
builder charging their app users* (a subscription plan for the app). This skill is for *the app's
users charging their customers*. Anchor example: a school-photography app where each photographer
sells photo packages to parents — the parent→photographer payment. If the app builder means "charge
my users to use the app", that's the `payments` skill, not this one.

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

Derive each mark from live state, never guess: steps ① and ② from `getPaymentStatus` (`connect` / `tiers`); step ③ is each seller's own onboarding, surfaced by `getSellerStatus` and completed inside the app. **This skill owns step ③** — steps ① and ② live in the `payments` skill.

## The first selling request on an app — offer a walkthrough

Selling is the most involved feature an app builder can add, and builds go better when they hold the whole picture first. The **first** time they ask for it on an app that has no selling yet — nothing in the app imports `~stencil/payments/selling` — offer the choice, in one short message, before writing any code. Roughly:

> Payments is the most involved thing you can add to an app — there are several moving parts (who verifies their identity with Stripe, who gets paid, what your app users pay you vs. what their customers pay them, how buyers get back to what they bought). Builds go much better when you know how it fits together. Want a two-minute walkthrough first, or should I go ahead and build it now?

Then **wait for the answer** — like the "anything that spends money needs a yes first" rule, this is a conversation turn: no code until they choose. First request only — never re-run the offer on a later turn about a plan change, a bug, or a seller who is stuck. That is a fix, not an introduction.

**If they want the walkthrough**, keep it a short spoken explanation — plain words, no code, no fee numbers, not a wall of text. Cover the pieces that apply to what they asked:

- The three-actor model above — the canned wording, as written.
- Sellers do their own Stripe onboarding: real KYC and a real bank account, and it takes a minute or two to flip ready after they finish.
- Buyers pay as guests by default — their email is their identity, and the app decides how they get back to what they bought (a link the app emails, an access code, a sign-in). Or the builder can require buyers to register, and then roles and gating are theirs to build.
- Sellers see their money **only** in the hosted seller dashboard inside the app, never in a Stripe login of their own; refunds happen there too. Stencil sends the receipt, Stripe does not.
- What the builder does themselves (connect Stripe from the payments panel in their app settings) and what each seller does (their own KYC).

End with "ready to build?" and build on yes.

**If they say build now**, build — the "After building" message below already carries the facts they most need.

## The one-time SDK in `~stencil/payments/selling`

One-time selling is done through nine template functions (the subscription functions are listed under
"Seller subscriptions"). No Stripe objects, ids, or card data ever touch
the app. Import from `~stencil/payments/selling`:

| Function | What it does |
|---|---|
| `onboardSeller(request, context, opts?)` | "Start accepting payments" — throws a redirect to Stripe-hosted onboarding/KYC. Also the "fix it" entry when a seller is `restricted`. First-time onboarding needs `opts.country` (see the country rule). |
| `getSellerStatus(request, context)` | `{ status: none \| onboarding \| active \| restricted, currentlyDue, … }`. The *current user's* own status — gates the seller's tools. Never redirects. |
| `getSellerReadiness(context, { sellerUserId })` | Can *this* seller take a payment right now? → `{ ready }`. Public — never authenticates or redirects; for the loaders of buy pages, where the viewer is a buyer. Fails closed. |
| `sellerCheckout(request, context, opts)` | "Buy" — the buyer pays a seller; no account needed. `amountCents` and `sellerUserId` come from the stored item the action loads by `reference` — never from the request. Signed in they're identified by their user id; signed out they check out as a guest and **`buyerEmail` is required** (collect it on the buy page; missing → back to `cancelUrl` with `?checkout_error=buyer_required`). Throws a redirect to Stripe Checkout. Enforces $5 USD minimum server-side. When the checkout can't start (seller not ready, below minimum, …) it redirects back to `cancelUrl` with `?checkout_error=<code>` instead of throwing. |
| `guestBuyerRef(email)` | The buyer ref a guest is stored under (`email:<normalized email>`). Only needed when you store buyer refs yourself — `hasPurchased`/`getPurchases` build it from `buyerEmail`. |
| `hasPurchased(request, context, { reference, buyerEmail? })` | One-line entitlement check → `boolean`. Resolves the buyer as an explicit `buyerRef` alone, else guest `buyerEmail` and the signed-in session together (true if either owns it); returns `false` for a visitor with none — it never redirects to login. |
| `getPurchases(request, context, { buyerEmail? })` | The buyer's paid purchases → `Purchase[]`, same buyer resolution — everything a guest bought under their email. |
| `sellerPanelLink(request, context)` | Throws a redirect that logs the seller straight into their hosted dashboard (one click, no password). Call it with no options: never pass the app's own URL — the dashboard is on its own origin and the seller stays there; `returnUrl` is an `onboardSeller` concept only. |
| `disconnectSeller(request, context)` | Removes the seller's account and closes their Stripe account so they can start over (e.g. wrong onboarding country). Returns `{ removed, reason? }` — `removed: false` with a `reason` when they've already taken payments. |

`reference` is **your own id** for the thing being sold (a package id, a listing id, a row id) — it's
what you pass to `sellerCheckout` and later to `hasPurchased`. Refunds, disputes, payouts, balance,
and revenue reporting are **not** in the SDK — sellers do those in the hosted dashboard
(`sellerPanelLink`), which is the **only** place a seller can issue a refund. Sellers have no Stripe
dashboard login of their own (the hosted panel is a magic-link view of their Connect account), so
never tell an app builder a refund can be done "in Stripe" — the hosted panel is the only path.

## The rules that matter

- **The app builder earns nothing from sellers' sales.** Sale money goes to the seller. The app
  builder's only revenue is the app's subscription (the `payments` skill). There is no revenue-share
  or commission mechanism for the app builder — if they ask to take a cut of their app users' sales,
  say plainly that it isn't supported and steer them to subscription pricing as the way to
  monetize. Never claim or imply the app builder earns from sales, and never promise a cut as a
  future feature.
- **Never volunteer fee details.** Don't bring up Stencil's fees or commission in conversation.
  If the app builder asks directly what Stencil charges, point them to Stencil's pricing page rather
  than quoting numbers.
- **Eligibility: only a paying subscriber can become a seller.** Selling requires the app to have a
  subscription plan (set up with the `payments` skill) and the seller to be on it — including free
  apps, which have no exceptions here. `onboardSeller` enforces this and redirects to `/upgrade` if
  the app user isn't subscribed. If the app has no plan yet, set one up first (the `payments` skill).
- **Onboarding gate: no selling UI until `active`.** Always call `getSellerStatus` first and show the
  seller tools (a buy button configured by that seller, "manage sales", etc.) only when
  `status === "active"`. For `none` show "Start accepting payments" → `onboardSeller`; for
  `onboarding`/`restricted` show a "finish setup" nudge → `onboardSeller` again (it resumes and, when
  restricted, re-collects what's missing). A seller returns from Stripe to `returnUrl` (default
  `/app/sell`) possibly still pending: `chargesEnabled` takes **~1–2 minutes** to flip after KYC, so
  `status` stays `onboarding` for a bit even when they've finished. On the setup page, treat
  `onboarding` as *verification in progress*, not failure — **always set the expectation** ("Stripe is
  verifying your details — usually a minute or two; this page updates when it's done") and re-check
  status without the seller re-doing KYC, via light polling and/or a "Check again" affordance. Never
  bounce a returning seller straight back into `onboardSeller` as if they hadn't started.
- **Buyer-facing gate: check the seller, not the viewer.** `getSellerStatus` reads the *current
  user*, so it cannot gate a page where a buyer views someone else's item. In the loader of every
  buy surface, call `getSellerReadiness({ sellerUserId })` and, while `ready` is `false`, replace
  the buy button with a plain "not accepting payments yet" notice — a shared buy link often gets
  opened before the seller finishes Stripe onboarding, and that visit must degrade gracefully,
  never crash. Also read `?checkout_error` in the same loader and render it as a notice:
  `sellerCheckout` redirects back to `cancelUrl` with that code whenever a checkout can't start.
  Never let a failed checkout fall through to an error boundary.
- **Default to guest checkout — never require (or create) a buyer account.** Buy pages work logged
  out and collect the buyer's email (required for a guest — it is their identity and enables the
  repeat-purchase check). Ask the app builder only if they *explicitly* want buyers to register, and state
  the cost plainly: registered-buyer roles and the routes gated on them are then theirs to design and
  build. Never create an app account on the buyer's behalf at checkout — the guest flow exists
  precisely so no account is needed.
- **The buyer's way back is the app's design — Stencil stores no link or token for guests.** The
  receipt Stencil sends carries the amount and Stripe's receipt, nothing more. Right after payment the
  success URL you passed carries what your landing page needs (`?ref=` + `?buyer=` in the scaffold).
  For anything the buyer must reach *later* (digital downloads, a gallery, a booking), build the way
  back in the app and offer the pattern to the builder: **(a) your own link** — on the confirmed success
  page mint a random token, store it on your order row with the buyer's email, and email
  `…/purchases/<token>` with `createEmail` from `~stencil/email`; that route looks the token up, then
  gates with `hasPurchased({ reference, buyerEmail })` so a refund still revokes; **(b) an access code**
  the buyer already holds (a gallery code, a booking number) plus their email; **(c) a sign-in** when
  the builder wants registered buyers. Never deliver goods from an email read straight off an
  untrusted query string — that is what your token, code, or sign-in is for.
- **Gate buyer access with `hasPurchased`.** Put the check in the loader of any route that delivers
  what was bought, passing the guest's `buyerEmail` once your own token/code/sign-in has proven it.
  When it returns `false`, send the viewer to the buy page with a short notice. It reads live from paid orders, so a refunded or disputed-lost purchase flips to
  `false` automatically — you never write revocation logic.
- **Right after checkout, "confirming" — not "not purchased".** Payment confirmation is
  webhook-driven and can lag a few seconds, so the success page must render a light "confirming your
  payment" state that re-checks (see the purchase-success scaffold), never a hard failure the moment
  the buyer lands. Poll `hasPurchased` with the same `buyerEmail` you passed to `sellerCheckout`, and
  stop after about 60 seconds with "Payment received. Your confirmation is on its way by email"
  instead of spinning forever.
- **Collect the seller's country before first onboarding.** A seller's Stripe account is created in
  a country that is **fixed forever** — Stripe can never change it later. So the very first time a
  seller onboards, your UI must ask which country their business is in and pass it as
  `onboardSeller(request, context, { country })` (ISO 3166-1 alpha-2, e.g. `"GB"`). Put a country
  select on the `/app/sell` setup page, shown only when `status === "none"`. Tell them plainly it
  can't be changed and that they'll be paid in USD converted to their local currency. An unsupported
  country throws — catch it and let them pick another (don't leave them on a crashed page). Once the
  account exists, `country` is ignored, so resuming or fixing onboarding needs nothing extra.
- **A buyer-supplied amount is never charged.** The platform charges exactly the `amountCents` the
  action passes and checks it against nothing but the $5 floor, so the action must derive the amount
  (and `sellerUserId`) from server-side state — re-read the item by `reference` inside the action
  and pass its stored price. Never put the price, the seller id, or a discount in a hidden form
  field, and never read them from form data, a JSON body, or the query string: a shopper can edit
  anything their browser sends, pay $5 for a $500 order, and the order is still recorded as paid.
  The same holds for totals built from several items or a discount — compute them on the server from
  stored prices and a server-validated code. Take the `reference` from the route param, then load.
- **$5 USD minimum, USD only.** `sellerCheckout` amounts are in **cents** (`amountCents: 2500` = $25);
  the worker rejects anything under 500. Charges are USD and card-only in every country — a seller
  outside the US is still paid in their local currency (Stripe converts at payout).
- **Log access as dispute evidence.** When a buyer opens or downloads what they bought, record a
  timestamped access row (a small entity: buyer, `reference`, `accessedAt`). If the buyer later
  disputes the charge, that access log is the seller's evidence — surface it in the dashboard flow.
  Add this whenever the thing sold is digital/deliverable.

## Seller subscriptions — recurring plans a seller sells

A seller can sell their own recurring plans (a monthly coaching membership, a yearly class pass). The
seller onboarding, eligibility, country and live-money rules above all still apply. These functions, also
in `~stencil/payments/selling`:

| Function | What it does |
|---|---|
| `createPlan(request, context, { name, description?, amountCents, interval, position? })` | The signed-in seller creates a plan; `interval` is `"month"` or `"year"`. Returns `{ ok: true, plan }` or `{ ok: false, code, error }`. |
| `listPlans(request, context, { sellerUserId?, includeArchived? })` | A seller's plans in `position` order. Pass `sellerUserId` on a public pricing page; omit it for the signed-in seller's own. |
| `updatePlan(request, context, { planId, name?, description?, amountCents?, position? })` | Edit a plan. Same result shape as `createPlan`. |
| `archivePlan(request, context, { planId })` | Stop new signups to a plan; current subscribers keep renewing. Plans are never deleted. |
| `sellerSubscribe(request, context, { sellerUserId, planId, successUrl?, cancelUrl? })` | "Subscribe" — throws a redirect to Stripe Checkout for the signed-in buyer. On a rejection it redirects to `cancelUrl` with `?checkout_error=<code>`. |
| `hasActiveSubscription(request, context, { planId })` | The gate → `boolean`. One read of the app's own database; `false` when signed out; never redirects. |
| `getSubscription(request, context, { planId })` / `getSubscriptions(request, context)` | The signed-in buyer's subscription(s): `planId`, `sellerUserId`, `status`, `currentPeriodEnd`, `cancelAt`, `active`. For status lines and "any plan from this seller" gates. |
| `manageSellerSubscription(request, context, { planId, returnUrl? })` | The "Manage billing" button — throws a redirect to Stripe's billing portal. |

The rules:

- **Subscribing needs a signed-in buyer.** Guest checkout is one-time only. On a pricing page, show
  signed-out visitors "Sign in to subscribe" (a link to `/login?returnTo=…`); `sellerSubscribe`
  without a session bounces back with `?checkout_error=buyer_required`. If the app builder wants guests
  to subscribe, say plainly that it isn't supported and offer a one-time product instead.
- **Gate on the server with `hasActiveSubscription`, never on the success redirect.** Put it in the loader
  of every subscriber-only route. Access comes from Stripe's confirmation, which can land a few seconds
  after the buyer returns, so the page the buyer lands on shows a "confirming your subscription" state
  that re-checks — never "not subscribed" the moment they arrive. To gate on *any* plan from one seller,
  use `getSubscriptions()` and match `sellerUserId` with `active`.
- **Access follows Stripe on its own.** A past-due subscriber keeps access while Stripe retries the card,
  and a cancelled one keeps it until the paid period ends. Never write expiry or revocation logic, and
  never write to the `seller_subscription` table — it is platform-owned like `subscription`.
- **"Manage billing" is the only billing UI.** Switching plans, updating the card, invoices and cancelling
  all happen in Stripe's portal through `manageSellerSubscription`. Never build a plan switcher, a cancel
  button or flow, or an invoice list. Show the subscriber their plan, its status and the next date
  (`currentPeriodEnd`, or "ends on" `cancelAt`) next to that button.
- **One subscription per buyer per seller.** A second `sellerSubscribe` to the same seller bounces with
  `?checkout_error=already_subscribed`. Show a current subscriber "Manage billing" instead of Subscribe
  buttons. Different sellers are independent.
- **Handle every redirect code.** Render `?checkout_error` (`buyer_required`, `already_subscribed`,
  `seller_not_ready`, `plan_not_found`) on the pricing page and `?billing_error` (`not_subscribed`) on
  the page with the Manage billing button, as notices — never an error boundary.
- **Plan management only for an `active` seller.** Show the create/edit/archive screen only when
  `getSellerStatus()` is `active`; otherwise send the seller to finish onboarding. Show a rejected write's
  `error` next to the form (`below_minimum`, `name_taken`, `plan_limit`, `seller_not_ready`, …).
- **What a seller can change.** A new price applies to **new subscribers only**; current subscribers keep
  the price they signed up at. The interval never changes — to go from monthly to yearly, archive the plan
  and create a new one. Say both in the plan editor. At most **10 active plans** per seller
  (`plan_limit`); archiving frees a slot. Plans are USD, with the same $5 minimum as one-time sales.
- **Plan prices come from the stored plan.** The buyer's form carries only the `planId`; the platform
  prices the subscription from the plan it stores, so a pricing page is safe to render from `listPlans`.
- **Sellers see subscribers and MRR in the hosted dashboard.** The Subscribers tab of the seller dashboard
  (`sellerPanelLink`) lists each subscriber with their plan and status, monthly recurring revenue, and
  recent cancellations; the seller can archive plans there too. Don't rebuild a subscriber list or revenue
  report in the app.

## Preflight: verify before build

**Mandatory.** Run these checks **in order** before you write a single page, and resolve each one
*interactively with the app builder* rather than building on top of a failure. This flow exists
because a sell page built on an app that can't actually sell yet is **dead on arrival** — the app
builder finds out by clicking a broken production app. Call `getPaymentStatus` once up front: it
returns `connect` (the workspace Stripe Connect account) and `tiers` (the app's subscription plans),
which cover checks (b)–(d).

(b) and (d) below name `getPayoutSetupLink`/`setupPayments` — composer tools, not something a build
turn writing code can call. If you're the conversation, use them directly. If you're mid-build and
either check fails, don't reach for a tool you don't have: stop, report plainly what's missing, and
say it's handled from the app builder's payments settings panel.

- **(a) App deployed at least once.** Selling calls the app's live API, so the app has to exist in
  production. A brand-new app you're building for the first time is fine — it deploys as part of this
  build. But if you're *adding* selling to an app that already exists yet has never been deployed,
  stop and flag it: get it deployed once, then come back and add selling.
- **(b) Stripe account onboarded.** Read `connect.chargesEnabled` from `getPaymentStatus` and branch
  on the **boolean**: `chargesEnabled === true` means the account can charge — proceed. Treat
  anything else (e.g. `not_started`, `none`) as **not onboarded**. Do NOT branch on exact
  status-string vocabularies — those strings change and must never be hard-coded here; the boolean is
  the contract. If the account is not onboarded: **STOP.** In conversation, hand the app builder the
  link from `getPayoutSetupLink`; mid-build, just report that Stripe isn't connected yet — either way,
  explain that any pages built before Stripe onboarding completes are dead on arrival (the seller
  can't be paid and buyers can't check out). Offer to continue the build once onboarding is done.
- **(c) Subscription plan exists *and is live in the deployed bundle*.** Sellers must be paying
  subscribers, so the app needs a subscription plan. Check `tiers` from `getPaymentStatus`. If there
  is no plan, offer to create one in-chat with `setSubscriptionPrice` — a plan can be monthly-only,
  yearly-only, or both, so ask the app builder which price(s) they want (at least one is required)
  before creating it; see the `payments` skill for the details. Don't build selling until a plan
  exists. **Crucially, a plan that exists is not necessarily live:** the deployed app reads its plans
  from a snapshot baked in at build time, so a plan created or changed after the last build is not
  yet in the live bundle and `/upgrade` silently bounces. If `setSubscriptionPrice` returns
  `rebuildRequired: true` (or you just created the plan on a new app), the app must be
  rebuilt/published once before anyone — including a would-be seller — can subscribe. The mandatory
  new-app order is `build → configure the plans → rebuild`. Don't claim subscribe works, and don't
  hand off a sell flow, until that rebuild has happened. (See the `payments` skill for the full
  explanation.)
- **(d) Payments enabled on the app.** Check with `getPaymentStatus`. In conversation, call
  `setupPayments` to flip it on if it isn't; mid-build, just report that payments aren't enabled yet
  and stop — don't try to switch it on yourself.
- **(e) The `/upgrade` route exists.** `onboardSeller` and `requireSubscription` hard-redirect
  unsubscribed app users to `/upgrade`; if `app/routes.ts` has no `upgrade` route, every one of those
  redirects is a 404 and nobody can ever subscribe or become a seller. Check `app/routes.ts`; if
  the route is missing, add it (copy `/opt/design/scaffolds/subscriptions/upgrade.tsx`, or register
  a route that redirects to the app's own pricing page). Re-check it before finishing any selling
  or payments turn.

Only after (a)–(e) all pass do you build pages.

## Building a sell flow — the usual shape

1. **Make sure a subscription plan exists** (the `payments` skill) — sellers must be paying subscribers.
2. **Seller setup page** (`/app/sell`): `getSellerStatus` in the loader; render the onboarding gate and,
   when `active`, a "manage sales" button (`sellerPanelLink`) and the seller's own sell configuration.
   The `sellerPanelLink` button ships with this page from day one — the hosted panel is the only place
   a seller ever sees their money, and their own Stripe login (if they have one) will never show it.
   Say that to the app builder when you hand the page over.
3. **Buy flow**: a public buy page (works logged out) whose action loads the item by the route's
   `reference` and calls `sellerCheckout` with the item's stored seller and price as `sellerUserId`
   and `amountCents`, a `successUrl` carrying `?ref=` (and `?buyer=` for a guest), and the guest's
   `buyerEmail` from a required email field — the only field the form carries. Gate the button on
   `getSellerReadiness` in the loader and surface `?checkout_error` as a notice (the buyer-facing
   gate rule). On success Stripe returns the buyer to `successUrl`.
4. **Success + gated content**: on the success page verify with `hasPurchased({ reference, buyerEmail })`
   (rendering "confirming" while it is still false); on every route that delivers the purchase, gate
   with `hasPurchased` behind your own token / code / sign-in (the way-back rule above).

For **seller subscriptions**, steps 1–2 are the same, then:

3. **Seller plans page** (`/app/sell/plans`, linked from the seller setup page once `active`): `listPlans`
   with `includeArchived`, and create / edit / archive forms that surface each write's `error`.
4. **Pricing page** for one seller (public): `listPlans({ sellerUserId })`, a Subscribe form per plan for a
   signed-in buyer, "Sign in to subscribe" otherwise, "Manage billing" for a current subscriber, and the
   `?checkout_error` notice.
5. **Subscriber area**: gate in the loader (`hasActiveSubscription` or `getSubscriptions`), a "confirming"
   state right after checkout, the plan's status and next date, and a Manage billing button with the
   `?billing_error` notice.

Start from the scaffolds at `/opt/design/scaffolds/selling/` — a seller setup/status page, a buy flow,
and a purchase success page for one-time sales; `seller-plans.tsx`, `subscribe.tsx` and
`subscriber-area.tsx` for subscriptions — and adapt them to the app's design (copy them in; don't import from the
scaffold path). Follow the JSDoc examples in `~stencil/payments/selling` for the exact call signatures.

## After building — tell the app builder how to test

Every selling build must **end with a message** that includes all of these:

- **Sellers see their money only in the hosted seller dashboard inside the app** (`sellerPanelLink`) — never in a Stripe login of their own. Refunds happen there too.
- **Payments are LIVE — real money moves.** There is no test mode and no test card: every checkout is
  a real card charge, really billed to the buyer and really paid out to the seller's own Stripe
  account. To try it end to end, the app builder should make **one small real charge they can
  refund** — the $5 minimum is enough — and refund it afterwards from the seller's hosted dashboard
  (`sellerPanelLink`).
- **Sellers must complete real Stripe KYC before they can take a charge.** Onboarding asks for
  genuine identity details and a real bank account; placeholder data won't pass verification, and
  until it does the seller can't accept a single payment.
- **The end-to-end order flow to try**, in this order:
  1. Subscribe / upgrade on the app (sellers must be paying subscribers).
  2. Become a seller on `/app/sell` and complete the Stripe KYC onboarding.
  3. From a logged-out window (no second account needed — buyers are guests), buy the seller's
     item with a real email, land on the success page, then follow whatever way back the app built
     (its own emailed link, code, or sign-in) — this confirms the full buy → deliver flow.
- **For seller subscriptions, the order to try instead of step 3:** create a plan on the seller plans page,
  then sign in as a **different** app user (subscribing needs an account), subscribe on the seller's
  pricing page, land in the subscriber area once "confirming" clears, and open **Manage billing** to see
  the portal. Cancel there afterwards and refund the charge from the seller dashboard, whose Subscribers
  tab shows the new subscriber.
- **Buy links go live only after step 2.** A buy link opened before its seller finishes Stripe
  onboarding shows buyers a "not accepting payments yet" notice — that's the built-in guard, not a
  bug. It starts selling the moment onboarding completes.

## Rules

- **Never create, edit, or reimplement anything under `~stencil/payments/`.** That module — including
  `~stencil/payments/selling` — is platform-owned and delivered automatically by build sync; it is not yours
  to write. If an import from `~stencil/payments/selling` fails, treat it as a **platform problem**: report
  it plainly in your closing note and stop. Do NOT fabricate a replacement module or invent endpoints
  to make it compile — a hand-written stand-in produces phantom endpoints and 500s in production.
- **Platform tables are read-only.** `subscription`, `user`, `session`, `account`, `verification`,
  and every `oauth_*` table mirror Stripe and the auth layer, and the platform rewrites them — never
  INSERT/UPDATE/DELETE them via `dbExecute` or any SQL. Reading them is fine. A hand-written row
  (e.g. a comped `subscription` marked active so `onboardSeller`'s gate passes) is a forgery the
  platform will overwrite.
- **Never disable or bypass a paywall as a workaround.** Free/beta/comp access for chosen app users
  is not something Stencil offers yet — say that plainly and point the builder to Stencil support.
  Do not invent a "beta mode" or switch the subscription gate off.
- **Never claim Stencil is working on or restoring something.** State what the platform does today;
  if you don't know, say you don't know.
- Do all money movement through the SDK functions — never call Stripe or the payments API directly.
- Never render selling UI (buy buttons, seller tools) before `getSellerStatus` returns `active`.
- Amounts are always in cents; enforce nothing client-side that the server already enforces — just
  surface the $5 minimum in the UI so buyers aren't surprised.
- The amount passed to `sellerCheckout` is read from the stored item in the action, never from the
  request (the buyer-supplied-amount rule above).
- For the app builder's *own* subscription/monetisation, use the `payments` skill instead.
