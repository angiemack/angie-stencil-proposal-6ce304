---
name: custom-auth
description: Customizing authentication — magic link, email OTP, passwordless, custom login/signup flows, "restyle the login page", "make the sign-in page match my brand", where a Sign in link should go, auth hooks, "login without a password", "email me a code", "change my email", "update login email", account settings, two-factor authentication ("2FA", "authenticator app", "TOTP", "backup codes"), or any change to how app users sign in or sign up. Load BEFORE touching auth. The platform's auth already includes email+password, Stencil OAuth, magic link, and email OTP; you almost never need new auth code, and you must NEVER instantiate betterAuth() yourself — doing so silently severs the app from platform signup tracking and email marketing sync.
metadata:
  agents: [chat, builder]
---

# Custom auth

The platform layer (`app/.stencil/auth/`) owns authentication. Its `createAuth`
already ships, enabled and wired to the app's email sender:

- **Email + password** (`emailAndPassword`)
- **Stencil OAuth** (the "continue with Stencil" flow)
- **Magic link** (`magicLink` — passwordless sign-in links)
- **Email OTP** (`emailOTP` — one-time sign-in codes)

A request for "magic link login", "sign in with a code", "add Google sign-in" or "turn
off passwords" is a **settings change, not app code**: call `configureAuth` with the new
`methods` (the app builder can also do it in Project settings → Launch → Login). The
hosted sign-in page reads that setting live and renders exactly those methods, with no
rebuild. Do not build a login form for it.

## One sign-in page per app

Stencil hosts the app's sign-in and sign-up pages at `/login` and `/signup`. The
dispatcher serves them before the app runs, they render the login methods from the
app's settings, and every platform redirect for a signed-out visitor (`requireAuth`,
`data()` with `requireUser`, a gated route) lands on `/login`. So every "Sign in" or
"Create account" control the app renders links there:

```tsx
<Link to="/login">Sign in</Link>
<Link to="/signup">Create account</Link>
```

Never point a Sign in control anywhere else, and never register `/login`, `/signup`,
`/forgot-password` or `/reset-password` in the app — the template's catch-all hands
those paths back to the dispatcher. "The login page isn't pretty" or "make it match my
brand" is not a reason to build a page either: the hosted page inherits the app's
`theme.css` and logo, so fix the theme (`editTheme`) and the logo, then check `/login`.

An app-authored sign-in page is the exception, built only when the app builder
explicitly asks for a sign-in page with a different layout. When you build one:

- Put it at a path of its own (for example `/sign-in`), never a reserved path.
- Call `getAuthConfig` first and render exactly the methods it returns, through
  `~stencil/auth/browser.client` (`signIn.email`, `signIn.magicLink`, `signIn.emailOtp`,
  `signInWithGoogle`). Offering a method the settings do not, or hiding one they do, is
  a defect in your change.
- Point every Sign in control in the app at that one page, so the app has one entry
  point it links to.
- Say in the build summary that platform redirects for signed-out visitors still open
  the hosted `/login`, and that a later change to the login methods needs a rebuild of
  this page, since only the hosted page reads the settings live.

## The one hard rule

**Never call `betterAuth()` yourself, and never bypass or reimplement the layer's
`createAuth`.** The layer's auth carries `databaseHooks` that report every signup
and session to the platform. A parallel Better Auth instance looks identical to
the app user but silently severs the app from:

- the platform's app-user analytics (the builder's App users tiles stop updating), and
- the builder's Flodesk email-marketing sync.

Nothing errors. The data is simply gone, permanently. Deploys warn when a bundle
has auth but lost this wiring — treat that warning as a defect in your change.

## Extension points that ARE yours

- **Hooks on auth events** (welcome flows, provisioning a profile row, sending a
  notification): create `app/auth-hooks.server.ts` default-exporting Better Auth
  `databaseHooks` (or `(env) => databaseHooks`). The layer merges them over its
  own — both run, platform first. Never edit `app/.stencil/auth/` for this.
- **Login/signup UI**: the hosted pages, unless the app builder explicitly asked for
  a page of their own (see "One sign-in page per app"). On an app-authored page, a
  "Continue with Google" button must call `signInWithGoogle({ callbackURL })` from
  `~stencil/auth/browser.client`, never `signIn.oauth2` directly: the App preview runs
  the app in a frame and Google refuses to load in one, so the helper opens Google in a
  popup and resolves with `{ error }` (`null` on success, an error code such as
  `signup_disabled` for the page to show).
- **Gating signups**: the app's `allowSignup` setting already controls whether the
  passwordless methods accept unknown addresses — don't rebuild it.
- **Requiring a verified email**: "make people verify their email", "block unverified
  accounts", "confirm the address before they can log in" is the app's **Require email
  verification** login setting (`configureAuth` with `requireEmailVerification: true`, or
  Project settings → Launch → Login), not app code. With it on, the platform sends the
  verification email at password sign-up, refuses sign-in until the link is opened, and
  the hosted login page shows a resend button. Magic link, one-time code and Google
  already prove the address. Never build a verification table, a verify screen or a
  per-route `emailVerified` gate to get this; flip the setting and stop. If the app has
  its own login form, `signIn.email` returns `EMAIL_NOT_VERIFIED` (403) while the account
  is unverified — show "check your inbox" and offer `sendVerificationEmail`.
- **Roles and admin screens** (admin, staff, "only I can see", "view as"): see `app-roles`.
- **Changing an app user's email**: the layer already supports it — build the form, see below.
- **Two-factor authentication**: the layer ships the enrolment and challenge pages — link to
  them, see below.

## Letting an app user change their email

"Let me update my email", "my login email changed", an account-settings page: this is a
**UI change**. The layer's auth already exposes Better Auth's `changeEmail`, and the
approval and confirmation emails are already themed and wired. Build a form in the app's
account settings that calls it from the client:

```ts
import { changeEmail } from "~stencil/auth/browser.client";

const { error } = await changeEmail({ newEmail, callbackURL: "/settings" });
```

What happens next is the platform's, not yours:

- **Verified account** (signed in by magic link, code, or Stencil): an approval email goes
  to the **current** address. Approving it sends a confirmation link to the new address;
  clicking that switches the email and signs the browser in with it. Tell the app user to
  check their *current* inbox first — the new one gets nothing until they approve.
- **Unverified account** (email + password, never verified): the confirmation link goes
  straight to the new address, since the old one was never proven to be theirs.
- A new address that another account already uses returns success with no email, so
  address existence is not leaked. Show "check your inbox" either way.
- The call needs a recent sign-in. If it fails with a session error, send the app user
  back through login and retry — don't build a workaround.

**Anything keyed on email re-keys when the email changes.** Admin allow-lists, "the app
builder's address is the admin", client portals matched by email, invites, seller and
buyer lookups by `buyerEmail`: after a change, an app user that was matched by their old
address is a stranger to that rule. Before adding this form to an app, grep the app for
email-based checks and either move them to `user.id` (store the id at first match, as
`app-roles` and `workspaces` already do) or tell the app builder in the build summary
exactly which rules still match by email and will stop matching after a change. Never
silently ship a change-email form into an app whose admin gate is an email allow-list.

## App user accounts belong to the app, not to Stencil

An app user's account — email, password, sessions, second factor — lives in the app's own
database and is served by the app's own pages. Stencil hosts nothing for it: there is no
Stencil account page an app user could be sent to, and a link to Stencil's own site or to the
app builder's Stencil dashboard is wrong. When an app builder asks where their app users
change a password or turn on two-factor authentication, the answer is a page in *their* app
(the platform's stock pages below, plus the app's own account settings) — never "Stencil
manages that".

## Two-factor authentication for app users

Opt-in, per app user, authenticator-app codes (TOTP) with one-time backup codes. The layer
already ships everything; an app only needs a link.

**Enrolment page — `/auth/two-factor/setup`.** Platform-owned, registered by the auth route
pack. A signed-in app user scans a QR code, confirms one code, and gets ten backup codes to
download or copy. Add the link to the app's account settings; do not build a QR screen, a
secret table, or a verify form:

```tsx
import { useAuth } from "~stencil/ui/auth/context";

const { user } = useAuth();
<a href="/auth/two-factor/setup">
  {user.twoFactorEnabled ? "Two-factor authentication is on" : "Set up two-factor authentication"}
</a>
```

`user.twoFactorEnabled` is on the session user everywhere `requireAuth` hands it out.

**Challenge — `/auth/two-factor`.** Also platform-owned. Once enrolled, *every* app-local
sign-in asks for the code before a session exists: password, magic link **and** one-time
email code. Two-factor is a property of the account, not of one login method, so an app must
not offer a "code-free" method as a way around it. The hosted login page already sends people
to the challenge. An app with its own login form gets the same for free as long as it signs in
through `~stencil/auth/browser.client` (`signIn.email`, `signIn.magicLink`, `signIn.emailOtp`):
the client redirects to the challenge page when the server asks for it. A hand-rolled `fetch`
to `/api/auth/sign-in/*` must check for `twoFactorRedirect: true` in the response and navigate
to `/auth/two-factor?returnTo=…` itself.

**The one exception: "Continue with Google" (delegated Stencil sign-in).** That session is
not challenged — the identity provider already applied its own account security. Do not
try to wire a challenge onto it.

**Lost device.** The app builder resets an app user's second factor from Project settings →
their app users list (open the person, "Two-factor authentication" → Reset). The app user
then signs in with the first factor alone and can enrol again. There is no in-app "turn off"
for the app user in this version; do not build one on top of the plugin's disable endpoint,
which needs a password an app user may not have.

**Out of scope, and not app code:** SMS codes, passkeys, and an app-builder rule that makes
two-factor mandatory for everyone. Say so in the build summary and stop.

## If a method is genuinely missing

A capability the four built-ins can't express (SMS OTP, a third-party social
login) is **platform work, not app code**: say so in your build summary and stop,
rather than instantiating a second auth system that works today and orphans the
app's data forever.
