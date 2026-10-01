---
name: mcp-server
description: Turning this app into an MCP server so each app user can use it as a tool from their own AI assistant — "let people use my app from ChatGPT", "add a Claude connector", "expose my app to AI", "make this an MCP server", "connect this to claude.ai". Use whenever the brief means the person using the app drives it from claude.ai or ChatGPT, each acting only on their own data. ALSO use when a builder asks to turn the connector off, or reports it missing — "there's no MCP endpoint", "Claude can't find my server", "how do I disable the AI connector". Covers the app/mcp.ts manifest, the tool() helper and handler contract, app user scoping, the file-presence on/off switch, and how an app user connects from claude.ai and ChatGPT.
metadata:
  agents: [chat, builder]
---

# MCP server

Declaring one or more tools makes this app an **MCP server**: it exposes a
`/mcp` endpoint that AI assistants (claude.ai, ChatGPT) connect to, and each
tool becomes something the app user can ask their assistant to do — "create a task
in my app", "list my open invoices". A tool call runs **as the signed-in
app user**, so app user A's assistant only ever touches app user A's data.

This is the app user reaching *in* to the app from their assistant. It is not
the app reaching *out* to a third-party service on the app user's behalf — that is
app user connections, a different feature with a different skill.

## You are not wrong that you cannot hand-roll this

If you have refused a brief like this before, your reasoning was sound: MCP needs
an OAuth 2.1 authorization server, discovery documents, dynamic client
registration and a consent screen, and none of that can be written inside an app.
**All of that is still true.** Never write an OAuth flow by hand, never add a
`/mcp` route yourself, never build a consent page. The platform owns every piece
of that and it is already wired into this template.

What has changed is that there is now a sanctioned route: declare tools, and the
platform serves the rest. Use it.

## One file switches it on

The whole surface is driven by a single app-owned file, `app/mcp.ts`. It ships
empty. Declare a tool in it and the app becomes a connector; leave it empty and
none of the MCP surface exists.

```ts
// app/mcp.ts
import { z } from "zod";
import { tool, type McpManifest } from "~stencil/mcp";
import { createDb } from "~stencil/db";
import { tasks } from "~/generated/db-schema";
import { eq, desc } from "drizzle-orm";

export const mcp: McpManifest = {
  name: "Tasks",
  description: "Create and list the member's tasks.",
  tools: [
    tool({
      name: "create_task",
      description: "Create a task for the signed-in member.",
      input: z.object({ title: z.string() }),
      handler: async ({ title }, { env, member }) => {
        const db = createDb(env);
        const now = new Date().toISOString();
        const [task] = await db
          .insert(tasks)
          .values({ id: crypto.randomUUID(), title, createdBy: member.id, createdAt: now, updatedAt: now })
          .returning();
        return task;
      },
    }),
    tool({
      name: "list_tasks",
      description: "List the signed-in member's tasks, newest first.",
      input: z.object({}),
      handler: async (_args, { env, member }) => {
        const db = createDb(env);
        return db
          .select()
          .from(tasks)
          .where(eq(tasks.createdBy, member.id))
          .orderBy(desc(tasks.createdAt));
      },
    }),
  ],
};
```

Each tool has a name the assistant calls, a one-line `description` the model
reads to decide when to use it, a zod `input` schema (published to the client as
JSON Schema and validated on the way in), and a `handler`. The handler is a plain
server function — the same DB, the same SDKs a loader uses.

The route pack that serves `/mcp`, the two OAuth discovery documents and the
consent page is already spread into `app/routes.ts` as `...stencilMcpRoutes`.
**Do not add it again and do not remove it** — it serves nothing until a tool is
declared, so it is harmless when the app has no connector.

## The on/off switch is the file — say so plainly

**MCP is ON for this app exactly when `app/mcp.ts` exists and declares at least
one tool. To turn it OFF, remove (or move) `app/mcp.ts` and redeploy. There is no
settings toggle.** Emptying the `tools` array to `[]` has the same effect as
removing the file — both hide `/mcp` and both `.well-known` discovery documents,
which then return 404.

When a builder asks how to disable the connector, or to take it down, tell them
exactly this: there is no switch to flip — the connector exists because the file
declares a tool, so deleting the file (or clearing its tools) and redeploying is
how it goes away. Do not invent a settings option, and do not leave the file in
place while claiming it is off.

## Data scoping still applies

A tool call is authenticated as one app user: `ctx.member` is that app user, the same
shape `requireAuth` hands a loader. **Scope every read and write to
`member.id`**, exactly as the template's data-scoping rule requires — filter
queries by `createdBy = member.id`, set `createdBy: member.id` on insert.

This matters more here than almost anywhere, because the caller is an autonomous
assistant, not a person clicking through your UI. A `list_*` tool that forgets its
`where` clause hands one app user's assistant every app user's rows. Never take an
owner id, an app user id, or a "list everything" flag as tool `input` — the app user
is `ctx.member`, never an argument.

## Tools that write records the app already shows

A tool that creates or mutates records an existing screen renders is a second door into
that screen's data, not a fresh surface. CLAUDE.md's "Server entry points that write
records the app already shows" rules apply in full:

1. **Same vocabulary.** Reuse the existing status enum and field names. Never insert a
   status, kind or flag value the consuming UI does not render; if a new state is
   genuinely needed, add it to the type, the UI and every reader in the same change.
2. **Same pipeline.** Route the write through the same server function the UI path uses
   (or extract one shared function), so a tool-created record reaches the same terminal
   state by the same steps. A tool must never leave a record in a state nothing on the
   server advances.
3. **Prove it renders.** Before claiming done, create one record through the tool's path
   and confirm it appears correctly on the existing screen and progresses (or can be
   progressed by the app user) to its terminal state. "I cannot test a live connector"
   does not excuse this — the handler is a plain server function, so exercise it
   directly.
4. **Honest descriptions.** Tool descriptions and any notification copy may only name
   statuses and screens that actually exist.

How this goes wrong, concretely: an app's screens and status poller knew
`queued | rendering | succeeded | failed`; a new `create_batch` tool inserted rows with
an invented status `"pending"` and emailed the app user about an approve screen that did
not exist. Nothing on the server ever advanced a `"pending"` row, so every tool-created
batch showed "0 of N done" forever — and a sibling `get_batch_videos` tool filtered on
another invented status, `"done"`, so it could never return anything. Each rule above
would have caught it.

## How an app user connects

Once a tool is declared and the app is deployed, an app user connects it from inside
their assistant. They need the app's MCP URL, which is the app's own origin with
`/mcp` on the end (e.g. `https://your-app.example.com/mcp`).

- **claude.ai** — Settings → Connectors → Add custom connector, paste the `/mcp`
  URL. Claude walks them through signing in to the app and approving access; after
  that the tools show up in the conversation.
- **ChatGPT** — connectors live behind **developer mode**, which the app user turns
  on in settings and which needs a paid plan (Plus, Pro, Team, or Enterprise).
  They add the same `/mcp` URL there.

Both flows sign the app user in through the app's normal login and show a consent
screen naming the connecting client before any tool can run — that is the
platform's OAuth, not something you build or can skip.

## What to tell the builder

The builder cannot see the connector work until an app user signs in and connects
from their assistant, so hand them something they can act on:

- The connect URL — their app's origin + `/mcp`.
- Where an app user adds it: claude.ai Settings → Connectors, or ChatGPT developer
  mode (paid plan).
- That each app user only ever reaches their own data, and that the app user approves
  access on a consent screen first.
- If they want it off: delete `app/mcp.ts` (or clear its tools) and redeploy —
  there is no toggle.

## Before you report done

You can verify the **manifest** — that `app/mcp.ts` declares the tools the brief
asked for, that each handler scopes to `member.id`, and that the app builds. You
**cannot** verify a live connection: there is no app user until a real person signs
in and connects from their assistant, and no assistant runs inside the build.

What you CAN and must still verify: if a tool writes records an existing screen shows,
one record created through the tool's server function has been seen on that screen and
reaches its terminal state (see "Tools that write records the app already shows" above).
The live-connection caveat covers the OAuth handshake, not the handler.

So report what is true. Name the tools you declared and the connect URL, tell the
builder how an app user adds it from claude.ai or ChatGPT, and say plainly that the
end-to-end check is theirs to run once. Do not claim you connected it or tested a
tool call — you did not, and cannot.
