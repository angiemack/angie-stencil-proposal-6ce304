---
name: member-connections
description: Letting each of the app's app users connect their OWN third-party account — "let my users connect their Google Calendar", "sync each customer's Slack", "read the signed-in user's Notion", "pull their calendar/inbox/CRM". Use whenever the brief means *the person using the app* connects a service, rather than the app owner connecting one centrally. Covers the app/connections.ts manifest, the ~stencil/connections SDK, requireConnection, <ConnectButton>, switching providers on, registering a service the catalog does not have, the builder's own OAuth credentials and each provider's review tier, and diagnosing a connection that stopped working.
allowed-tools: enableMemberConnections addCustomProvider memberConnectionStatus
metadata:
  agents: [chat, builder]
---

# App user connections

Each app user of this app connects **their own** third-party account, and the app
then acts on their behalf. App user A's calendar is never visible to app user B, and
neither is visible to the app's owner.

## First, is this actually the feature they want

Two different things get described with the same words.

| They mean | Feature | Where it lives |
|---|---|---|
| Every app user connects their own account | **App user connections** | App settings, Build, App user connections |
| One business account everyone shares | App secrets | App settings, Build, Secrets |

"Connect Stripe so we can take payments" is the second, and so is a company
inbox or a single API key. If you are unsure, ask whose account it is: theirs, or
each of their users'. If the brief means "the business connects its Stripe", this
skill does not apply.

**There is one third answer, and it is Flodesk — nothing else.** Flodesk is the
native email-marketing integration: a workspace-level connection the app builder
makes once, after which new signups sync to the Flodesk segments they pick. It is
handled by the `flodesk` skill (in chat, the `connectFlodesk` tool does the whole
flow inline) — load that skill rather than forcing Flodesk into either row above.
For everything else the two rows are the whole list. Stencil used to have an
account-level `Settings → Connectors` tab where an app builder connected their
own account for the chat agent to use, and it was retired in September 2026
because in production it was never once used for that. Never tell an app builder
to connect a service "in Settings", never build against a connection held by
their Stencil account rather than by the app, and if a brief only makes sense
with an account-level connector, say that it is not a thing rather than inventing
a route to it.

## You are not wrong that you cannot hand-roll this

If you have refused a brief like this before, your reasoning was correct: the
platform owns authentication, there is no per-app Google client, and a bespoke
OAuth flow written inside an app is non-functional. **All of that is still
true.** Never write a provider sign-in by hand, never add an `/auth/google`
route, never ask for a client secret in app code.

What has changed is that there is now a sanctioned route. Use it.

## Start from the scaffolds

`app/connections.ts` already exists in every app, shipped empty — edit it, do not
create it. The layer imports it directly, so a deleted manifest is a build error,
not a quietly disabled feature.

```bash
cp /opt/design/scaffolds/connections/gated-route.tsx app/routes/agenda.tsx
```

The scaffold is a worked example. Adapt the providers, the reasons, and the page.

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
import { stencilConnectionRoutes } from "./.stencil/react-router/connections/routes";

export default [
  index("routes/home.tsx"),
  ...stencilConnectionRoutes,
] satisfies RouteConfig;
```

**Never add one without the other.** `requireConnection` sends app users to
`/app/connections`, which the route pack provides. A manifest with no registered
pack means every gated page redirects an app user to a 404, and nothing in the build
will tell you.

`reason` is shown to the app user, in the app's voice. Say what the app does with
the data, not what the integration is called.

## Switch it on, or the code you just wrote does nothing

**A provider must be switched on for this app before any app user can connect it.**
Writing the manifest does not do that, and `<ConnectButton>` renders nothing
until it is. An app that looks unbuilt is usually an app that is not switched on.

So, immediately after editing `app/connections.ts`, call:

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

Redirects to `/app/connections?needed=google-calendar` when the app user has not
connected. Shaped like `requireAuth` on purpose.

For an `optional: true` provider, read the status instead and degrade:

```ts
const status = await getConnectionStatus(env, user.id, "slack");
if (status === "connected") { /* the extra feature */ }
```

## Using the connection

```ts
const member = createConnections(env).as(user.id);

// A catalog provider's own tool. Input is validated against the tool's schema.
const events = await member.call("google-calendar", "listGoogleCalendarEvents", {
  time_min: new Date().toISOString(),
  max_results: 100,
});
```

For availability, read each event's `busy` boolean — it reflects Google's
Free/Busy marker, so a Free event or an informational all-day entry (`allDay`
plus `eventType` like `birthday`) does not block, while a Busy block does. And
`createGoogleCalendarEvent` takes `add_google_meet: true` to attach a Google
Meet link, returned as `meetLink`.

**A provider offers `call` or `request`, and you do not get to choose which.**

```ts
// Passthrough. `path` is a path, not a URL, and stays on the provider's host.
const rows = await member.request("google-sheets", {
  method: "GET",
  path: "/v4/spreadsheets/1abc.../values/Sheet1!A1:D50",
});
```

Prefer `call` where the provider has tools: input is validated against the
tool's own schema and the URL is the handler's business, not yours. But most
connectors have no tools at all — the Google Workspace ones, Analytics,
BigQuery, Search Console — and for those `request` is the only way in.

You cannot tell which from the slug, so **do not guess twice.** Try `call` and
read the error: `<provider> has no tools` means switch to `request`, and a wrong
tool name comes back naming every tool the provider does have. Both errors are
`invalid_input` and both tell you what to do next.

`provider_not_configured` from `request` means something different and is not
your cue to go back to `call`: that provider has no API base URL, so it offers
neither path. Say so to the app builder rather than working around it.

### Ask before you write, not after it fails

**`memberConnectionStatus` tells you what each switched-on provider can do** — its
`capability` field names which of the two call styles it takes, the calls worth
making, and what it will never do. Read it before you write the code that uses a
connection, not only at the end:

```
google-docs: Read, create and edit a document you already have the id for. Cannot
find the app user's existing documents.
Use member.request("google-docs", { method, path }) — member.call has no tools to reach.
Can: POST /v1/documents  (create) · GET /v1/documents/{id} · POST /v1/documents/{id}:batchUpdate
Cannot: List the app user's documents. The Docs API has exactly three methods and
none of them enumerates...
```

**Read the `Cannot` line before you design the page.** Several connectors cannot
enumerate an app user's own resources at all — Docs, Sheets, Slides, Forms and
Analytics each need an id the app has to obtain some other way. A "your recent
documents" list is not buildable on those, however the brief is worded, and the
honest move is to build what the connector does support and tell the app builder
plainly. Designing the list first and discovering this from a 404 wastes the
build.

The same text comes back from `enableMemberConnections` and from the error if you
call the wrong way, so there is never a reason to guess.

Tool names, where a provider has tools, are its own and not a shape you can
guess: it is `listGoogleCalendarEvents`, not `listEvents`. A wrong name comes back
naming every tool that provider does have:

```
`listEvents` is not a tool of google-calendar. Available: createGoogleCalendarEvent,
deleteGoogleCalendarEvent, listGoogleCalendarEvents, listGoogleCalendars.
```

Take the name from that list. **Never loop over candidate names or provider-slug
variants.** A provider with no tools answers every guess identically, so a search
like that always ends in the same place: no data, no error the app user can act on,
and a page that looks broken. If one call fails, read what it told you.

A custom provider you added yourself is always `request`, never `call` — it has
no tools by construction:

```ts
const res = await member.request("acme-crm", { method: "GET", path: "/v2/contacts" });
```

Server-side only — a loader, an action, or a scheduled handler.
`createConnections` throws if called anywhere else, because it needs the app's
own bearer key and that key must never reach a browser.

Errors are typed. Branch on `error.code`, do not match on message text:
`not_connected`, `needs_reauth`, `provider_not_configured`, `provider_error`,
`invalid_input`, `rate_limited`.

## Always place an inline entry point

`requireConnection` guarantees no app user hits a dead end. It does **not** help an
app user who never opens a gated page and therefore never learns the feature
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

## Data scoping still applies

An app user's connected data is theirs. Any row derived from it carries
`created_by = user.id`, exactly as the template's data-scoping rule requires.

Worth stating because "the calendar" reads like shared data and is not. Two
app users of the same app must never see each other's events.

## The service is not in the catalog

**Flodesk is not this case.** It is native. Load the `flodesk` skill; in chat use
`connectFlodesk`. Never `addCustomProvider` for it, unless the brief is each app user
connecting their own Flodesk account.

**Offer setup — never stop at "Stencil does not support that".** Blocking the
whole build on a missing connector is the failure this capability exists to
remove. A brief that mentions one service the platform does not know is not an
unbuildable brief. Register it, and continue with the rest of the app either way.

Use `addCustomProvider` — a chat step, not a build one, since the OAuth client is
created in the app builder's own name. If you are mid-build, write the rest and tell them
this one registration happens in the conversation. It needs the service's authorize URL,
token URL, API base, and scopes, which are in that service's developer documentation, plus an
OAuth client the builder creates in that service's developer console.

**It will refuse until the builder has approved the API host out loud.** That is
deliberate and you cannot self-certify it: if you read those URLs off a web page,
you are the party that read the page, and every app user's token gets locked to
whatever host it named. Show them the exact host and ask:

> I read these settings from Acme's developer docs. Requests from your app will
> go to `api.acme.com` and nowhere else. Can you confirm that is the right
> address?

Then call the tool with `hostConfirmedByBuilder: true`.

The tool has **no field for a client secret** and refuses a payload that looks
like it contains one. It returns the next steps, including the link to the secure
form. Follow them.

## When the builder wants their own credentials

Nothing needs setting up when Stencil already supplies a working client, so do
not walk them through a developer console, a redirect URI, or a client secret
when none of that is needed. Mention the option **once**, plainly, and move on:

> App users will see Stencil's name on the permission screen, the same as they
> already do when they sign in to your app. If you would rather they saw yours,
> you can use your own credentials in settings. Either way this works now.

Do not turn that into a decision they must resolve before you can continue.

If they do want their own, say the review tier **before** they start, because it
decides whether this is ten minutes or several weeks:

| Service | What to tell them |
|---|---|
| Notion, most SaaS | About ten minutes, no review needed |
| Slack | Slack must review it before it installs into other workspaces |
| Google Calendar | Works for about 100 app users, and app users see a "not verified" warning from Google until verification completes |
| Gmail, Google Drive | Requires a paid security assessment, renewed yearly |

Then, in this order:

1. **Say how many app users will be disconnected**, before they open the console.
   Ten minutes of setup is the wrong moment to learn that 128 people will have to
   reconnect. The number is on the Manage panel.
2. **Give them the redirect URI to register first**:
   `https://app.hellostencil.com/api/member-connections/callback`. Registering it
   late produces `redirect_uri_mismatch`, which tells a non-developer nothing.
3. **Publishing status is a step, not a footnote.** A new Google consent screen
   defaults to Testing and refuses every app user who is not a listed test user.
   Ask them to confirm it reads "In production".
4. **The secret goes in the secure form in settings, never in chat.** Anything
   pasted into a message is stored with the conversation.
5. **Say that this affects one app.** Their other apps are untouched. That is
   only reassuring if they know it.

## Everything is editable in settings

Nothing here is chat-only. Switching whose credentials are used, replacing them,
running the connection check, copying from another app, and removing the
integration are all in **App settings, Build, App user connections**.

Say so when you set something up, so they know where it lives.

## When a connection breaks

The connection check on the Manage panel separates what Stencil verified just
now, what real app users actually did, and what the builder told us. A tick means
verified; a bullet means somebody said so.

The one to read first is **"members are being refused"**. Two or more different
app users refused in a week almost always means the consent screen is in Testing,
not that the credentials are wrong. On the builder's own Google client, them
connecting successfully does not prove their app users can — a consent screen left
in Testing mode works for the owner and refuses everyone else.

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

You still cannot verify the **connection** itself: connections belong to app users,
and there is no app user until a person signs in and clicks Connect. But you can
and must verify the **switch**, which is app configuration, and the tool has
already read it back for you. Report what it found, never that you turned
something on and assumed.
