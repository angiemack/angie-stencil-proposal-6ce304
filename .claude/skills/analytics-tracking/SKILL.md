---
name: analytics-tracking
description: Track a custom analytics event in the app — measure an app user action like a button click, form submit, signup, or purchase. Use when the app builder wants to "track clicks on the Sign Up button", "measure contact form submits", "count add-to-cart taps", or otherwise record and later see a specific action in their analytics dashboard. Wires up a single tracking call — no setup, keys, or SDK needed.
metadata:
  agents: [chat, builder]
---

You help app builders measure the actions that matter in their app by wiring up **custom analytics events**.

## The one call

Every **published** Stencil app automatically loads a tiny analytics beacon that exposes a global:

```js
window.stencil.track(name, props)
```

- `name` — a short, human-readable event name (string, required). This is exactly what the app builder will see as a named metric in their dashboard.
- `props` — an optional plain object of extra context (e.g. `{ plan: "pro" }`). Keep it small; it's stored alongside the event.

That's the whole API. There is **nothing to install, no API key, and no configuration** — traffic and pageviews are already captured automatically. You only need to add a `track` call for the specific actions the app builder asks about.

## Wiring it up

Add the call inside the event handler for the action being measured. Always call it defensively, because `window.stencil` only exists on the live published app:

```tsx
function handleSignUp() {
  // ...existing signup logic...
  window.stencil?.track("Sign Up", { source: "hero" });
}

<button onClick={handleSignUp}>Sign up</button>
```

The optional chaining (`window.stencil?.track?.(...)`) matters — it keeps the app safe when the beacon isn't present (see "Where events fire" below) and avoids a crash.

### TypeScript

If the app is TypeScript and the compiler complains that `stencil` doesn't exist on `window`, add a small ambient declaration once (e.g. in a `global.d.ts` or near the call):

```ts
declare global {
  interface Window {
    stencil?: { track: (name: string, props?: Record<string, unknown>) => void };
  }
}
export {};
```

## Naming conventions

- Use clear, title-case, action-oriented names: **"Sign Up"**, **"Contact Form Submitted"**, **"Add to Cart"**, **"Checkout Completed"**.
- Keep the name **stable** — it's the metric's identity. Renaming it later starts a new, separate metric.
- Use one name per distinct action; use `props` for variants (e.g. `track("Add to Cart", { product: "Tote" })`) rather than baking the variant into the name.

## Where events fire (set expectations)

- Events are only sent from the **published** app served on its real domain. They do **not** fire in the editor preview iframe (previews are intentionally excluded from analytics), so the app builder won't see their new event while testing in preview — that's expected. Tell them to publish, then use the live app.
- Counts appear in the app's **Analytics** tab under the **Custom events** card. They may take a short while to show up, and — like all the analytics — high-volume counts are privacy-first estimates.

## Rules

- Add tracking calls **only for the actions the app builder asked about** — don't sprinkle `track` everywhere.
- Never send personal or sensitive data in `props` (no emails, passwords, tokens, full names). Keep props to non-identifying context.
- One `track` call per action occurrence; put it where the action actually succeeds (e.g. after a successful submit), not on render.
