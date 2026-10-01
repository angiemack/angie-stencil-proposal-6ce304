---
name: app-roles
description: >
  App-level roles and admin screens — admin, admin panel, admin dashboard, "only I can see",
  staff, moderator, roles, permissions, "make me the admin", "admin vs user view", "view as",
  "preview as client", "see it as a member", "log in as", impersonate, "support a user with an
  issue". Use when a brief needs anyone in the app to have more access than an ordinary app
  user, wants to switch between the admin view and the app-user view, or wants to see the app
  as one specific app user does. Not for a shared workspace's member roles: `workspaces` owns
  those. Load BEFORE writing any admin route, role check, or view-as mode.
metadata:
  agents: [chat, builder]
---

# App roles, the admin ⇄ app-user toggle, and "view as this app user"

Three asks arrive in many wordings and get the same shape every time:

1. **An admin side of the app**: screens only the app builder (or their staff) can reach.
2. **A toggle between the admin view and the plain app-user view**, for testing.
3. **"View as a specific app user"**: see the app the way one app user sees it, to support them.

The platform has no admin role and no impersonation. All three live inside the app, built the
same safe way below. The App preview signs in as the **Preview User** (its id is in your prompt);
that account is an ordinary app user, and `isPreviewUser(user, env)` from `~stencil/auth/server`
recognises it. It is true only in the App preview: the Published app never holds a session for
that account, so a gate keyed on it can never open there.

## 1. The role model

- **Roles live in the app's own data.** Never in `app/.stencil/` and never on Better Auth's
  `user` table: the layer owns both. Use an `app_roles` entity (`user_id`, `role`) or a `role`
  column on the app's existing profile entity. Role names are text (`admin`, `staff`), so a
  later role needs no migration. Give the entity a rule that lets server code alone write it
  (`create`/`update`/`delete`: `nobody`); read may be `anyone`.
- **The App preview is admin through `isPreviewUser`, never through a row.** `getRole` below
  treats the Preview User as admin, and only in the App preview. Never insert the Preview User
  into `app_roles` or an allow-list: both deploys share one database, so the Published app
  would honour that row too.
- **Seed one admin on every build that adds admin screens: the app builder's own account** when
  their email is known, so the Published app works the moment they sign in. Match the app builder
  by their **verified** email on sign-in (the `workspaces` skill's invite rule), never by whoever
  signs in first: a "first sign-in claims admin" bootstrap is claimed by the Preview User and locks
  the app builder out of their Published app.
  Once matched, store their `user.id` in `app_roles` and never keep the email as the key: an app
  user can change their email from account settings (see `custom-auth`), and an email-keyed
  admin seat stops matching the moment they do.
- **One server helper, `app/lib/roles.server.ts`:**

```ts
import { requireAuth, isPreviewUser } from "~stencil/auth/server";
import { system } from "~stencil/data";
import { createCookie, redirect } from "react-router";

const viewMode = createCookie("view_mode", { httpOnly: true, sameSite: "lax" });

export async function getRole(request: Request, env: Env) {
  const { user } = await requireAuth(request, env);
  // The section-2 toggle: an admin browsing as an app user is treated as one everywhere.
  if ((await viewMode.parse(request.headers.get("Cookie"))) === "user") return { user, role: "user" };
  // The App preview is admin without a row; the platform makes this false on the Published app.
  if (isPreviewUser(user, env)) return { user, role: "admin" };
  const rows = await system(env).from("app_roles").list({ where: { userId: user.id }, limit: 1 });
  return { user, role: rows[0]?.role ?? "user" };
}

export async function requireRole(request: Request, env: Env, role: string) {
  const ctx = await getRole(request, env);
  if (ctx.role !== role) throw redirect("/app");   // or throw new Response("Forbidden", { status: 403 }) for an action
  return ctx;
}

export const isAdmin = (role: string) => role === "admin";
```

- **Every admin route's loader AND action calls `requireRole`.** Hiding a nav item is not
  enforcement; the POST still works.
- **Admin screens that must read every app user's rows** use `system(env)` **after**
  `requireRole` in the same loader. Never widen an entity's access rule to `anyone` to make an
  admin page work: that opens the rows to every signed-in app user, not just the admin.
- **When the app already uses `workspaces`,** the role is the membership row's `role`. Do not
  add a second role system.

## 2. The admin ⇄ app-user view toggle

For an admin, a header control **"View as app user" / "Back to admin"** that sets a view-mode
flag (a cookie is enough) for that browser. In app-user mode the admin nav and admin routes are
hidden and `requireRole` treats the caller as an ordinary app user (`getRole` above reads the
cookie). Identity never changes: this is a view mode, not impersonation, so it is safe
to build every time and it is what a tester wants nine times out of ten.

Set the cookie in an action with a native `<form method="post">` and redirect back through
`safeReturnTo` from `~stencil/auth/server`, so every loader on the page re-runs.

## 3. "View as this app user": the safe shape

When the brief asks to see the app as one specific app user ("preview as client", "view as
member", "log in as them", "support a user with an issue"):

- **A read-only preview.** The admin picks the app user (name and email from the app's profile
  entity). Loaders take the picked id from a signed cookie or a query param, call
  `requireRole(request, env, "admin")`, then read that app user's rows with `system(env)`
  filtered to that id (`where: { createdBy: pickedId }`). Every write path is disabled in this
  mode: actions check the flag and refuse, and forms render disabled.
- **A persistent banner on every screen:** "Viewing as Maya Chen, read-only", with an exit
  control that clears the cookie.
- **Record it:** a row in an `admin_view_log` entity (`admin_user_id`, `viewed_user_id`,
  `viewed_at`) written when the mode starts, so support use is auditable.
- **Never:** mint or copy a session as the other app user, touch `app/.stencil/auth`, call the
  platform's bypass or grant routes, or show the other app user's password or session. A brief
  that insists on true impersonation ("actually logged in as them") gets the read-only preview
  plus one sentence in the build summary saying the platform does not do session takeover.

## 4. What to tell the app builder

In the build summary, in plain words:

- **How to reach the admin side.** The App preview opens as admin (the app recognises the
  Preview User there, and only there). On the Published app, sign in with their own email; say
  whether that account was seeded or how it becomes admin.
- **How the toggle works,** when one was built: "View as app user" in the header, "Back to
  admin" to return; it changes what you see, not who you are.
- **That view-as is read-only and logged,** when one was built.

When the Chat Agent is asked "how do I see the admin side?", the answer is the same: the App
preview is the Preview User, which the app treats as admin through `isPreviewUser`; on the
Published app, their own email. An older app that seeded the Preview User as admin, or let the
first sign-in claim the seat, needs a build: "gate admin on isPreviewUser plus my own email, and
remove the Preview User's admin row".
