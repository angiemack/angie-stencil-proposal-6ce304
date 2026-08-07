# App Template

Full-stack web app using React Router 7, Tailwind CSS, and Cloudflare Workers. 

## Platform-managed — don't touch

- `app/.stencil/` — **all** platform-provided code (auth, service SDKs, payments, the strings runtime, worker + server entries). Import from it as `~stencil/*`, never edit anything inside it.
- `app/generated/` — managed by `dev-tools`; never edit directly
- `app/entry.server.tsx`, `workers/app.ts` — convention-pinned re-exports of the real entries in `app/.stencil/worker/`; leave them as-is (never remove `strings` from the worker's load context)
- `app/strings/strings.json` — the platform strings **content** is the one platform-managed file you *do* edit (add/adjust copy here); the strings **runtime** (`<Text>`, `withStrings`, `loadStringsFromStorage`) lives in `app/.stencil/strings/` — never touch it
- `app/root.tsx` loader — `withStrings<Route.LoaderArgs>()` passes strings to all routes; never remove it
- `react-router.config.ts`, `vite.config.ts`, `tsconfig.json`, `wrangler.jsonc` — config files
- The `rel=icon` link in `root.tsx` — never remove or change the href (the image file may be replaced)

## Project Structure

```
app/
  root.tsx              — Root layout (html, head, body, Meta, Links, Scripts)
  app.css               — Tailwind imports + @theme inline mappings
  theme.css             — Design tokens: :root and .dark CSS variable blocks — edit this for colors, radius, fonts, etc.
  routes.ts             — Route table (add new routes here)
  routes/
    home.tsx            — Home page route ("/")
    app.tsx             — Authenticated route ("/app")
  components/ui/        — shadcn/ui components (pre-installed)
  lib/
    utils.ts            — cn() utility (app-owned)
  strings/
    strings.json        — editable platform strings content (add copy here)
  .stencil/             — ALL platform code (import as ~stencil/*, never edit)
    auth/               — Auth system + route pack (context.tsx: AuthProvider + useAuth())
    db.ts               — createDb(env) — Drizzle ORM wrapper for D1
    storage.ts          — createStorage(env) — R2 storage wrapper
    ai.ts               — createAI(env) — AI provider registry (OpenAI + Anthropic)
    email.ts            — createEmail(env) — send + receive email (see the `email` skill)
    push.ts             — createPush(env) — send Web Push notifications
    search.ts           — createSearch(env) — web search / discovery (Exa)
    fetch.ts            — createFetch(env) — fetch a known URL as markdown (Firecrawl)
    image.ts            — createImage(env) — generate an image at runtime (Workers AI)
    payments/           — selling + subscription SDKs
    strings/            — <Text>, withStrings, loadStringsFromStorage runtime
    worker/             — worker + server entry points
prerender.ts            — Paths to pre-render at build time
workers/
  app.ts                — pinned re-export of ~stencil/worker/app
public/                 — Static assets (favicon, etc.)
```

## Routes

Add routes in `app/routes.ts`:

`routes.ts` is the one file that imports the auth route pack with a **relative**
path (`./.stencil/auth`), not the `~stencil` alias — React Router's config loader
evaluates it before the tsconfig path aliases are applied. Everywhere else, import
platform code as `~stencil/*`.

```ts
import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { stencilAuthRoutes } from "./.stencil/auth";

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

## Dates & time — avoid hydration mismatches

This app is server-rendered and then hydrated in the browser. React requires the
server HTML and the first client render to be **identical** — if the text differs,
it throws a hydration error (React #418) and the "An Error Occurred" overlay fires.

**The #1 cause: reading the current date/time while rendering.** Cloudflare renders
in **UTC**; the browser renders in the **visitor's local timezone**. So anything
derived from the current clock produces different text on each side:

```tsx
// BAD — evaluated during render, on both server (UTC) and client (local)
function Greeting() {
  const hour = new Date().getHours();          // UTC on server, local in browser
  return <h1>Good {hour < 12 ? "morning" : "afternoon"}</h1>; // text mismatch → #418
}
```

This applies to `new Date()`, `Date.now()`, `.getHours()`, `.getDate()`,
`.getDay()`, `.toLocaleDateString()`, `.toLocaleTimeString()`, `Intl.*`, and
"time ago" strings — whenever the value is the *current* time and it's rendered
to the DOM.

**Fixes — pick one, and keep the whole page on ONE clock:**

1. **Show it after mount (preferred for current-time UI).** Use the `useHydrated`
   hook / `ClientOnly` component from `~stencil/hydration`. They render nothing (or a
   fallback) on the server + first client render, then the real local value once
   hydrated — so both sides match, and the user sees their own timezone.

   ```tsx
   import { useHydrated } from "~stencil/hydration";

   function Greeting() {
     const hydrated = useHydrated();
     const hour = hydrated ? new Date().getHours() : null; // null until in the browser
     return <h1>{hour === null ? "Welcome" : `Good ${hour < 12 ? "morning" : "afternoon"}`}</h1>;
   }
   ```

2. **Compute it in the loader.** If the value must be present on first paint, read
   the clock server-side and pass it down — both render passes then use the same
   handed-down value. (Note: this value is UTC, so it can be off by a day near
   midnight for the user's real timezone — fine for structure, not for a personal
   "today".)

**Never** mix the two on one screen (e.g. a UTC calendar next to a local-time
greeting) — that silently shows two different dates. Formatting a *stored*
timestamp (`created_at`) has the same rule: format it client-side (via `useHydrated`)
so it stays consistent, even though the underlying instant is fixed.

## Assets

The list of available asset files is provided in your system prompt. Reference them as:

```tsx
<img
  src="/assets/hero.jpg"
  alt="Team collaborating around a dashboard"
  width={1280}
  height={720}
  className="w-full h-auto"
/>
```

**Every `<img>` needs `alt`, `width`, and `height`** — heroes, features, logos, avatars, inline photos alike:

- **`alt`** — default from the image brief's subject (e.g. `--name hero "hero banner showing a dashboard"` → `alt="Dashboard overview"`); use `alt=""` for purely decorative imagery, but never omit it.
- **`width`/`height`** — the intrinsic dimensions for the aspect ratio you generated (`16:9` → `1280×720`, `1:1` → `1024×1024`), paired with `className="w-full h-auto"` so the image stays responsive and the page doesn't shift as it loads.

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

Use `dev-tools generate-image` for logos, hero images, background textures, and any imagery that needs a specific scene or photographic quality. Generate liberally — every hero section, feature section, and landing background deserves a real image rather than a flat color. For textures, svg is also fine if you can pull it off.

```bash
dev-tools generate-image "a minimalist logo for a CRM app" --name logo
dev-tools generate-image "hero banner showing a dashboard" --name hero --aspect-ratio 16:9
dev-tools generate-image "abstract mesh gradient background, warm coral tones" --name bg-hero --aspect-ratio 16:9
```

The image can then be referenced as `/assets/<name>.png` (with `alt`/`width`/`height` per the **Assets** rule above).

## Icons & Illustrations

Use `react-icons` for all app-specific icons and small-scale visuals — never emoji as UI icons, and never `lucide-react` (it powers shadcn/ui internals; don't replace shadcn's own icon imports). At the start of each project, pick **one icon family** and commit to it throughout — never mix families.

Popular families, by artifact type: `hi2` (Heroicons v2 — SaaS/dashboards), `fa6` (Font Awesome 6 — marketing), `tb` (Tabler — dense tools), `pi` (Phosphor — consumer/editorial), `md` (Material Design). Sizing: 16px inline · 20px in buttons · 24px standalone.

```tsx
import { HiOutlineInbox, HiOutlineUsers } from "react-icons/hi2";

// empty state
<HiOutlineInbox className="w-12 h-12 text-muted-foreground" />
```

**Rules:**
- Every empty list, grid, or zero-data screen must have an icon-based empty state (icon 48–64px in `text-muted-foreground`, plus a heading and one-line description) — never leave a blank area
- Every feature card, step, or category needs an icon
- Avoid custom SVGs — use the chosen react-icons family only
- For complex imagery (hero backgrounds, product screenshots, decorative scenes), use `dev-tools generate-image`

## Database (Drizzle + D1)

The current database tables are in `app/generated/db-schema.ts`. Column names in the DB are snake_case but Drizzle exports them as camelCase (e.g. `created_at` → `createdAt`, `created_by` → `createdBy`) — always use the camelCase names in your code.

**RULE: Always read `app/generated/db-schema.ts` before touching the database schema.** If the entity already exists there, use `update-entity` — never `create-entity` for something that already exists. Only call `create-entity` when the slug is absent from that file.

Manage tables with `dev-tools`. `create-entity` takes a full schema; `update-entity`
takes a list of field actions (add / update / rename / remove), so untouched columns
are always preserved. Run the command with `--help` for the exact syntax, field
types, and examples:

```bash
dev-tools create-entity --help
dev-tools update-entity --help
```

Note: `checkbox` values are `true`/`false` (not `1`/`0`).

### Data Scoping

Tables that hold user-specific or tenant-specific data must be scoped to prevent users from accessing each other's records. Think about the right scope for the app, e.g.:

- **Per-user** (most common) — add a `created_by` field storing `user.id`. Use this when each user owns their own records (personal tasks, notes, contacts).
- **Per-workspace / per-team** — add a `workspace_id` field when records are shared within a group but isolated from other groups.

Always store IDs — never names or display strings. Always set the scope field on insert and filter by it on every query.

To scope data to the preview user, get its ID via `dev-tools preview-user`. The live preview is signed in as this user, so any rows you insert on the user's behalf must set the scoping field (`created_by` or `workspace_id`) to it, or they will exist in the database but never appear in the preview.

### Code Usage

Import tables from `~/generated/db-schema` using their **exact exported name** — open the file and copy it, never guess. Importing a name the file doesn't export (e.g. `event` when it exports `events`) fails the build with `MISSING_EXPORT`. Import only the tables you actually use. Use `createDb` from `~stencil/db` in loaders and actions only.

If the file looks out of date, run `dev-tools db regenerate-schema` to rebuild it from the entities that exist. If a table you expected still isn't exported afterwards, its entity was never created — create it with `create-entity`.

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

Use `createStorage` from `~stencil/storage` (server-side only). Keys are scoped per-app automatically. Never store file bytes in D1 — store in R2, keep the key (string) in D1. See the `storage` skill for full API and patterns.

## AI

Only add AI features if explicitly asked. Use `createAI` from `~stencil/ai` (server-side only). No API keys needed. See the `ai-sdk` skill for the full API.

## Web search & fetch

Two server-side capabilities for reaching the open web. No API keys needed — both are proxied through the platform, same as `createAI`. **Server-side only** (loaders / actions / scheduled handlers), never from the browser.

**Pick by whether you have a URL:**
- **No URL, need to *find* pages → `createSearch` (`~stencil/search`, Exa).** Discovery/research: "find podcasts booking speakers", "conferences with open calls". Set `includeSummary`/`includeText` to get the page content back inline, so you usually don't need a second fetch.
- **Have a URL, need its *content* → `createFetch` (`~stencil/fetch`, Firecrawl).** Read/monitor a specific page you already know the address of.

```ts
import { createSearch } from "~stencil/search";
import { createFetch } from "~stencil/fetch";

// Discovery (no URL yet):
const results = await createSearch(env).search("female keynote speakers CFP 2026", {
  numResults: 20,
  includeSummary: true, // page content inline → rank/filter without fetching
});

// Read a known page:
const { markdown } = await createFetch(env).page("https://example.com/call-for-speakers");
```

Great fit for **recurring actions** (below): a scheduled handler runs `createSearch` to gather fresh leads, uses `createAI` to score each against a user's descriptor, and upserts the good ones. Keep result counts modest — a scheduled run is one normal request and must fit normal limits. Only add these when the app genuinely needs the web; don't wire them in otherwise.

### Search `type` — default `auto`, and when (not) to go deep

`search()` takes an optional `type`. **Leave it unset (`auto`) unless you have a specific reason** — `auto` lets Exa pick, and `fast`/`instant` trade a little quality for lower latency.

The `deep` family (`deep-lite`, `deep`, `deep-reasoning`) runs *agentic, multi-source research* and returns a synthesized answer on the result's `output` field (`output.content` — a string, or a structured object when you pass `outputSchema`). It is powerful but **costs ~2× a standard search (~$12–15 vs ~$7 per 1k) and takes several seconds**, so it is gated by usage, not capability:

- **Interactive (loader) and scheduled-handler paths → `auto` or `fast` only. NEVER `deep`/`deep-reasoning`.** Their multi-second latency blows the "one normal request" cadence contract a loader or scheduled run must honour.
- **Routine discovery / lead-gen ("find pages matching X") → `auto` + `includeSummary`, then extract structured fields with `createAI`.** This is the right pattern for the recurring-action lead-gen flow above — do *not* reach for `deep` here.
- **Reserve `deep`/`deep-reasoning` for explicit, user-invoked background research** where synthesis over many sources is the actual goal (e.g. a "research this topic" button the user clicks and waits on), not a page load.

```ts
// Deep research (user-invoked, background): synthesized answer, optionally structured.
const results = await createSearch(env).search("state of solid-state EV batteries 2026", {
  type: "deep",
  outputSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      keyPlayers: { type: "array", items: { type: "string" } },
    },
  },
});
const answer = results.output?.content; // structured object here; still iterate `results` for sources
```

## Recurring actions

This app can run server-side work **on a schedule** — "every morning refresh the events list", "email each user a weekly summary", "every hour expire stale rows" — via an `app/schedules.ts` manifest plus a handler in the trusted `api/internal/scheduled` route. Never fake scheduling with client-side timers, `setInterval`, or a "run now" button; those don't run when the app is closed.

> **Load the `recurring-actions` skill before building one** — it has the manifest fields, the scaffold to copy, the cadence contract (~5-minute floor, one retry, idempotency), and the rules on what not to build. Only when the brief asks for scheduled/repeating work ("every…", "daily", "weekly", "hourly", "nightly", "each morning"); skip it otherwise.

## Print

When implementing any print or save-as-PDF feature, **always append the print container directly to `document.body`** — never render it inside the React tree. The standard print CSS pattern (`body > :not(.print-root) { display: none !important }`) hides all direct `<body>` children that don't have the class. If the print container is inside `#root`, the entire React tree gets hidden along with it and the page prints blank.

**Correct pattern:**

```tsx
function handlePrint(content: string) {
  const container = document.createElement('div');
  container.className = 'print-root';
  container.innerHTML = content;

  document.body.appendChild(container);

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    document.body.removeChild(container);
  };
  window.addEventListener('afterprint', cleanup);

  window.print();
}
```

To render React components into the print container, use `ReactDOM.createRoot`:

```tsx
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

function handlePrint() {
  const container = document.createElement('div');
  container.className = 'print-root';
  document.body.appendChild(container);

  const root = createRoot(container);
  flushSync(() => root.render(<PrintLayout />));

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    root.unmount();
    document.body.removeChild(container);
  };
  window.addEventListener('afterprint', cleanup);

  window.print();
}
```

**Print CSS** — add `@media print` rules in the route file or a `<style>` tag:

```css
@media print {
  body > :not(.print-root) { display: none !important; }
  .print-root { display: block !important; }
  @page { margin: 0; }
}
```

Never call `document.body.removeChild` synchronously after `window.print()` — the print dialog is async. Always use the `afterprint` event for cleanup.

## Authentication

Auth is fully set up — do not build login/signup UI. Stencil hosts those pages.

```tsx
<Link to="/login">Sign in</Link>
<Link to="/signup">Create account</Link>
<Link to="/logout">Sign out</Link>
```

**Protected route** — call `requireAuth` in the loader, wrap in `AuthProvider`:

```tsx
import { requireAuth } from "~stencil/auth/server";
import { AuthProvider } from "~stencil/auth/context";

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
import { useAuth } from "~stencil/auth/context";

function PageContent() {
  const { user } = useAuth();
  return <p>Hello {user.name}</p>;
}
```

**Route structure for authenticated content:**

- All protected routes MUST live under `/app` (e.g. `/app`, `/app/dashboard`, `/app/settings`).
- If the entire app requires login (no public pages), redirect `/` to `/app` in `home.tsx`.
- If the app has both public and authenticated sections, `/` is the public landing page and `/app` is the authenticated entry point.

**Optional auth on public pages:**

```tsx
import { getSession } from "~stencil/auth/server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await getSession(request, context.cloudflare.env);
  return { user: session?.user ?? null };
}
```

**Sign out:**

```tsx
import { signOut } from "~stencil/auth/browser.client";
await signOut();
```

## Prerendering

Add public paths to `prerender.ts` for static HTML at build time:

```ts
const prerender: string[] = ["/", "/about", "/pricing"];
export default prerender;
```

## Design

**Theme tokens** live in `app/theme.css` — the `:root` and `.dark` blocks. The `@theme inline` block in `app/app.css` maps these to Tailwind utilities — do not touch `app.css` for theme changes. If you add a new CSS variable to `theme.css`, add the matching `@theme inline` entry in `app/app.css`.

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

1. **Generated image** — use `dev-tools generate-image` for photographic textures, abstract scenes, or brand-specific backgrounds. Best for heroes and full-bleed sections.
2. **CSS scaffold** — reach for `backgrounds/aurora-mesh.css`, `backgrounds/animated-gradient.css`, `backgrounds/dot-grid.css`, or `backgrounds/noise-grain.css` from `/opt/design/scaffolds/` for quick, polished results.
3. **Tailwind gradient** — a multi-stop `bg-gradient-to-br` with brand colors is better than a flat fill.
4. **Solid color** — only when the content is dense enough that any texture would compete with it.

Apply this rule to: hero sections, CTA banners, feature highlight rows, pricing backgrounds, auth pages, empty-state backdrops, and any "hero card" or bento cell with a visual focal point.

### Brand palette

**Do not ship the neutral grey defaults.** Generate a considered brand palette and set it in `theme.css` before building UI. Map brand colours onto the semantic token system:

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

**Subscriptions** — upgrade / subscribe page for single-tier apps:
- `subscriptions/upgrade.tsx` — centered upgrade card with price, benefits list, and subscribe button

**Selling** — let the app's users charge THEIR customers (one-time payments via the `~stencil/payments/selling` SDK; see the `selling` composer skill):
- `selling/seller-setup.tsx` — seller onboarding gate + status card + "open dashboard" link
- `selling/buy.tsx` — buy button → `sellerCheckout` action, with an already-purchased short-circuit
- `selling/purchase-success.tsx` — post-checkout landing that verifies entitlement with `hasPurchased`

> The `~stencil/payments/*` modules are platform-managed — don't edit them and never hand-roll payments calls. To reach any platform service (payments, backend, …) a deployed app must use its service binding (`env.PAYMENTS`, `env.BACKEND_SERVICE`), which the SDK does for you — never a plain `fetch()` to a `hellostencil.com` host. Same-zone route fetches don't reach the worker; a plain-fetch fallback only works on the dev server.

**Recurring actions** — scheduled server-side work (load the `recurring-actions` skill first):
- `recurring/schedules.ts` — worked manifest → copy to `app/schedules.ts`
- `recurring/api.internal.scheduled.tsx` — trusted route with worked, idempotent handlers → copy to `app/routes/api.internal.scheduled.tsx` (register at `api/internal/scheduled`). Keep the bearer-secret auth block as-is; only edit the handlers.

Use a scaffold when you'd otherwise build a device frame, browser chrome, or complex primitive from scratch. Always adapt the colors and copy to match the brief.

## Editable Text (`<Text>`)

**MANDATORY: use `<Text>` for every user-visible string.** Never hardcode copy as JSX text nodes — the platform identifies and edits strings through this component.

Define all copy in `app/strings/strings.json` first, then reference keys in JSX:

```json
{
  "hero": { "title": "Your Amazing App", "subtitle": "Do more, faster." },
  "cart": { "message": "You have {{count}} items" }
}
```

```tsx
import { Text } from "~stencil/strings";

<Text id="hero.title" as="h1" className="text-4xl font-bold" />
<Text id="hero.subtitle" as="p" />

// Dynamic values: use {{var}} in strings.json, pass via vars
<Text id="cart.message" vars={{ count }} />
```

- Keys are dot-delimited and describe location + role: `"hero.title"`, `"nav.cta"`, `"features.card1.description"`
- `<Text>` takes no children — all copy lives in `strings/strings.json`
- TypeScript will error on any key not present in `strings/strings.json`
- Only exception: `meta()` returns plain objects, not JSX — page title/description strings there are hardcoded

### Dynamic `<Text>` keys

`id` is typed `StringKey` (the union of keys in `strings.json`), so a runtime-computed key is `string` and errors with `TS2322`. Two fixes — don't cast site-by-site and typecheck between edits:

```tsx
import { Text, type StringKey } from "~stencil/strings";

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
- Never add dark mode toggles — `dark:` variants work automatically via browser preference
- Never use `npx` or `bunx` (not installed — don't try to create a shim) — use `bun x`
- Never use `value=""` on `<SelectItem>` — Radix reserves empty string for "no selection / show placeholder" and throws at runtime. Use a descriptive value like `value="all"` and check `value === "all"` in the handler to mean "no filter"
