---
name: in-app-notifications
description: The in-app notification store — a bell, inbox, notification center, unread badge, alerts feed, or "tell app users when X happens" inside the app. Load before building any surface where an app user reads notifications, or any feature that records one. The platform ships the store, the write function, and the bell; never hand-roll a mailbox.
metadata:
  agents: [chat, builder]
---

# In-app notifications

The platform provides a durable notification store: a fixed-shape `notification`
table in the app's own database, one server-side function to write rows, and a
ready-made header bell that reads them. You write only the `send()` calls at the
places where things happen.

## Never hand-roll

Do NOT create a notifications entity with `createEntity` (the `notification`
table name is reserved), build a bell/panel/inbox component from scratch, or
model unread state yourself. `~stencil/notifications` and `<NotificationsBell />`
are the only entry points. Raw SQL writes to the `notification` table are
blocked — write through the SDK.

An app that already carries its own hand-built notification system keeps
working; leave it alone unless the app builder asks to consolidate, in which
case rebuild those flows on the store.

## Wire it up (two edits, once per app)

1. Spread the route pack into `app/routes.ts` (relative import — the `~stencil`
   alias doesn't resolve there):

```ts
import { stencilNotificationRoutes } from "./.stencil/react-router/notifications/routes";

export default [
  index("routes/home.tsx"),
  ...stencilNotificationRoutes,
] satisfies RouteConfig;
```

2. Put the bell in the app header, next to the account menu:

```tsx
import { NotificationsBell } from "~stencil/ui/notifications/bell";

<NotificationsBell />
```

The bell is self-contained: unread badge, the latest rows, mark all read on
open, mark one read on click. It renders nothing for a signed-out visitor and
takes an optional `className` for the trigger button. Don't rebuild it to
restyle it.

## Send — from actions, webhooks, and scheduled handlers

Server-side only. Pick exactly one audience: `toUserId` or `toUserIds`. The app
decides when to call it and what it says — "batch finished", "Kim mentioned
you" and "monthly review is ready" are three calls to the same function.

```ts
import { createNotifications } from "~stencil/notifications";

const res = await createNotifications(context.cloudflare.env).send({
  toUserId: order.userId,
  title: "Order shipped",
  body: `Order #${order.id} is on its way.`,
  link: `/app/orders/${order.id}`, // same-origin path, opened on click
});
if (res.status === "no_recipients") {
  console.warn("order-shipped: recipient is not an app user");
}
```

Recipients must exist in the auth `user` table — an unknown id is skipped, and
`status: "no_recipients"` means nothing was written. The push skill's audience
rules apply here too: derive audiences from the auth user table, and never use
the preview user's id as a real audience.

## The shape is fixed — on purpose

A notification is recipient, title, body, optional link, read state, created
time. There are **no kinds, categories, per-user preferences, channel routing,
or digests**, and you must not build a settings matrix around the store. What
would have been a "kind" is just different `title`/`body` text at a different
call site. If the brief seems to need per-notification-type configuration,
push back to the simplest version first: separate `send()` calls.

## Beyond the bell

For a full notifications page, read the store in a loader:

```ts
const notifications = createNotifications(context.cloudflare.env);
const rows = await notifications.list(user.id, { limit: 50 });        // newest first
const older = await notifications.list(user.id, { before: rows.at(-1)?.createdAt });
const unread = await notifications.unreadCount(user.id);
await notifications.markRead(user.id, id);
await notifications.markAllRead(user.id);
```

## Push and email are transports, not the store

- **Push** (`~stencil/push`, `push-notifications` skill) pokes a device; it is
  gated on PWA + publish + opt-in and holds no history. Sending a push does NOT
  write a notification row — for anything an app user should be able to find
  later, call `send()` too, with the same title/body/link.
- **Email** (`~stencil/email`) is a raw send, same deal.
- The store needs no opt-in, works in the preview, and is where "you have 3 new
  things" lives.
