---
name: email
description: Use when the app sends or receives email — welcome/confirmation/notification emails, digests, an inbox page, reply-by-email, or reacting to incoming mail. Sending via createEmail(env).send(). Receiving is push-based — the platform POSTs every incoming email to the app's /api/internal/email-inbound webhook, which stores it in the app's OWN D1 table; the app owner enables receiving with a settings toggle. Covers send, address, getAttachment, the webhook scaffold, and the mail table.
---

# Email (send + receive)

Use `createEmail` from `~stencil/email` — **server-side only** (loaders, actions, the webhook route, scheduled handlers), never from the browser. No API keys, no setup: everything is proxied through the platform. The sender address and display name are set automatically.

## Sending

```ts
import { createEmail } from "~stencil/email";

const email = createEmail(context.cloudflare.env);
await email.send({
  to: "user@example.com",
  subject: "Welcome!",
  html: "<p>Thanks for signing up.</p>",
});

// Custom sender address
await email.send({
  senderName: "notifications",
  to: ["a@example.com", "b@example.com"],
  subject: "New activity",
  text: "You have new activity.",
});
```

- `senderName` differentiates sending addresses (e.g. `"notifications"`, `"support"`); lowercase letters, digits, and hyphens only; defaults to `"noreply"`. The platform builds the full from-address around it — never construct one yourself.
- Full params: `to`, `cc`, `bcc`, `reply_to` (each a string or array), `subject`, `html` and/or `text`, `headers` (string record), `tags` (`{name, value}[]`).
- Returns `{ id }`; throws on failure with the backend's error text.

## Receiving — how it works

Receiving is **push-based**. When it's on, the platform POSTs every email the app receives — any mailbox prefix on the app's shared address (`<mailbox>.<slug>@mail.hellostencil.com`), or any address on a custom email domain the owner connected — to one trusted route inside the app: `/api/internal/email-inbound`. That route stores the message in the app's **own D1 table**, so mail is ordinary app data: query it, join it with members or orders, group it into per-member inboxes. There is no remote inbox API and nothing to poll.

Two things gate it, and you only control one:

1. **The owner's switch.** Receiving is enabled by the app owner in the app's settings panel ("Receive inbound email"). You **cannot** enable it from code — there is no API for it. When you build a receive feature, tell the user to flip that switch.
2. **The webhook route + table**, which you build (below). Mail that arrives before the route exists is parked by the platform and delivered automatically after the next successful publish — nothing is lost.

**Only build receiving when the brief asks for it** ("show incoming support emails", "let users reply by email", "an inbox page"). Don't wire it in otherwise.

## Receiving — build steps

### 1. Create the mail table with `dev-tools create-entity` — never raw SQL

Create an entity with the fixed slug `messages` via `dev-tools create-entity` (the standard entity flow — check `app/generated/db-schema.ts` first and only create it if the slug is absent). **Never** create this table with raw SQL through `dev-tools db execute`: a raw-DDL table is invisible to the entity registry, missing from the generated `db-schema.ts` the webhook imports, and unseen by the platform's revert safety checks.

Fields (the platform `id` primary key, `created_at`, and `updated_at` are added automatically — don't declare them):

| field | type | notes |
|---|---|---|
| `mailbox` | text | local-part routing segment (e.g. `"support"`) |
| `from_address` | email | sender address |
| `from_name` | text | sender display name |
| `subject` | text | |
| `text` | text | plain-text body |
| `html` | text | HTML body |
| `thread_id` | text | stable thread key — echo it in replies |
| `received_at` | datetime | ISO-8601, from the payload |
| `read_at` | datetime | app-owned read state (set it from your own action) |

Add whatever the feature needs on top (member id, status, handled flag). The row's `id` is supplied at insert time with the platform email id (`ie_…`), which is what makes redelivery idempotent.

### 2. Create the webhook route — copy this file exactly

Create `app/routes/api.internal.email-inbound.tsx` with the content below and register it in `app/routes.ts`:

```ts
route("api/internal/email-inbound", "routes/api.internal.email-inbound.tsx"),
```

**DO NOT change the auth block.** The `env.SCHEDULE_TRIGGER_SECRET` bearer check is the only thing stopping the public internet from writing to the app's inbox. Adapt only the insert columns (if you added fields) and the "your app's logic" seam.

```tsx
import type { Route } from "./+types/api.internal.email-inbound";
import { createDb } from "~stencil/db";
import { messages } from "~/generated/db-schema";

/** The push payload the platform sends. Attachment BYTES never ride it — fetch
 *  them server-side with `createEmail(env).getAttachment(id, index)` and re-serve
 *  from your own route (`path` is an internal, bearer-gated backend path). */
type InboundEmailPayload = {
  /** Platform email id (`ie_…`). Use it as the row's primary key. */
  id: string;
  /** The full address the mail arrived at. */
  recipient: string;
  /** The local-part routing segment (e.g. "support"). */
  mailbox: string;
  from: string;
  fromName?: string;
  subject?: string;
  text?: string;
  html?: string;
  /** Stable thread key — echo it in replies (see the reply note below). */
  threadId?: string;
  attachments: Array<{ filename: string; contentType?: string; size?: number; path: string }>;
  /** ISO-8601 timestamp. */
  receivedAt: string;
};

/** Constant-time string compare so the bearer check can't be timed byte-by-byte. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;

  // Fail closed: with no configured secret there is nothing to authenticate
  // against, so no caller can be trusted. (In production the platform always
  // injects it; this only trips in local dev without the binding.)
  const expected = env.SCHEDULE_TRIGGER_SECRET;
  if (!expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token || !timingSafeEqual(token, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = (await request.json()) as InboundEmailPayload;
  const db = createDb(env);

  try {
    // Idempotent on the platform id — a redelivery of the same email no-ops here
    // instead of inserting a duplicate.
    await db
      .insert(messages)
      .values({
        id: email.id,
        mailbox: email.mailbox,
        fromAddress: email.from,
        fromName: email.fromName ?? null,
        subject: email.subject ?? null,
        text: email.text ?? null,
        html: email.html ?? null,
        threadId: email.threadId ?? null,
        receivedAt: email.receivedAt,
      })
      .onConflictDoNothing({ target: messages.id });

    // --- your app's logic here -------------------------------------------------
    // Route to a member, notify, kick off a workflow, etc. Reading mail is now a
    // local query against this table — no remote call.
    // ---------------------------------------------------------------------------
  } catch (err) {
    // A non-2xx tells the platform to retry (and eventually park with evidence),
    // so surface real failures — but never throw past here.
    console.error(`inbound email ${email.id} failed:`, err);
    return Response.json({ ok: false, error: "handler failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
```

Delivery is **at-least-once and retried** — the same email can arrive twice, which is why the insert is keyed on the platform `id` with `onConflictDoNothing`. Keep the handler fast: store the row, do light follow-up work, return 200. A non-2xx makes the platform retry and eventually park the mail; parked mail is redelivered after the app's next successful publish.

### 3. Read mail like any other app data

An inbox is a loader querying your own table — filter, paginate, and scope it like everything else:

```tsx
// app/routes/app.inbox.tsx  (register in routes.ts)
import type { Route } from "./+types/app.inbox";
import { createDb } from "~stencil/db";
import { messages } from "~/generated/db-schema";
import { createEmail } from "~stencil/email";
import { requireAuth } from "~stencil/auth/server";
import { desc, isNull } from "drizzle-orm";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAuth(request, context.cloudflare.env);
  const db = createDb(context.cloudflare.env);
  const [items, address] = await Promise.all([
    db.select().from(messages).orderBy(desc(messages.receivedAt)).limit(50),
    createEmail(context.cloudflare.env).address(),
  ]);
  return { items, address };
}
```

- Show `address.default` so the user knows where to send mail (`address()` also returns the general `pattern`; any `<mailbox>` prefix routes to this app). **Never build the address by hand** — the platform owns the domain, so always read it from here.
- Read/unread is your column: set `read_at` from your own action when the user opens a message. Per-member or per-end-user inboxes are just a scoping column (`member_id`) you add to the table and filter on — mailbox organization is entirely this app's concern.

## Replies that thread correctly

`send()` has no reply parameter. A bare `Re: …` reply starts a NEW thread in the recipient's mail client. To land the reply in the sender's existing thread, echo the stored `thread_id` in the RFC-2822 headers — do this in every reply-to-inbound flow, auto-replies included:

```ts
await email.send({
  to: msg.fromAddress,
  subject: `Re: ${msg.subject ?? "your message"}`,
  text: "Thanks — we'll get back to you shortly.",
  ...(msg.threadId && {
    headers: { "In-Reply-To": msg.threadId, References: msg.threadId },
  }),
});
```

## Attachments are never public links

Attachment bytes stay in platform storage — the webhook payload carries only metadata, and each attachment's `path` is an internal, bearer-gated backend path, **not** a URL. You cannot put it in an `<a href>` or `<img src>`. To show an attachment to an end user, fetch the bytes **server-side** with `getAttachment(id, index)` (`id` = the platform email id, `index` = the attachment's position in the payload's `attachments` array) in a resource route of your own and re-serve them:

```tsx
// app/routes/app.attachment.$id.$index.tsx  (register in routes.ts)
import type { Route } from "./+types/app.attachment.$id.$index";
import { createEmail } from "~stencil/email";
import { requireAuth } from "~stencil/auth/server";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  await requireAuth(request, context.cloudflare.env);
  const email = createEmail(context.cloudflare.env);
  const res = await email.getAttachment(params.id, Number(params.index));
  return new Response(res.body, { headers: res.headers });
}
```

Store the payload's `attachments` metadata in your table (a `json` field) if the UI needs filenames/sizes, and link to *your* route, never to `path`.
