---
name: push-notifications
description: Web Push in a Stencil app — end-user opt-in, server-side sending, and delivery control (ttl, urgency, tag). Load for push notifications, reminders, alerts, "notify me", mobile/PWA notifications, or when a notification arrives late/never. The platform injects the service worker, manifest, and VAPID key; never hand-roll them.
---

# Push notifications

The platform provides the transport (service worker, manifest, VAPID key, and the
`window.stencil.push` client API). You write only a client opt-in button and a
server-side `send()`.

## Requirements

- **PWA must be enabled** by the owner (app settings → Mobile app → Enable PWA) —
  not something you toggle from code. If off, `subscribe()` returns
  `reason: "not-configured"`. Remind the user to enable it.
- Works on the **live published app only** (not the editor preview).
- **iOS**: user must Add to Home Screen first (else `reason: "needs-install"`).

## Never hand-roll

`window.stencil.push` and `~stencil/push` are the only entry points. Do NOT write a
service worker or manifest, call `serviceWorker.register` /
`Notification.requestPermission` / `pushManager.subscribe`, read a VAPID key from
`window.__ENV__`, add a `urlBase64ToUint8Array`, or make a `/api/push/*` route.

## Client opt-in

`window.stencil.push` is injected (no import), typed in `app/env.d.ts`, browser-only,
and may be briefly absent until the injector loads — always optional-chain and drive
UI from `status()`. Call `subscribe()` from a user gesture.

```tsx
import { useEffect, useState } from "react";

export function NotificationsButton() {
  const [status, setStatus] = useState<StencilPushStatus | "loading">("loading");

  useEffect(() => {
    window.stencil?.push?.status().then(setStatus).catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    const res = await window.stencil?.push?.subscribe();
    if (res?.ok) setStatus("subscribed");
    // else handle res.reason: "needs-install" | "denied" | "not-configured" | "server"
  }

  if (status === "loading" || status === "unsupported") return null;
  return status === "subscribed"
    ? <button onClick={() => window.stencil?.push?.unsubscribe().then(() => setStatus("default"))}>Turn off notifications</button>
    : <button onClick={enable}>Turn on notifications</button>;
}
```

## Server send

From a loader, action, or recurring-action handler. Pick exactly one audience:
`toUserId`, `toUserIds`, or `broadcast: true`.

```ts
import { createPush } from "~stencil/push";

await createPush(context.cloudflare.env).send({
  toUserId: order.userId,
  title: "Order shipped 📦",
  body: `Order #${order.id} is on its way.`,
  url: `/orders/${order.id}`, // opened on click
  tag: "order-status",        // replaces the previous order update
  ttl: 86400,                 // still true tomorrow
});
```

A daily per-app quota applies — don't broadcast on every request. For reminders,
call `send()` from a recurring action.

## Delivery control — set these deliberately

The OS decides *when* to display a notification, but these fields decide what it's
allowed to do. Defaults are sensible; override them when the message has a shelf life.

| Field | Default | Use it when |
|---|---|---|
| `ttl` (seconds) | `3600` | **Time-bound message.** How long the push service holds it for an offline device. `ttl: 900` on "starts in 10 minutes" makes it expire instead of arriving an hour late. Long (`86400`) only for messages that stay true. |
| `urgency` | `"high"` | Drop to `"normal"`/`"low"` for digests. `high` is what lets a notification break through Android Doze, so keep it for anything the user is waiting on. |
| `tag` | none | **Any recurring or status message.** Same tag replaces the previous notification instead of stacking — an hourly reminder stays one line in the shade. Use a stable per-purpose key: `"practice-reminder"`, `"order-status"`. |
| `renotify` | `false` | With `tag`, re-alert (sound/vibrate) on replacement instead of silently swapping. |
| `requireInteraction` | `false` | Desktop only — keep it up until the user acts. |

**A late notification is worse than none.** For anything with a start time, pair a
short `ttl` with a `tag` so at most one current copy exists.

## Check the result — `delivered` does not mean "seen"

`send()` returns `{ id, status, recipients, delivered, failed, pruned }`.

- `status: "no_recipients"` — **the send did nothing**: the audience matched zero
  live subscriptions. This is the most common push bug, and it is not an error you
  can see without checking. Log it.
- `delivered` counts push-service ACKs, not displays. The platform tracks real
  clicks separately (the service worker reports them); don't try to build your own
  read receipts.

```ts
const res = await createPush(env).send({ toUserIds: ids, title, body, tag: "reminder" });
if (res.status === "no_recipients") {
  console.warn(`reminder: nobody reachable (targeted ${ids.length} users)`);
}
```

## Audience pitfall — target ids that actually opted in

`toUserId`/`toUserIds` match the user id that was **signed in when the device
subscribed**. A send to any other id silently resolves to zero recipients.

When a recurring action derives its audience from data ownership, that set must be
real users:

```ts
// RISKY: created_by may be the platform's preview user for everything seeded during
// the build — that id never has a subscription, so every run sends to nobody.
const owners = await db.selectDistinct({ userId: pieces.createdBy }).from(pieces);
```

Rules:

- Any row you seed on the user's behalf during a build must be scoped to the real
  owner, not the preview user — otherwise the app's own notifications never reach
  them (get the preview id from `dev-tools preview-user` and don't reuse it as an
  audience).
- Derive audiences from the **auth user table** where possible, and treat data
  ownership as a filter on top of it, so a user with no rows yet is still reachable.
- Never assume an audience is non-empty. Check `status`.
