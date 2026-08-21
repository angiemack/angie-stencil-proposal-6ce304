---
name: member-connections
description: >
  Letting each of the app's members connect their OWN third-party account —
  "let my users connect their Google Calendar", "sync each customer's Slack",
  "read the signed-in user's Notion", "integrate with their own account", "pull
  their calendar/inbox/CRM". Use whenever the brief means *the person using the
  app* connects a service, rather than the app owner connecting one centrally.
  Covers the app/connections.ts manifest, the ~stencil/connections SDK,
  requireConnection, <ConnectButton>, and what to do when the service is not in
  the catalog.
metadata:
  title: Member connections (each member connects their own account)
---

# Member connections

Each member of this app connects **their own** third-party account, and the app
then acts on their behalf. Member A's calendar is never visible to member B, and
neither is visible to the app's owner.

This is not the same thing as the app owner connecting one account centrally. If
the brief means "the business connects its Stripe", that is a different feature
and this skill does not apply.

## You are not wrong that you cannot hand-roll this

If you have refused a brief like this before, your reasoning was correct: the
platform owns authentication, there is no per-app Google client, and a bespoke
OAuth flow written inside an app is non-functional. **All of that is still
true.** Never write a provider sign-in by hand, never add an `/auth/google`
route, never ask for a client secret in app code.

What has changed is that there is now a sanctioned route. Use it.

## Start from the scaffolds

```bash
cp /opt/design/scaffolds/connections/connections.ts app/connections.ts
cp /opt/design/scaffolds/connections/gated-route.tsx app/routes/agenda.tsx
```

Both are worked examples. Adapt the providers, the reasons, and the page.

## The manifest and the route pack are ONE change

```ts
// app/connections.ts
import type { ConnectionManifest } from "~stencil/connections";

export default [
  { provider: "google-calendar", reason: "Show your agenda alongside your bookings" },
] satisfies ConnectionManifest;
```

```ts
// app/routes.ts — a RELATIVE import, like the auth pack. React Router's config
// loader runs before tsconfig aliases, so ~stencil does not resolve here.
import { stencilConnectionRoutes } from "./.stencil/connections";

export default [
  index("routes/home.tsx"),
  ...stencilConnectionRoutes,
] satisfies RouteConfig;
```

**Never add one without the other.** `requireConnection` sends members to
`/app/connections`, which the route pack provides. A manifest with no registered
pack means every gated page redirects a member to a 404, and nothing in the build
will tell you.

`reason` is shown to the member, in the app's voice. Say what the app does with
the data, not what the integration is called.

## Switch it on, or the code you just wrote does nothing

**A provider must be switched on for this app before any member can connect it.**
Writing the manifest does not do that, and `<ConnectButton>` renders nothing
until it is. An app that looks unbuilt is usually an app that is not switched on.

So, immediately after writing `app/connections.ts`, call:

```
enableMemberConnections({ providers: ["google-calendar"] })
```

Pass **every** provider your manifest names, not only the ones you expect to
work. A provider that cannot be switched on comes back with the reason and a
sentence written for the builder, and that sentence is what you tell them.

Do not ask the builder whether to switch it on. They asked for the feature in
the brief; that was the decision. The tool never switches anything off and never
touches credentials, so calling it again on a rebuild is safe.

## Gating a page

```ts
const { user } = await requireAuth(request, env);
await requireConnection(request, env, user.id, "google-calendar");
```

Redirects to `/app/connections?needed=google-calendar` when the member has not
connected. Shaped like `requireAuth` on purpose.

For an `optional: true` provider, read the status instead and degrade:

```ts
const status = await getConnectionStatus(env, user.id, "slack");
if (status === "connected") { /* the extra feature */ }
```

## Using the connection

```ts
const member = createConnections(env).as(user.id);

// Catalog tool, input validated against the tool's own schema. Prefer this.
const events = await member.call("google-calendar", "listEvents", { maxResults: 20 });

// Escape hatch, locked to the provider's own host. `path` is a path, not a URL.
const res = await member.request("acme-crm", { method: "GET", path: "/v2/contacts" });
```

Server-side only — a loader, an action, or a scheduled handler.
`createConnections` throws if called anywhere else, because it needs the app's
own bearer key and that key must never reach a browser.

Errors are typed. Branch on `error.code`, do not match on message text:
`not_connected`, `needs_reauth`, `provider_not_configured`, `provider_error`,
`invalid_input`, `rate_limited`.

## Always place an inline entry point

`requireConnection` guarantees no member hits a dead end. It does **not** help a
member who never opens a gated page and therefore never learns the feature
exists.

Every connection-backed feature gets at least one `<ConnectButton>` where the
need is felt: in the empty state, beside the thing it enables. A link buried in
settings does not count.

```tsx
<ConnectionsProvider connections={loaderData.connections}>
  {/* ... */}
  <ConnectButton provider="slack" />
</ConnectionsProvider>
```

State comes from the loader, never a `useEffect` fetch. `<ConnectButton>` renders
**nothing** when the provider is unavailable, so an app whose owner has not
finished setup shows no dead button rather than one that errors on click.

## The service is not in the catalog

**Offer setup. Do not emit `[BLOCKED: ...]`.**

If the brief names something Stencil does not have a connector for, say so
plainly and tell the builder what you need, in one short message: the service's
authorize URL, token URL, and an OAuth client they create in that service's
developer console. Then continue with the rest of the app.

Blocking the whole build on a missing connector is the failure this capability
exists to remove. A brief that mentions one service the platform does not know
is not an unbuildable brief.

## Data scoping still applies

A member's connected data is theirs. Any row derived from it carries
`created_by = user.id`, exactly as the template's data-scoping rule requires.

Worth stating because "the calendar" reads like shared data and is not. Two
members of the same app must never see each other's events.

## Before you report done

Say what `enableMemberConnections` actually returned. It gives you a per-provider
answer, and the three answers need three different endings.

**Switched on** — the feature is finished. Name the page you put the button on
and ask them to try it:

> Google Calendar is on, using Stencil's credentials, so there is nothing for you
> to set up. Open /agenda and connect your own account to see it working.

**Blocked** — repeat the `message` you were given. It already names the exact
screen, and it is written for someone who does not know what OAuth is. Do not
paraphrase it into jargon, and do not soften it into "you may need to configure
something".

**Nothing switched on** — say so plainly rather than reporting the build as
complete. A build whose connections are all blocked is a build the builder cannot
use yet, however good the code is.

You still cannot verify the **connection** itself: connections belong to members,
and there is no member until a person signs in and clicks Connect. But you can
and must verify the **switch**, which is app configuration, and the tool has
already read it back for you. Report what it found, never that you turned
something on and assumed.
