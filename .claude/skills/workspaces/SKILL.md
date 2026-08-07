---
name: workspaces
description: Use when data is shared between several people — workspaces, teams, organizations, shared accounts, "invite my teammates", "everyone in the group can see it", members and roles, switching between workspaces. Do NOT use for apps where each user owns their own private data; those scope by created_by and need none of this. Covers the data model, query scoping, switching, roles, UI shape, and retrofitting workspaces onto an app that already has data.
---

# Workspaces — rules for a workspace-scoped app

## First, decide whether this app needs workspaces at all

Every app scopes user data by `created_by` **or** `workspace_id`. Pick one:

- **One person owns their rows, nobody else sees them** — a habit tracker, a personal
  CRM, a journal. Scope by `created_by` and **stop here**. Adding workspaces costs three
  tables, a switcher, an invite flow, and a role system nobody asked for.
- **Several people work on the same rows** — a team CRM, a shared inbox, anything with
  "invite", "our", "the group", "collaborate". Workspaces. Continue.

Ambiguous briefs default to `created_by`. Retrofitting workspaces later is a well-worn
path (last section); tearing them out is not.

## Non-negotiable

Break one of these and the app either leaks one tenant's data into another or shows
nothing at all. Everything after this section is a recommendation.

1. **Filter by workspace on writes as well as reads.**
   `where(and(eq(t.id, id), eq(t.workspaceId, workspaceId)))`. Matching on `id` alone
   lets a member of one workspace edit another's row by guessing an id.
2. **Validate the active-workspace cookie against membership on every request.** Treat it
   as a hint, never as authorization; fall back to the user's first membership.
3. **Enforce role server-side, per mutation.** Hiding a form from non-owners is not
   enforcement — the POST still works. `invite` is the one that gets forgotten.
4. **On an existing app: add the column, backfill, then scope the queries — in that
   order.** Scoping first hides every existing row behind an empty list.

## Data model

- Three entities: `workspaces` (name, created_by), `workspace_members` (workspace_id,
  user_id, email, name, role), `workspace_invites` (workspace_id, email, role, status,
  token). Create with `dev-tools create-entity`; `app/generated/db-schema.ts` is
  regenerated every build and never hand-edited.
- Add `workspace_id` to tables holding **shared user data** — including ones the brief
  doesn't name, since a table without it is shared by every workspace. Skip lookup
  tables, config, tiers, and anything account-shaped. `dev-tools db regenerate-schema`
  lists what exists so you can check coverage.
- Keep `workspace_id` optional. Existing rows carry `NULL` until the backfill runs, and
  a required column blocks that path.
- Denormalize `email` and `name` onto `workspace_members` (and `workspace_name` /
  `invited_by_name` onto invites) — the auth user table isn't joinable from app queries.
- **Workspace membership is not the app's own idea of a "member".** A band app has
  players, a clinic has staff — those stay in their own domain table with their own
  roles. `workspace_members` governs who can see the workspace; the domain table governs
  who does what in the product. Conflating them produces two half-correct tables.

## Access and lifecycle

- Resolve context in one place — `getWorkspaceContext(request, env)` in
  `app/lib/workspace.ts`, returning `{ user, db, workspaceId, role, memberships }`. When
  loaders call `requireAuth` + `createDb` directly, scoping is what gets skipped.
- Scope every read, not just list pages: counts, aggregates, search, exports.
- Give a user a workspace on first load rather than gating them behind a "create your
  first workspace" screen — mint a personal one and make them owner.
- Accepting invites by email match on the invitee's next load avoids an accept-link route
  and any dependency on email delivery. Sending the invite email is optional polish.
- Both of the above put writes in a read path, so two loaders on one page can race and
  mint two workspaces. Acceptable for first-load provisioning; don't extend the pattern
  to anything higher-frequency.
- **Surfaces with no session can't call it.** `getWorkspaceContext` redirects to
  `/login`, so cron handlers, webhooks, and public routes (a QR capture link, a shared
  form) must receive their workspace explicitly — from a token or by looking up the row
  they're acting on — and still filter by it.

## Switching

- Everything on the page depends on the active workspace, so switching has to re-fetch
  **all** loader data. A native `<form method="post">` → `redirect` gets that for free;
  a client-side submit re-runs some loaders and leaves stale rows on screen. Use the form
  unless you have a specific reason and have checked the whole page revalidates.
- Set the cookie in the action and redirect back to the referer, validated same-origin
  and in-app, falling back to the app root.
- Switching to a workspace the user doesn't belong to should be a silent no-op, not an
  error.

## Routing

- **Every rendered app shell needs workspace context in scope** — from its own loader or
  from a parent route's. When one route misses it, the switcher is empty on that page
  only, which reads as "switching is broken" and sends you debugging the wrong file.
- Prefer rendering the shell once in a layout route; then there is a single loader to get
  right. If instead each route renders the shell, each of those loaders must return the
  workspace list and active id, and every one of them needs checking.

## UI

Shape, not measurements. The numbers below are what worked on one app in one theme —
match the app's own scale instead of copying them.

- The switcher is a compact single line: monogram, truncated name, chevron. It sits above
  the nav and should read as subordinate to it. Ensemble used a `h-6 w-6` monogram at
  `text-[10px]` with `py-1.5`; a denser or airier theme wants different numbers, the same
  proportions.
- Keep the role out of the trigger. A second line turns it into a tall block; role
  belongs on the settings page.
- The dropdown lists every workspace the user belongs to, active one marked. A switcher
  that doesn't show the list isn't a switcher — this is the most common way this feature
  ships broken.
- "New workspace" belongs in a dialog opened from the switcher, not as a section on the
  settings page.
- Inputs in dialogs and inline settings rows want the compact variant; the default
  `Input` is sized for full-page forms and reads as oversized in a row. On Ensemble that
  meant `h-9 text-sm`.
- Prefer an actionable dropdown over a badge for role, with destructive actions
  line-separated at the bottom of that same dropdown rather than a bare trash icon.
- A workspace settings page usually needs only three things: rename (owners), the members
  list, and one combined invite-and-pending card. Leave out a workspace list (the
  switcher is that), a create section (the dialog is that), and "Leave workspace" unless
  it was asked for.

## Retrofitting an app that already has data

- The backfill claims rows by creator: set `workspace_id` where
  `created_by = <user> AND workspace_id IS NULL`, inside the first-membership branch of
  `getWorkspaceContext`. Scoping by `created_by` is what keeps it correct when several
  users already have data.
- Rows whose `created_by` matches nobody who signs in stay `NULL` and invisible. That's
  the intended outcome — don't sweep them into the first workspace.
- **Seed rows the same way**: set `created_by` to the preview user and leave
  `workspace_id` NULL, so the backfill claims them on that user's first load. Inventing a
  `workspace_id` for seeds makes them exist in the database and never appear in the
  preview — which looks like a broken app rather than a scoping mistake.
