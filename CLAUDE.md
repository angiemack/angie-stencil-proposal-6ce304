# App Template

Full-stack web app using React Router 7, Tailwind CSS, and Cloudflare Workers. 

## About this app

"A Note For Martha." is a single-page private letter — a proposal from Angie
McPherson to Martha, presented as a polished editorial note.

- **The letter** is served at `/` as a plain static HTML document (a resource
  route in `app/routes/home.tsx` — no React, no framework layout). All of its
  copy, styling and the scroll-in animation live inline in that one file.
- **Design**: paper (#FBF6F4) background, charcoal (#3B3B3B) text, the custom
  EditorsNote serif for headings and Public Sans for body. Colours are hardcoded
  hex, so the page ignores the visitor's system dark mode.
- **Access**: the whole letter sits behind a shared-password gate. The password
  screen is its own static HTML route at `/gate`, importing none of the letter's
  content. `app/lib/gate.server.ts` holds the one gate mechanism — the password,
  the opaque unlock cookie (httpOnly/Secure/SameSite=Lax, 30 days), and the
  checks. The letter's loader redirects to `/gate` unless the cookie is valid;
  `/gate` sets the cookie on a correct password and redirects back. Both pages
  carry noindex/nofollow (meta tag + X-Robots-Tag).
- There is no database, auth login, email or payments use — `/app` just
  redirects to `/`.

## Platform-managed — don't touch

- `app/.stencil/` — **all** platform-provided code (auth, service SDKs, payments, the strings runtime, worker + server entries). Import from it as `~stencil/*`, never edit anything inside it.
- `app/generated/` — written for you by the entity tools; never edit directly
- `app/entry.server.tsx`, `workers/app.ts` — convention-pinned re-exports of the real entries in `app/.stencil/react-router/worker/`; leave them as-is (never remove `strings` from the worker's load context)
- `app/strings/strings.json` — the platform strings **content** is the one platform-managed file you *do* edit (add/adjust copy here); the strings **runtime** is split by layer and none of it is yours to touch: `<Text>` in `app/.stencil/ui/strings.tsx`, `withStrings` in `app/.stencil/react-router/strings.ts`, `loadStringsFromStorage` in `app/.stencil/strings.ts`
- `app/root.tsx` loader — `withStrings<Route.LoaderArgs>()` passes strings to all routes; never remove it
- `<StencilRoot>` in `root.tsx` — wraps `<Outlet />` and supplies platform strings to every `<Text>` plus the preview navigation bridge. Never remove it or render `<Outlet />` outside it: every `<Text>` on the site goes blank.
- `react-router.config.ts`, `vite.config.ts`, `tsconfig.json`, `wrangler.jsonc` — config files. **One exception:** if `vite.config.ts` imports `vite-plugin-checker`, delete that import and its `checker(...)` entry. The package is no longer installed, Vite cannot load the config at all (`ERR_MODULE_NOT_FOUND`), and this is the only place it can be healed — older apps still restore a config that has it.
- The `rel=icon` link in `root.tsx` — never remove it or change its href. To give the app a custom favicon, leave the link alone and replace the *file* it points at: copy the builder's image over `/workspace/.public/assets/logo.png` (see "User-uploaded files").
- The `/theme.css` stylesheet link in `root.tsx`'s `links` function — never remove or replace it; without it the app loads with no design tokens at all
- The `ErrorBoundary` in `root.tsx` — a pinned one-liner rendering `PlatformErrorBoundary` from `~stencil/react-router/error-boundary`; leave it as-is. It already themes itself from the app's tokens, so don't reimplement it to restyle it.

## Project Structure

```
app/
  root.tsx              — Root layout (html, head, body, Meta, Links, Scripts)
  app.css               — Tailwind imports + @theme inline mappings
  theme.css             — Design tokens: :root and .dark CSS variable blocks — edit this for colors, radius, fonts, etc.
  routes.ts             — Route table (add new routes here)
  routes/
    home.tsx            — Home page route ("/") — a STUB; replace it entirely
    app.tsx             — Authenticated route ("/app") — a STUB; replace it entirely
  components/ui/        — shadcn/ui components (pre-installed)
  components/design.tsx — this app's design language (PageContainer, PageHeader, SectionHeading, Panel, StatusBadge, EmptyState, MetricStrip), when present; every screen imports these and never re-implements them
  lib/
    utils.ts            — cn() utility (app-owned)
  strings/
    strings.json        — editable platform strings content (add copy here)
  mcp.ts                — MCP tools this app exposes. Ships empty; EDIT, don't create.
  connections.ts        — third-party accounts app users connect. Ships empty; EDIT.
  auth-hooks.server.ts  — react to signup/login events. Ships empty; EDIT.
                          The layer imports these three directly, so deleting one is
                          a build error rather than a quietly disabled feature.
  .stencil/             — ALL platform code (import as ~stencil/*, never edit)
                          Four parts. They never import across the ui/rest line, and
                          only react-router/ knows React Router exists:
                            ui/           — React components; no framework imports
                            types/        — types only; .ts, erased, never fetched
                            react-router/ — thin RR glue: route modules, route packs,
                                            worker entries, the root wrapper
                            everything else — server SDKs, framework-agnostic .ts
                          ui/ imports only ui/ and types/; nothing outside ui/ and
                          react-router/ imports ui/. Enforced in CI.
    auth/               — Auth server SDK (requireAuth, getSession, createAuth, schema)
    db.ts               — createDb(env) — Drizzle ORM wrapper for D1
    storage.ts          — createStorage(env) — R2 storage wrapper
    files.ts            — file export + download helpers (see the `file-export` skill)
    ai.ts               — createAI(env) — AI provider registry (OpenAI + Anthropic)
    email.ts            — createEmail(env) — send + receive email (see the `email` skill)
    push.ts             — createPush(env) — send Web Push notifications
    notifications.ts    — createNotifications(env) — the in-app notification store (see the `in-app-notifications` skill)
    search.ts           — createSearch(env) — web search / discovery (Exa)
    tenant.ts           — the app user a request belongs to, when the app builder
                          gives app users their own subdomains (see the `subdomains` skill)
    fetch.ts            — createFetch(env) — fetch a known URL as markdown (Firecrawl)
    image.ts            — createImage(env) — generate (Workers AI) + transform/resize (Cloudflare Images) at runtime
    payments/           — selling + subscription SDKs
    strings.ts          — loadStringsFromStorage
    http.ts             — redirect() (no framework behind it)
    ui/                 — <Text>, the error screen, useHydrated/ClientOnly,
                          AuthProvider/useAuth, the connections UI
    types/              — AuthUser, ConnectionStatus/View, StringKey, AppContext, …
    react-router/       — route modules, route packs, withStrings, <StencilRoot>,
                          the ErrorBoundary adapter, worker + server entries
prerender.ts            — Paths to pre-render at build time
workers/
  app.ts                — pinned re-export of ~stencil/react-router/worker/app
public/                 — Static assets (favicon, etc.)
```

## Routes

Add routes in `app/routes.ts`:

`routes.ts` is the one file that imports the auth route pack with a **relative**
path (`./.stencil/react-router/auth/routes`), not the `~stencil` alias — React Router's config loader
evaluates it before the tsconfig path aliases are applied. Everywhere else, import
platform code as `~stencil/*`.

```ts
import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { stencilAuthRoutes } from "./.stencil/react-router/auth/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  ...stencilAuthRoutes,
] satisfies RouteConfig;
```

**Page route** — exports a default component, plus optionally `meta`, `loader`, `action`:

```tsx
import type { Route } from "./+types/my-page";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Page Title" }, { name: "description", content: "..." }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const db = createDb(context.cloudflare.env);
  const records = await db.select().from(contacts).limit(50);
  return { records };
}

export default function MyPage({ loaderData }: Route.ComponentProps) {
  return (
    <ul>
      {loaderData.records.map((r) => (
        <li key={r.id}>{r.name}</li>
      ))}
    </ul>
  );
}
```

**Resource route** — no default component; use for webhooks or API endpoints:

```ts
import type { Route } from "./+types/api.webhook";

export async function action({ request, context }: Route.ActionArgs) {
  const payload = await request.json();
  return Response.json({ ok: true });
}
```

A resource route that writes records an existing screen renders follows the "Server entry points that write records the app already shows" rules below.

**Redirecting to a caller-supplied destination:**

Any route that forwards a visitor to an address carried in the request — a `returnTo` param, a link-click tracker, a post-action "continue" bounce — MUST pass it through `safeReturnTo` from `~stencil/auth/server` first, whether or not the screen involves sign-in. It returns the value only if it resolves to a path on the app's own origin, and falls back to `/app` otherwise. Never hand-roll this check: a leading-slash test is not enough (`//evil.example` passes it and leaves the site).

```tsx
import { redirect } from "react-router";
import { safeReturnTo } from "~stencil/auth/server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return redirect(safeReturnTo(url.searchParams.get("returnTo")));
}
```

## Data Loading

Fetch data in `loader` — it runs server-side before render.

```tsx
// BAD — don't fetch on the client
export default function Page() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then(setData);
  }, []);
}

// GOOD — fetch in the loader, data arrives with the HTML
export async function loader({ context }: Route.LoaderArgs) {
  const db = createDb(context.cloudflare.env);
  const records = await db.select().from(contacts).limit(50);
  return { records };
}
```

### Controls that change what data is shown

A loader runs only on navigation. A control — a filter, tab, picker, or sort —
whose value sits in `useState` beside data read once from `loaderData` re-renders
the same stale payload after every change: the control does nothing until the app
user leaves the page and comes back.

> **Load the `control-driven-data` skill before writing any screen where a
> control decides what loaded data is shown.**

### Server-only code (`.server` modules)

Keep server-only helpers — anything that touches the database, secrets, `context.cloudflare.env`, or a platform SDK — in a `*.server.ts` module (e.g. `app/lib/trends.server.ts`). React Router strips `.server` imports **only** from a route's `loader`, `action`, `middleware`, and `headers`. If any client-reachable code references the module — the default component, a `~/components/*` it renders, or any non-loader export — it gets bundled for the browser and the **build fails** with "Server-only module referenced by client".

Reference the helper only inside `loader`/`action` and pass its result to the component through `loaderData`:

```tsx
// BAD — the component references the server helper, so it's bundled for the
// client and the build fails.
import { getTrend } from "~/lib/trends.server";

export default function Trend() {
  const trend = getTrend(id); // runs in the browser bundle → build fails
  return <TrendChart trend={trend} />;
}

// GOOD — the helper is referenced only in the loader; the component reads loaderData.
import type { Route } from "./+types/app.trends.$id";
import { getTrend } from "~/lib/trends.server";

export async function loader({ params, context }: Route.LoaderArgs) {
  return { trend: await getTrend(context.cloudflare.env, params.id) };
}

export default function Trend({ loaderData }: Route.ComponentProps) {
  return <TrendChart trend={loaderData.trend} />;
}
```

Resource routes (`api.internal.*` and other routes with no default component) leak the same way: a `.server` import referenced at module scope or from any export other than `loader`/`action` is still bundled for the client. Keep every `.server` reference inside `loader`/`action` — never at the top level or in a re-export.

### Route module names must never end in `.client`

The mirror convention: the bundler treats any module whose basename (or a parent directory) ends in `.client` as **browser-only** and substitutes an empty module for it in the server build. For a helper that's fine — for a **route module** it is fatal, and silent: the build passes, but the server has no handler for that route, so every click on it throws `No result found for routeId routes/<name>` — in every browser, in incognito, after every rebuild.

This trap is easy to walk into by naming a screen "client": a "Client Strategy" tab under `/app` naturally becomes `routes/app.client.tsx`. Never write a route module whose file name ends in `.client` — pick another name (`app.clients.tsx`, `app.client-strategy.tsx`). The URL is not affected: it comes from the `route()` path argument in `app/routes.ts`, not from the file name.

**Diagnosing it:** if a single tab or screen fails with `No result found for routeId routes/….client` while every other route works, the cause is the route module's file name — nothing else. It is not a browser cache, an error boundary, or a serving/deploy fault, and rebuilding or rewriting the screen under the same name cannot fix it. Rename the module file so it no longer ends in `.client`, update its entry in `app/routes.ts`, and keep the URL path unchanged.

## Dates & time — avoid hydration mismatches

This app is server-rendered in **UTC** and hydrated in the browser. The server
HTML and the first client render must be **identical**, or React throws a
hydration error (#418). Common causes: reading the current date/time during
render (a UTC "today" is also the wrong calendar day for most viewers), reading
`localStorage`/`window` during render, random ids, and invalid tag nesting.

> **Load the `hydration-safe-rendering` skill before writing any render whose
> output depends on the browser or the clock** — current-time or "today" UI,
> `localStorage`/`window` reads, or a block shown only on the client. It has the
> `~stencil/time` viewer-timezone pattern, the `useHydrated`/`ClientOnly` API,
> and the mismatch patterns to avoid.

## Assets

The list of available asset files is provided in your system prompt. Reference them as:

```tsx
<img
  src="/assets/hero.jpg"
  alt="Team collaborating around a dashboard"
  width={1536}
  height={864}
  className="w-full h-auto"
/>
```

**Every `<img>` needs `alt`, `width`, and `height`** — heroes, features, logos, avatars, inline photos alike:

- **`alt`** — default from the image brief's subject (a hero generated as "hero banner showing a dashboard" → `alt="Dashboard overview"`); use `alt=""` for purely decorative imagery, but never omit it.
- **`width`/`height`** — match the shape you asked for, so the browser reserves the right box: `16:9` → `1536×864`, `4:3` → `1024×768`, `1:1` → `1024×1024`, `9:16` → `864×1536`, `3:4` → `768×1024`. Paired with `className="w-full h-auto"` so the image stays responsive and the page doesn't shift as it loads.

### User-uploaded files

Files the user attached in chat are available in workspace storage at `/workspace/.storage/{relativePath}` (e.g. `/workspace/.storage/uploads/1234-logo.png`). These paths are listed in the task prompt when present.

To use a user-uploaded file as an asset in the app, copy it to the public mount so it's served at `/assets/`:

```bash
cp /workspace/.storage/uploads/1234-logo.png /workspace/.public/assets/logo.png
```

Then reference it in code as `/assets/logo.png`. `/workspace/.public/assets/` is the ONLY directory `/assets/*` is served from — a file written into the app's own `public/assets/` passes every local check but 404s in production.

For font files, copy to the fonts subfolder:

```bash
cp /workspace/.storage/uploads/1234-MyFont.ttf /workspace/.public/assets/fonts/MyFont.ttf
```

Then reference in `theme.css`:

```css
@font-face {
  font-family: 'MyFont';
  src: url('/assets/fonts/MyFont.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}
```

Use `generateImage` for logos, hero images, background textures, and any imagery that needs a specific scene or photographic quality. Generate liberally — every hero section, feature section, and landing background deserves a real image rather than a flat color. For textures, svg is also fine if you can pull it off.

Name each one for what it is (`logo`, `hero`, `bg-hero`), ask for the shape the
slot needs, and set `public` so the app can serve it. Load the `generate-image`
skill before writing prompts — a vague prompt is the difference between an asset
and a placeholder.

The image can then be referenced as `/assets/<name>.png` (with `alt`/`width`/`height` per the **Assets** rule above).

## Icons & Illustrations

Use `react-icons` for all app-specific icons and small-scale visuals — never emoji as UI icons, and never `lucide-react` (it powers shadcn/ui internals; don't replace shadcn's own icon imports). At the start of each project, pick **one icon family** and commit to it throughout — never mix families.

Popular families, by artifact type: `hi2` (Heroicons v2 — SaaS/dashboards), `fa6` (Font Awesome 6 — marketing), `tb` (Tabler — dense tools), `pi` (Phosphor — consumer/editorial), `md` (Material Design). Sizing: 16px inline · 20px in buttons · 24px standalone.

Every family is re-exported through one `IconBase`, so an icon takes `className`, `size`, `color` and `title` — **there is no `weight` prop**, and passing one fails the typecheck (`TS2322: Property 'weight' does not exist on type 'IntrinsicAttributes & IconBaseProps'`). Weight lives in the component name instead: `PiHouse`, `PiHouseBold`, `PiHouseDuotone`, `PiHouseLight`.

```tsx
import { HiOutlineInbox, HiOutlineUsers } from "react-icons/hi2";

// empty state
<HiOutlineInbox className="w-12 h-12 text-muted-foreground" />
```

**Rules:**
- Every empty list, grid, or zero-data screen must have an icon-based empty state (icon 48–64px in `text-muted-foreground`, plus a heading and one-line description) — never leave a blank area
- Every feature card, step, or category needs an icon
- Avoid custom SVGs — use the chosen react-icons family only
- Never pass `weight` to an icon — use the weighted component name (`<PiHouseBold />`, not `<PiHouse weight="bold" />`)
- For complex imagery (hero backgrounds, product screenshots, decorative scenes), use `generateImage`

## Database (Drizzle + D1)

The current database tables are in `/home/user/app/app/generated/db-schema.ts`. Drizzle exports each column under a camelCase name (e.g. `created_at` → `createdAt`, `created_by` → `createdBy`) — always use those camelCase names in your code.

**Never guess a column name in SQL — read it.** The Drizzle name is not reliably the real one: tables can legitimately mix camelCase and snake_case, so converting by convention is a guess, and so is inferring a name from what the field is for. Before you name a column in a `dbExecute` statement, call `describeSchema` with the table to get its real column names. If a statement is rejected for an unknown column, the result's `tables` lists the real columns of every table the statement names, and `rejected` names the bad column and its real spelling when the guess only differed by casing — use those, never a second guess.

**The camelCase export is never the SQL name.** In `db-schema.ts` and `app/.stencil/auth/schema.ts` the physical column is the quoted string inside the column call: `emailVerified: integer("email_verified")` means SQL sees `email_verified`, and `emailVerified` is rejected. The platform tables are snake_case throughout — `user` has `email_verified`, `created_at`, `updated_at`; `session` has `user_id`, `expires_at`; `account` has `user_id`, `provider_id`, `account_id`; `subscription` has `user_id`, `tier_id`, `current_period_end`. An entity table stores each field under the exact name it was declared with, plus `id`, `created_at`, `updated_at`.

**RULE: Platform-owned tables are read-only.** `subscription`, `user`, `session`, `account`, `verification`, and every `oauth_*` table mirror Stripe and the auth layer, and the platform rewrites them from its own sources. Read them freely, but never INSERT/UPDATE/DELETE them via `dbExecute` or any SQL — a hand-written row (e.g. a comped `subscription` marked active) lies to every gate that reads it and gets overwritten. If a subscription or auth gate blocks what the builder wants, say so plainly — the answer is a Stencil-side path, never a forged row and never disabling the gate.

**RULE: Never declare `id`, `created_at`, or `updated_at` in an entity schema.** Every entity table gets those three columns automatically — Stencil creates and maintains them. A data-scoping column (`created_by`, `workspace_id`) is NOT automatic: declare it yourself whenever the table needs one — the `"private"` access preset requires a `created_by` text field.

**RULE: Always read `/home/user/app/app/generated/db-schema.ts` before touching the database schema.** If the entity already exists there, use `updateEntity` — never `createEntity` for something that already exists. Only call `createEntity` when the slug is absent from that file.

Manage tables with `createEntity` and `updateEntity`. `createEntity` takes a full
schema; `updateEntity` takes a list of field actions (add / update / rename /
remove), so untouched columns are always preserved. Both refresh
`/home/user/app/app/generated/db-schema.ts` for you. Each tool's input schema is in your tool
list — read it there rather than guessing at field names.

Constraint changes go through `updateEntity` too — never by hand-editing `db-schema.ts`, which is regenerated from the live DB and won't change the real rule. To make a required field optional (relax its `notNull`), `update` it with `"required":false`:

```json
{ "slug": "tasks", "actions": [{ "type": "update", "field": { "name": "deadline", "type": "datetime", "required": false } }] }
```

Note: `checkbox` values are `true`/`false` (not `1`/`0`).

### Data Scoping

Tables that hold user-specific or tenant-specific data must be scoped to prevent users from accessing each other's records. Think about the right scope for the app, e.g.:

- **Per-user** (most common) — add a `created_by` field storing `user.id`. Use this when each user owns their own records (personal tasks, notes, contacts).
- **Per-workspace / per-team** — add a `workspace_id` field when records are shared within a group but isolated from other groups.

Always store IDs — never names or display strings. Always set the scope field on insert and filter by it on every query.

To scope data to the preview user, use the ID given in your instructions, or call `previewUser`. The live preview is signed in as this user, so any rows you insert on the user's behalf must set the scoping field (`created_by` or `workspace_id`) to it, or they will exist in the database but never appear in the preview.

### Code Usage

Import tables from `~/generated/db-schema` using their **exact exported name** — open the file (`/home/user/app/app/generated/db-schema.ts`) and copy it, never guess. Importing a name the file doesn't export (e.g. `event` when it exports `events`) fails the build with `MISSING_EXPORT`. Import only the tables you actually use. Use `createDb` from `~stencil/db` in loaders and actions only.

If the file looks out of date, call `regenerateSchema` to rebuild it from the entities that exist. If a table you expected still isn't exported afterwards, its entity was never created — create it with `createEntity`.

```ts
import { createDb } from "~stencil/db";
import { contacts } from "~/generated/db-schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "~stencil/auth/server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const db = createDb(context.cloudflare.env);

  const records = await db
    .select()
    .from(contacts)
    .where(eq(contacts.createdBy, user.id))
    .orderBy(desc(contacts.createdAt))
    .limit(50);

  return { records };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const db = createDb(context.cloudflare.env);
  const now = new Date().toISOString();

  const [created] = await db
    .insert(contacts)
    .values({
      id: crypto.randomUUID(),
      name: "Jane",
      email: "jane@example.com",
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db
    .update(contacts)
    .set({ phone: "+1234567890", updatedAt: now })
    .where(eq(contacts.id, created.id));
  await db.delete(contacts).where(eq(contacts.id, created.id));

  return Response.json({ success: true });
}
```

## File Storage (R2)

> **Load the `storage` skill before touching a file upload, image, video, audio, or any other binary data** — adding one, extending an existing one, or fixing one that's not working. Read it before you open the storage code, not after.

Use `createStorage` from `~stencil/storage` (server-side only). Keys are scoped per-app automatically. Never store file bytes in D1 — store in R2, keep the key (string) in D1. See the `storage` skill for full API and patterns.

## File downloads & exports

> **Load the `file-export` skill before wiring any download or export** — a "Download" button, CSV export, saving a canvas, or serving a stored file as a download. Use `~stencil/files`; never hand-roll it.

## AI

Only add AI features if explicitly asked. Use `createAI` from `~stencil/ai` (server-side only). No API keys needed. See the `ai-sdk` skill for the full API.

## Rendering videos with Remotion

Only add video if the app needs it. The app authors Remotion compositions in `app/remotion/` and renders them with `createRemotion` from `~stencil/remotion` (server-side only). Output is an R2 key in the app's own storage — never bytes. Keep `app/remotion/` self-contained — a composition imports from inside it and from packages, never `~/…`. Load the `remotion` skill before writing any of it: it covers the composition constraint, the props/assets model, polling, and verifying a frame with `dev-tools remotion still`.

## Web search & fetch

The app can search and fetch the open web server-side, no API keys needed.
**Load the `web-search` skill before building anything that reads the web.**

## Recurring actions

This app can run server-side work **on a schedule** — "every morning refresh the events list", "email each user a weekly summary", "every hour expire stale rows" — via an `app/schedules.ts` manifest plus a handler in the trusted `api/internal/scheduled` route. Never fake scheduling with client-side timers, `setInterval`, or a "run now" button; those don't run when the app is closed.

> **Load the `recurring-actions` skill before building one** — it has the manifest fields, the scaffold to copy, the cadence contract (~5-minute floor, one retry, idempotency), and the rules on what not to build. Only when the brief asks for scheduled/repeating work ("every…", "daily", "weekly", "hourly", "nightly", "each morning"); skip it otherwise.

## Wallet passes

Apple Wallet and Google Wallet passes are signed server-side using credentials the app builder gets from Apple/Google and stores in **Settings → Build → Secrets** — never from certificate files on disk, which a Worker has no filesystem to read.

> **Load the `wallet-passes` skill before building one** — it has the exact secret names, the enrolment steps to hand the app builder, how to type and read the secrets, and the Workers-safe way to sign each format. Only when the brief asks for wallet passes, tickets or membership cards; skip it otherwise.

## In-app notifications

The platform ships a notification store: a fixed-shape `notification` table in the app database, `createNotifications(env).send(...)` from `~stencil/notifications` to write rows, and a ready-made `<NotificationsBell />` header component with unread count and read state. Never hand-build a notifications table, bell, panel, or unread bookkeeping.

> **Load the `in-app-notifications` skill before building anything an app user reads inside the app** — a bell, inbox, notification center, unread badge, alerts feed, or "notify users when X happens". Push (`~stencil/push`) and email (`~stencil/email`) are separate fire-and-forget transports; the store is the durable record.

## App-user subdomains

An app builder can give every app user their own address under the app's domain — `sarah.theirdomain.com` — by switching subdomains on in Stencil. The platform resolves which app user a request arrived for and hands it to the app through `~stencil/tenant`; `tenantUrl` builds the addresses. Never read `Host` to work out whose request it is, and never concatenate an address by hand.

> **Load the `subdomains` skill before building anything where an app user gets an address of their own** — "their own URL", "a link of their own", "storefront per user", "portal per client", "white-label", `<name>.<domain>` per user. It has the wiring, the claim field, how to scope a loader to one app user, and what login does across the domain.

## Server entry points that write records the app already shows

A new server entry point — an MCP tool, a webhook or API resource route, a scheduled handler, an inbound-email handler — that creates or mutates records an existing screen renders is a second door into that screen's data, not a fresh surface with its own rules:

1. **Same vocabulary.** Reuse the existing status enum and field names. Never introduce a status, kind or flag value the consuming UI does not render. If a new state is genuinely needed, add it to the type, the UI and every reader in the same change.
2. **Same pipeline.** Route the write through the same server function the UI path uses (or extract one shared function), so the record reaches the same terminal state by the same steps. Never leave a record in a state nothing on the server advances.
3. **Prove it renders.** Before claiming done, create one record through the new entry point and confirm it appears correctly on the existing screen and progresses (or can be progressed by the app user) to its terminal state. An entry point you cannot drive end-to-end from the sandbox does not excuse this: its handler is a plain server function you can exercise directly.
4. **Honest descriptions.** Tool descriptions, endpoint docs and notification copy may only name statuses and screens that actually exist.

## Print

Printing and save-as-PDF have real pitfalls — a print container in the wrong place
prints a blank page. **Load the `print-to-pdf` skill before wiring any print
button or PDF export.**

## Authentication

Auth is fully set up — do not build login/signup UI. Stencil hosts those pages.

Better Auth logging that its `baseURL` is not set is **expected and harmless** — the platform leaves it unset on purpose so each app derives its origin per request. Ignore that warning; never chase it into `app/.stencil/`, and never report it to the app builder as a problem.

```tsx
<Link to="/login">Sign in</Link>
<Link to="/signup">Create account</Link>
```

**Sign out is a POST, never a link.** A `<Link to="/logout">` or `<a href="/logout">` puts `/logout` in browser history, and history traversal or link prefetch would end the session. Use `<SignOutButton>` (a POST form to `/logout`):

```tsx
import { SignOutButton } from "~stencil/ui/auth/sign-out-button";

<SignOutButton className="text-sm text-muted-foreground hover:underline" />
```

**Protected route** — call `requireAuth` in the loader, wrap in `AuthProvider`:

```tsx
import { requireAuth } from "~stencil/auth/server";
import { AuthProvider } from "~stencil/ui/auth/context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  return { user };
}

export default function MyPage({ loaderData }: Route.ComponentProps) {
  return (
    <AuthProvider user={loaderData.user}>
      <PageContent />
    </AuthProvider>
  );
}
```

**Read user in sub-components:**

```tsx
import { useAuth } from "~stencil/ui/auth/context";

function PageContent() {
  const { user } = useAuth();
  return <p>Hello {user.name}</p>;
}
```

**Route structure for authenticated content:**

- All protected routes MUST live under `/app` (e.g. `/app`, `/app/dashboard`, `/app/settings`).
- If the entire app requires login (no public pages), redirect `/` to `/app` in `home.tsx`.
- `home.tsx` and `app.tsx` ship as placeholders. Read them, then overwrite them completely —
  never leave the default "Welcome, [name]" screen reachable. A dangling stub is a broken app,
  and it is the first thing the app builder sees.
- Write route files with `$` segments (`content.$id.tsx`) using your file-writing tool, never a
  bash heredoc — the shell expands `$id` and you get `content..tsx`, whose name no longer matches
  its type import, so the error surfaces far from the cause. Generated type imports are always
  `./+types/<filename>`, with no extra path segments.
- If the app has both public and authenticated sections, `/` is the public landing page and `/app` is the authenticated entry point.

**Optional auth on public pages:**

```tsx
import { getSession } from "~stencil/auth/server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await getSession(request, context.cloudflare.env);
  return { user: session?.user ?? null };
}
```

**Admin or owner gates in the App preview.** The App preview is signed in as the preview user, an ordinary app user with no row in any role data you create. `isPreviewUser(user, env)` from `~stencil/auth/server` is true for that account on the App preview and never on the published app (it has no session there), so gate admin and owner views on it there and on the app's own role data otherwise. Never seed the preview user into the app's role data or an allow-list: both deploys share one database, so the published app would honour that row too.

```ts
import { requireAuth, isPreviewUser } from "~stencil/auth/server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);
  const isAdmin = isPreviewUser(user, env) || (await hasRole(env, user.id, "admin"));
  if (!isAdmin) throw redirect("/app");
  // ...
}
```

**Sign out from client code** (event handlers; for UI, prefer `<SignOutButton>`):

```tsx
import { signOut } from "~stencil/auth/browser.client";
await signOut();
```

## Prerendering

`prerender.ts` lists paths to render to static HTML at build time:

```ts
const prerender: string[] = ["/", "/about", "/pricing"];
export default prerender;
```

Prerendering is gated and runs on **production publishes only**, and only for apps on the platform's rollout allowlist. On a draft build, or for an app not on the allowlist, listing a path here does nothing — the route just SSRs as usual.

Only list **pure content** pages. A prerendered route must **not** have a `loader` that reads app data or a platform binding (DB, STORAGE, AUTH, payments…): none of those exist during the build, and the route fails prerendering with a 500. Editable `<Text>` copy **is** fine — it is baked from the published strings at build time, so a prerendered page shows real copy, not blanks. The root loader in `app/root.tsx` runs for every prerendered path too, so if anything is prerendered it must not read `context.cloudflare.env` (or any binding) unguarded.

## Design

**Theme tokens** live in `app/theme.css` — the `:root` and `.dark` blocks. The `@theme inline` block in `app/app.css` maps these to Tailwind utilities — do not touch `app.css` for theme changes. If you add a new CSS variable to `theme.css`, add the matching `@theme inline` entry in `app/app.css`.

**Keep CSS out of backtick template literals.** Component styles go in `app/theme.css` / `app/app.css` or a CSS module — never in a multi-line `` <style>{`…`}</style> `` block. If an inline `<style>` is truly unavoidable, use a single-quoted string (`<style>{'.x{display:none}'}</style>`). Never write a backtick inside a comment inside any template literal (a `<style>` block, a script served from a route): the backtick closes the string and the compile error points at the comment, not the cause.

### Token vocabulary

Use the full token system — don't hard-code values or reach for opacity hacks when a token exists:

**Surfaces** — `bg-background` (page) → `bg-background-secondary` (offset sections) → `bg-card` (raised panels) → `bg-surface-elevated` (floating). Interactive states: `bg-surface-hover`, `bg-surface-active`.

**Borders** — lightest to strongest: `border-border-subtle` → `border-border-muted` → `border-border` → `border-border-strong`.

**Text** — three levels: `text-foreground` (primary content), `text-foreground-secondary` (supporting copy, metadata), `text-muted-foreground` (placeholders, captions).

**Primary depth** — for interactive states on brand-coloured elements: `bg-primary-hover` (button hover), `bg-primary-muted` (tinted area backgrounds), `bg-primary-soft` / `bg-primary-tint` (near-invisible tints).

**Focus ring** — `ring-focus-ring` is the soft alpha-blended ring for focus states. `ring-ring` is the full-opacity variant.

**Error vs destructive** — `text-error` / `border-error` is for form validation state. `bg-destructive` is a button intent (danger action). Don't conflate them.


**Motion** — `ease-standard`, `ease-accelerate`, `ease-decelerate` and `duration-fast`, `duration-normal`, `duration-slow` are Tailwind utilities backed by the token system.

### Fonts

**Font selection is a first-class brand decision — do not leave both `--font-display` and `--font-sans` as Inter.** Every app deserves intentional typography. Pick fonts that match the brand voice before building anything else.

- `--font-display` applies automatically to `h1`–`h4`. For editorial warmth: Fraunces, Playfair Display, DM Serif Display, Lora, Cormorant Garamond, Instrument Serif. For modern/geometric: Space Grotesk, Cabinet Grotesk, Outfit.
- `--font-sans` is the body and UI font. Inter, Geist, DM Sans, Plus Jakarta Sans all work well.
- Import fonts via `@import url(...)` at the top of `theme.css` — this is the only correct place. **Never add font `<link>` tags or `@import` font URLs to `root.tsx` or `app.css`.**

### Backgrounds

**Never leave hero sections, feature sections, or landing page areas as flat solid colors.** Every significant surface deserves a considered background treatment. In order of preference:

1. **Generated image** — use `generateImage` for photographic textures, abstract scenes, or brand-specific backgrounds. Best for heroes and full-bleed sections.
2. **CSS scaffold** — reach for `backgrounds/aurora-mesh.css`, `backgrounds/animated-gradient.css`, `backgrounds/dot-grid.css`, or `backgrounds/noise-grain.css` from `/opt/design/scaffolds/` for quick, polished results.
3. **Tailwind gradient** — a multi-stop `bg-gradient-to-br` with brand colors is better than a flat fill.
4. **Solid color** — only when the content is dense enough that any texture would compete with it.

Apply this rule to: hero sections, CTA banners, feature highlight rows, pricing backgrounds, auth pages, empty-state backdrops, and any "hero card" or bento cell with a visual focal point.

### Brand palette

**The theme already in `theme.css` is authoritative** when it is not the neutral grey default — the app builder chose it in the UI and the platform injected it, so do not overwrite it. Only when the defaults are still in place, or the brief calls for specific brand colours the theme does not cover, generate a considered brand palette and set it there before building UI. Map brand colours onto the semantic token system:

- `--primary` / `--primary-foreground` — the main brand colour (buttons, links, key interactive elements)
- `--primary-hover`, `--primary-muted`, `--primary-soft`, `--primary-tint` — set these to match the brand primary at each depth level
- `--accent` / `--accent-foreground` — shadcn uses `--accent` for subtle hover highlights on menus and dropdowns; keep it muted (do not make it the brand colour)
- `--secondary` — secondary brand colour or a neutral surface

Always define both `:root` (light) and `.dark` values. Use oklch for all colour values — lightness adjustments for dark mode are predictable in oklch.

### Cards

**MANDATORY: always use the card skills for any card-shaped UI — never invent card markup from scratch.**

- **KPI / stat cards** (large number, label, trend badge, sparkline) → read and follow the `metric-card` skill before writing any code.
- **Content panels** (titled section with header + body, e.g. pipeline summary, activity feed, list breakdown) → read and follow the `general-card` skill before writing any code.

The raw shadcn `<Card>` component is a low-level primitive. Do not use it directly for either of these surfaces — the skills wrap it correctly.

### shadcn components

shadcn components use the token system automatically, but **their default styling is a starting point, not a finished design**. After placing a component, check that it looks right with the app's specific palette and spacing. Most components accept a `className` prop — use it to adjust styles rather than copying or forking component files.

Note: shadcn's `--accent` is a subtle hover tint, not the brand accent colour — `--primary` is the brand colour. Keep this distinction when customising the palette.

### Typography (prose)

The `@tailwindcss/typography` plugin is installed but not active by default. If the app needs to render markdown or long-form prose with `className="prose"`, add this line to `app/app.css` (after the other imports):

```css
@plugin "@tailwindcss/typography";
```

## Scaffolds

Pre-built components and CSS utilities are available at `/opt/design/scaffolds/`. Copy what you need into the project or read and adapt — do not import directly from `/opt/design/scaffolds/`.

```bash
cp /opt/design/scaffolds/device-frames/iphone-16-pro.tsx app/components/iphone-frame.tsx
cp /opt/design/scaffolds/backgrounds/aurora-mesh.css app/aurora-mesh.css
```

**Device frames** — wrap content in a realistic hardware shell for landing pages and mockups:
- `device-frames/iphone-16-pro.tsx` — iPhone 16 Pro with dynamic island
- `device-frames/macbook-pro-16-2024.tsx` — MacBook Pro 16" (2024) with notch
- `device-frames/vision-pro.tsx` — Apple Vision Pro spatial canvas
- `device-frames/foldable.tsx` — Galaxy Fold with open/closed panels

**Browser chrome** — show a webpage inside a realistic browser window:
- `browser/chrome.tsx` — Chrome with tabs and URL bar
- `browser/safari.tsx` — Safari with centered title bar
- `browser/arc.tsx` — Arc with sidebar tabs

**UI primitives** — copy in and customize, don't rebuild from scratch:
- `ui-primitives/cmdk-palette.tsx` — command palette with fuzzy filter
- `ui-primitives/kanban-board.tsx` — three-column Kanban with drag-and-drop
- `ui-primitives/drawer.tsx` — bottom-sheet drawer with backdrop
- `ui-primitives/toast.tsx` — toast stack (success / info / error)
- `ui-primitives/stepper.tsx` — multi-step progress indicator
- `ui-primitives/file-tree.tsx` — collapsible file tree
- `ui-primitives/skeleton-set.tsx` — five skeleton variants (text, avatar, card, list, image)
- `ui-primitives/empty-states.tsx` — five empty-state variants

**CSS backgrounds** — add the class to any wrapper element, then import the CSS file:
- `backgrounds/aurora-mesh.css` → `.aurora-mesh` — multi-layer radial gradient mesh
- `backgrounds/noise-grain.css` → `.noise-grain` — SVG grain overlay (use on a colored surface)
- `backgrounds/dot-grid.css` → `.dot-grid` — 1px dot pattern (light/dark/dense variants)
- `backgrounds/animated-gradient.css` → `.animated-gradient` — looping animated gradient
- `backgrounds/glassmorphism.css` → `.glass-surface` — frosted glass with backdrop-filter
- `backgrounds/bento-grid.css` → `.bento-grid` — CSS grid bento layout helpers
- `surfaces/neubrutalism.css` → `.neubrutalism-card`, `.neubrutalism-btn` — thick borders, chunky shadows

**Dev mockups** — for showing code or terminal output in a UI:
- `dev-mockups/vscode.tsx` — VS Code layout with file tree and editor surface

**Landing** — starting point for hero sections:
- `landing/hero.tsx` — centered hero with eyebrow, headline, subtext, dual CTAs

> **Load the `payments` skill before touching anything about money** — subscriptions, plans, pricing or upgrade pages, paywalls, Stripe, checkout, sellers, buyers, payouts, refunds. Read it before you open the payments code, not after. On an app's **first** payments or selling request, those skills have you offer a short walkthrough before building — make that offer before writing any code.

**Subscriptions** — the page app users subscribe on. Pick by how many plans the app has (count `~/generated/tiers`):
- `subscriptions/upgrade.tsx` — single plan: centered card with price, benefits, and a subscribe button.
- `subscriptions/pricing.tsx` — two or more plans: plan columns in order, a highlighted recommended plan, and a subscribe form per plan. A plan may be **monthly-only, yearly-only, or both** — in `~/generated/tiers` a plan's `priceCents` (monthly) and `yearlyPriceCents` are each `number | null`. Never divide a null `priceCents` (`plan.priceCents / 100` renders `$NaN`): price a yearly-only plan from `yearlyPriceCents` and pass `interval: 'year'` at checkout. The monthly/annual toggle and savings badge apply only to a plan that carries both prices; they show only when the builder has enabled annual billing. Gate routes with `requireSubscription(tiers.pro.id)` — an app user on that plan or any higher one qualifies.

**Selling** — let the app's users charge THEIR customers (one-time payments or the seller's own subscription plans via the `~stencil/payments/selling` SDK; load the `selling` skill first). A one-time buyer needs no app account — guest checkout is the default (subscribing needs a sign-in): the buy page collects the buyer's email, which is their whole identity (Stencil stores no token or link for them; how they get back to the purchase is the app's design — e.g. a link the app emails via `~stencil/email`):
- `selling/seller-setup.tsx` — seller onboarding gate + status card + "open dashboard" link
- `selling/buy.tsx` — public buy page (works logged out; a guest's email is required) → `sellerCheckout` action that re-reads the item's stored price and seller by `reference` (never from the form), with an already-purchased short-circuit
- `selling/purchase-success.tsx` — post-checkout landing; verifies with `hasPurchased({ reference, buyerEmail })` and shows "confirming" while the payment webhook lags
- `selling/seller-plans.tsx` — an `active` seller creates, edits and archives their recurring plans
- `selling/subscribe.tsx` — public pricing page for one seller's plans; subscribing needs a signed-in buyer (`sellerSubscribe`), with a "Manage billing" link for a current subscriber
- `selling/subscriber-area.tsx` — subscriber-only page gated in the loader, "confirming" right after checkout, status and next date, and the `manageSellerSubscription` button

> The `~stencil/payments/*` modules are platform-managed — don't edit them and never hand-roll payments calls. To reach any platform service (payments, backend, …) a deployed app must use its service binding (`env.PAYMENTS`, `env.BACKEND_SERVICE`), which the SDK does for you — never a plain `fetch()` to a `hellostencil.com` host. Same-zone route fetches don't reach the worker; a plain-fetch fallback only works on the dev server.

**Recurring actions** — scheduled server-side work (load the `recurring-actions` skill first):
- `recurring/schedules.ts` — worked manifest → copy to `app/schedules.ts`
- `recurring/api.internal.scheduled.tsx` — trusted route with worked, idempotent handlers → copy to `app/routes/api.internal.scheduled.tsx` (register at `api/internal/scheduled`). Keep the bearer-secret auth block as-is; only edit the handlers.

Use a scaffold when you'd otherwise build a device frame, browser chrome, or complex primitive from scratch. Always adapt the colors and copy to match the brief.

## Editable Text (`<Text>`)

**MANDATORY: use `<Text>` for every user-visible string.** Never hardcode copy as JSX text nodes — the platform identifies and edits strings through this component.

`strings.json` also holds the app's **current live copy**, and it is saved back to the live store on deploy. So to fix or reword text that is already on the site, edit that key's value in place (keep the key) — that is exactly how live copy is corrected. Never tell the app builder their text is unreachable or not in the repo. If a phrase genuinely is not in the file, it is app-user content in the database, not copy.

Define all copy in `app/strings/strings.json` first, then reference keys in JSX:

```json
{
  "hero": { "title": "Your Amazing App", "subtitle": "Do more, faster." },
  "cart": { "message": "You have {{count}} items" }
}
```

```tsx
import { Text } from "~stencil/ui/strings";

<Text id="hero.title" as="h1" className="text-4xl font-bold" />
<Text id="hero.subtitle" as="p" />

// Dynamic values: use {{var}} in strings.json, pass via vars
<Text id="cart.message" vars={{ count }} />
```

- Keys are dot-delimited and describe location + role: `"hero.title"`, `"nav.cta"`, `"features.card1.description"`
- `<Text>` takes no children — all copy lives in `strings/strings.json`
- TypeScript will error on any key not present in `strings/strings.json`
- When you rename or remove a key in `strings.json`, grep `app/` for the old key and fix every `<Text id>` that references it before running the typecheck — a wholesale rewrite is a rename across every route that used the old keys
- Only exception: `meta()` returns plain objects, not JSX — page title/description strings there are hardcoded

### Dynamic `<Text>` keys

`id` is typed `StringKey` (the union of keys in `strings.json`, from `~stencil/types/strings`), so a runtime-computed key is `string` and errors with `TS2322`. Two fixes — don't cast site-by-site and typecheck between edits:

```tsx
import { Text } from "~stencil/ui/strings";
import type { StringKey } from "~stencil/types/strings";

// 1. Keep it typed — TS checks against strings.json:
const stepKeys: StringKey[] = ["onboard.step1", "onboard.step2"];
{stepKeys.map((id) => <Text key={id} id={id} />)}

// 2. Cast when you're sure the key exists:
<Text id={`pricing.${tier}.name` as StringKey} />
```

A cast silences the check — if the key is missing, `<Text>` renders empty and logs a console error. Fix all dynamic keys in one pass, then typecheck once.

## Rules

- Create routes in `app/routes/` and register them in `app/routes.ts`
- Use Tailwind CSS utility classes for all styling
- Use `cn()` from `~/lib/utils` to merge class names
- Use `import { Link } from "react-router"` for navigation
- Make everything responsive and mobile-first; use semantic HTML
- Pre-installed shadcn/ui components in `~/components/ui/`:
  accordion, alert, avatar, badge, button, card, checkbox, dialog, dropdown-menu, input, label, popover, progress, scroll-area, select, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle, tooltip, aspect-ratio, navigation-menu
- For a shadcn component not listed above: `bun x shadcn@latest add <comp1> <comp2> --yes` — batch all into one command
- Never `fetch()` in `useEffect` — use `loader`
- Never redirect to an address carried in the request without `safeReturnTo` from `~stencil/auth/server` — on any screen, signed-in or not (see "Redirecting to a caller-supplied destination")
- A control that changes what data is shown needs a data path — load the `control-driven-data` skill
- Never add dark mode toggles — `dark:` variants work automatically via browser preference
- Never use `npx` or `bunx` (not installed — don't try to create a shim) — use `bun x`
- Never transliterate a pasted vendor head snippet (Meta Pixel, Kit, an Impact `<meta name="impact-site-verification" value="…">` tag) into JSX in `root.tsx` — JSX rejects attributes React does not declare (`value` on `<meta>` is the common one), the typecheck fails, and renaming the attribute breaks the vendor's check. Tell the app builder to paste the snippet as-is into **Settings → Grow → Tracking → Script tags**; it is placed verbatim in `<head>` of every page of the Published app (not the App preview)
- Never use `value=""` on `<SelectItem>` — Radix reserves empty string for "no selection / show placeholder" and throws at runtime. Use a descriptive value like `value="all"` and check `value === "all"` in the handler to mean "no filter"
