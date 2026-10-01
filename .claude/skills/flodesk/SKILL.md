---
name: flodesk
description: >
  Use whenever the app builder mentions Flodesk, email marketing, a newsletter or mailing
  list for their app's signups, or asks which email marketing platforms Stencil works with
  (Mailchimp, Kit/ConvertKit, Klaviyo, beehiiv, MailerLite, …). Flodesk is Stencil's NATIVE
  email-marketing integration: the app builder connects their Flodesk account and picks the
  segments new app user signups are added to — in chat via connectFlodesk, or on the app's
  Users page. Covers the in-chat connect flow, why it is not done until a segment is saved,
  broken sync, how to answer "which email platforms do you support", and why none of the
  sync is built in app code.
allowed-tools: connectFlodesk
metadata:
  agents: [chat, builder]
---

# Flodesk — the native email-marketing integration

Stencil ships one native email-marketing integration, and it is Flodesk. The app builder
connects their Flodesk account once for the whole workspace, then picks per app which
Flodesk segments new signups are added to. From then on, every new app user signup is
synced to those segments automatically by the platform. There is no code to write, no
webhook to stand up, and no API key to collect.

**Never say Stencil has no native email-marketing connection.** Flodesk is never registered
with `addCustomProvider` and never researched for OAuth endpoints — Stencil already holds
the OAuth client. Treating it as a missing provider is the exact wrong answer this skill
exists to prevent.

## In chat (chat agent only): `connectFlodesk`

When the app builder wants Flodesk — or wants their signups flowing into their email
marketing — call `connectFlodesk`. It puts an interactive card in this conversation:

- **Not connected** — a Connect button that opens the Flodesk sign-in in a popup.
- **Connected, no segments** — the segment picker, with "Nothing syncs until you pick a segment."
- **Syncing** — the picker showing the chosen segments and when it last synced.
- **Broken** — "signups aren't syncing" and a Reconnect button.

`connectFlodesk` stops your turn, and **you do not see its result until the builder next
writes.** So the one line you write before calling it must already carry the warning, for
example: *"Here's Flodesk — connect it and pick at least one segment; nothing syncs until
you do."* Then stop.

A `connectFlodesk` result is a **snapshot** of that moment. Before telling the builder
anything about Flodesk's status in a later turn, call it again.

Do not send the app builder to Settings for this. The card is the flow; the only other
place it lives is the app's **Users page** (Grow → Users), which you can mention as
where to manage it later.

Connecting needs a workspace owner or admin. The card tells anyone else so — suggest they
ask the workspace owner.

## It is not set up until a segment is saved

Connecting Flodesk syncs nothing on its own: the platform only sends a signup to Flodesk
when this app has at least one segment picked. After the builder connects, the card
switches to the segment picker by itself, and no message comes to you. When their saved
segments arrive as their next message, confirm which segments. If a result says
`needs_segments`, or the builder says they connected but did not pick one, say plainly
that nothing syncs yet and point at the picker. Never say "Flodesk is connected" as if
that were the end.

## When sync is broken

If a result is `needs_reconnect`, or `syncing` with an instruction saying the last sync
failed, say plainly that signups are not reaching Flodesk and that the card's Reconnect
button fixes it. Do not describe it as working.

## Answering "which email marketing platforms do you support"

Name **Flodesk first, as the built-in integration** — connected in one step from this chat,
signups sync automatically. Then, if the builder wants a different platform: most ESPs
(Mailchimp, Kit, Klaviyo, beehiiv, …) can be reached from app code through their own APIs
with an API key stored in the app's secrets — a build, not a native connection. Never
present that list without Flodesk at the top.

## What syncs, and what does not

The sync fires on **app account signups** that go through the platform's auth — and only
those. A contact form, a newsletter box, or a waitlist form does not reach Flodesk. If the
builder wants those in Flodesk too, say so honestly: the native sync covers signups, and
pushing a form's entries to Flodesk would be app code calling Flodesk's API with a key they
provide through `requestSecret`.

Replacing the platform's `createAuth` silently stops the sync — see the `custom-auth` skill.

## In a build (build agent)

You do not have `connectFlodesk`. Never try to call it. If the brief needs Flodesk
connected or segments picked, finish the build and tell the builder to say "connect
Flodesk" in the chat.

The signup→Flodesk sync is platform-side. Do not write Flodesk API calls, do not add a
signup hook that posts to Flodesk, and do not ask for a Flodesk API key — the OAuth
connection already covers it. A brief that says "add new signups to my Flodesk" is done by
connecting and picking segments, which happens in the chat or on the Users page, not in
app code.

The one Flodesk ask that is *not* this feature: an app whose **app users** market to their
own contacts through their own Flodesk accounts. That is a member connection to a provider
the catalog does not have — the `member-connections` skill's custom-provider path — not
this workspace-level integration.
