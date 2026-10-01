---
name: email
description: Use when the app sends or receives email, or when the app builder asks what their app can do with email — what address it sends from, custom email domains, welcome/confirmation/notification emails, digests, an inbox page, reply-by-email, or reacting to incoming mail. Covers answering from the live email identity (getEmailStatus), sending via createEmail(env).send(), enabling receiving with enableInboundEmail, the inbound webhook scaffold, the mail table, attachments, and threaded replies.
allowed-tools: getEmailStatus createEntity enableInboundEmail
metadata:
  agents: [chat, builder]
---

# Email (send + receive)

Every Stencil app can **send** and **receive** email as a product feature — no email service to sign up for, no API keys, nothing for the app builder to configure. You both answer questions about it and build it in the same turn.

Use `createEmail` from `~stencil/email` — **server-side only** (loaders, actions, the webhook route, scheduled handlers), never from the browser. Everything is proxied through the platform; the sender address and display name are set automatically.

## Check the live email identity first

**Before answering anything about what the app sends from, receives at, or whether custom email is set up, call `getEmailStatus`.** It reports the app's *current* identity — whether custom email is active, the exact address the app sends from and receives at right now, and any in-progress provisioning. Quote the address it returns. Never recite a generic "you're on the platform address, connect a domain to change it" paragraph without checking: many apps already have a custom domain live, and telling that app builder they can't use it yet is wrong.

Describe email in plain product terms — "sends a welcome email when someone signs up", "an inbox page showing incoming support emails with attachments", "auto-replies to new inquiries and saves each one as a lead". No provider names, no code-level APIs in what you say to the app builder. Never promise anything from the can't-do list below.

**Boundary — app email vs. the app builder's own mailbox.** This skill is about email the **app** sends and receives as a product feature. It is not about the app builder's own connected Gmail. Cold outreach, reply monitoring, follow-ups, and personal briefings run through their Gmail account and its own tools — a different thing entirely. If an ask is ambiguous ("I want to send emails to my customers"), clarify which they mean: them emailing people from their own account, or their app emailing its app users automatically.

## The address

The **domain** is set by the platform — the app's connected custom domain when custom email is live, otherwise the default `mail.hellostencil.com` subdomain (`<mailbox>.<slug>@mail.hellostencil.com`). The **local-part** (before the @) is the app builder's free choice on whichever domain is active — `noreply@`, `admin@`, `hello@`, `support@`, anything. It is not a fixed platform menu, so on a live custom domain `admin@theirdomain.com` is fine: honour it, don't push back.

Inbound is catch-all on the active domain: any local-part reaches the same app, each message labeled with its mailbox name. The app builder picks the mailboxes (`support@`, `billing@`, whatever), same free choice as the sender.

## Custom domains

Connecting a domain and setting up email on it are **two separate steps**. `getEmailStatus` reports both — `customEmail` for the email step, `connectedDomains` for the serving step — so read both before you describe anything as missing:

- **Custom email already active** (`customEmail.active`) — the app already sends from and receives on that domain, with any local-part on it. Confirm the current address and honour the request; don't describe connecting a domain as a future step.
- **Domain connected but no custom email** (`connectedDomains` non-empty, `customEmail.active` false) — the common case, and the easy one to get wrong. The domain is **already connected**; do not tell the app builder to connect it. The only missing step is email on it, which they turn on with **Set up email** next to that domain on the app's **Domains page**. Say the address they asked for (`tomer@theirdomain.com`) will work once that's done — a pending setup step, not a platform limitation.
- **No domain connected at all** (`connectedDomains` empty) — only here is connecting a domain the next step. Point them at the app's **Domains page** to connect or buy one, then set up email on it.

Neither step can be done from here — both are app-builder actions on the Domains page.

## What apps can't do

- **No external mail clients.** No IMAP/SMTP access — the inbox lives inside the app itself. Outlook or the Gmail app cannot connect to it.
- **No sending from a domain the app doesn't own.** The guardrail is the **domain**, not the local-part: the app can only send and receive on a domain it has actually connected (or the default `mail.hellostencil.com` subdomain) — never a free-form third-party domain, never the app builder's personal Gmail. The local-part on an owned domain is unrestricted.
- **Not a mailbox service.** This is a product feature for the app's own email, not a general webmail replacement.

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

- `senderName` is the local-part (e.g. `"notifications"`, `"support"`, `"admin"`); lowercase letters, digits, and hyphens only; defaults to `"noreply"`. The platform builds the full from-address around it — never construct one yourself.
- Full params: `to`, `cc`, `bcc`, `reply_to` (each a string or array), `subject`, `html` and/or `text`, `headers` (string record), `tags` (`{name, value}[]`).
- Returns `{ id }`; throws on failure with the backend's error text.

The app can send at any server-side moment: a welcome email on signup, an order confirmation, a status update, a scheduled weekly digest. Combined with scheduled actions it can also act on mail automatically — auto-replies, digests of what arrived, routing messages into the app's data — without anyone opening a page.

## Acceptable use — what to build, what to decline

App email exists to serve an app's own people. The line is *who the mail goes to and why*, not the words the app builder uses. Judge that; don't scan for keywords. Almost everything real app builders ask for is fine — build it without friction.

**Build it, no questions asked.** Transactional mail to the app's own app users (welcome, confirmation, receipt, password reset), notifications triggered by something happening in the app, a digest or newsletter app users opted into that carries an unsubscribe link, alerts to the app's own team or admins, an invite an app user sends one person at a time, replies to people who wrote in. Volume alone is never a reason to decline — a big real app-user base sending a lot of mail is a success, not abuse. If they're bumping the shared-domain send limit, point them at connecting a custom domain to raise it, don't refuse the feature.

**Decline, in one plain sentence, then move on.** These are about mailing people who never joined the app, or hiding that you're doing it: blasting a contact list the app builder uploaded, imported, pasted, or scraped rather than one the app earned through signups; cold outreach or lead-gen to people who never opted in; sending "on behalf of" some third party, or making the mail look like it comes from a brand it doesn't; anything shaped like phishing. Also decline requests to *dodge the rules* — rotating sender names, splitting a blast to slip under a limit, stripping the unsubscribe link, mailing a bought or harvested list — and mail for the classic abuse categories (adult, gambling, crypto/token pumps, unsolicited pharmacy or loans, "you won a prize"). One sentence on why, no lecture, and offer the honest path instead: a signup or subscribe form so people join, or — for a genuine external marketing list — a custom domain plus a real marketing tool, which this feature isn't. Name Flodesk first: it is Stencil's native email-marketing integration (the app builder says "connect Flodesk" in chat, and new signups sync to the segments they pick — see the `flodesk` skill); Mailchimp or similar is the alternative.

**When it's genuinely unclear, ask one question.** The usual ambiguity is whether "email my customers/my list" means the app's own app users or an outside list they'll upload. Ask that once, plainly, and build whatever the answer supports. Don't assume the worst and don't assume the best — just ask.

**Don't be blockish.** Never refuse over a word — "customers", "newsletter", "marketing", "campaign", "bulk" all describe legitimate features. Testing with the app builder's own or a teammate's address is normal. An app on a verified custom domain (`getEmailStatus` → `customEmail.active`) has already cleared a real ownership bar; give it the benefit of the doubt. And never *build a workaround* for something you'd otherwise decline — if it's not okay to send, it's not okay to send from a rotating address either. Point to the custom-domain-plus-external-tool path and leave it there.

### How that lands in the code you write

Take the recipients from a row the app owns — an app user in the users table, a subscriber row that recorded an explicit opt-in (with a consent timestamp), or an address the app collected because that person acted (signed up, placed an order, wrote in). Never wire `email.send` to addresses from an uploaded file, a pasted-in textarea, a scraped page, or an external contacts API.

- **No blast loops.** Don't build a "send to everyone" that iterates an arbitrary table. A digest or newsletter filters on an explicit opt-in column and every message carries an unsubscribe link that flips that column off. Importing a CSV as CRM data the app displays is fine — just don't feed those imported rows into `email.send`.
- **One send, one recipient** (or the small set the app user picked). `to` is not a mailing list; don't use `bcc` to fan a single call out to many addresses.
- **Don't impersonate.** `senderName` names the mailbox the mail comes from (`noreply`, `support`, `billing`) — never a brand or person the app doesn't represent, and don't build a subject or body dressed up as another company.
- **Surface limits, don't route around them.** If a send throws a rate-limit or cap error, let it surface — never add retry, queue, or spread-over-time logic whose purpose is to slip under the cap.

## Receiving — how it works

Receiving is **push-based**. When it's on, the platform POSTs every email the app receives — any mailbox prefix on the app's shared address (`<mailbox>.<slug>@mail.hellostencil.com`), or any address on a custom email domain — to one trusted route inside the app: `/api/internal/email-inbound`. That route stores the message in the app's **own D1 table**, so mail is ordinary app data: query it, join it with app users or orders, group it into per-app-user inboxes. There is no remote inbox API and nothing to poll.

Two things gate it, and you control both:

1. **The platform switch.** Call the `enableInboundEmail` tool in any turn that builds something which **receives** email (an inbox, reply-by-email, acting on incoming mail). Without the switch the platform **discards** the app's incoming mail, so a freshly built inbox would just sit empty. Never tell the app builder to go find a settings toggle — flip it with the tool. Skip the call for builds that only send.
2. **The webhook route + table**, which you build (below). Mail that arrives before the route exists is parked by the platform and delivered automatically after the next successful publish — nothing is lost.

**Only build receiving when the brief asks for it** ("show incoming support emails", "let users reply by email", "an inbox page"). Don't wire it in otherwise, and don't enable it by default.

## Receiving — build steps

### 1. Create the mail table

Create an entity with the fixed slug `messages` via `createEntity` (the standard entity flow — check `/home/user/app/app/generated/db-schema.ts` first and only create it if the slug is absent).

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

Add whatever the feature needs on top (app user id, status, handled flag). The row's `id` is supplied at insert time with the platform email id (`ie_…`), which is what makes redelivery idempotent.

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

- Show `address.default` in the UI so the app builder and app users know where to send mail (`address()` also returns the general `pattern`; any `<mailbox>` prefix routes to this app). **Never build the address by hand** — the platform owns the domain, so always read it from here, and in chat quote `getEmailStatus` rather than constructing or promising an address.
- Read/unread is your column: set `read_at` from your own action when a message is opened. Per-app-user or per-end-user inboxes are just a scoping column (`member_id`) you add to the table and filter on — mailbox organization is entirely this app's concern.

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

Attachment bytes stay in platform storage — the webhook payload carries only metadata, and each attachment's `path` is an internal, bearer-gated backend path, **not** a URL. You cannot put it in an `<a href>` or `<img src>`. To show an attachment to an app user, fetch the bytes **server-side** with `getAttachment(id, index)` (`id` = the platform email id, `index` = the attachment's position in the payload's `attachments` array) in a resource route of your own and re-serve them:

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

## When an email arrives wrong

When the app builder says an email arrived broken — missing bullets, a dead link, a button rendered as text — the ground truth is what was actually sent, not the template and not the code. Read the app's own sent-email records with `dbExecute` (the table name is in `app/generated/db-schema.ts`) and compare the sent HTML with the stored template. The difference is the bug.

- **Emails take several paths.** Sent by hand, from a template, through a workflow, after an approval or edit step, and scheduled. Find which path the broken one took and follow that path. A fix on one path says nothing about the others; check each one the app has before you describe what is covered.
- **Review and approval steps rewrite markup.** A step that loads a body into an editor and saves it back can flatten lists, drop links, or turn buttons into text, and it often stores a per-recipient copy that later sends use first. Check for such stored copies and repair any the bug already changed — the code fix alone leaves them broken.
- **Confirmed means a sent record, sent after the fix, has the expected markup.** Read it back from the table. If no send can happen during the turn, tell the app builder exactly which email to send themselves and what to look for in it, and say what you changed rather than that it is fixed.
