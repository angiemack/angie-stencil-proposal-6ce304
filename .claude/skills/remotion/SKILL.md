---
name: remotion
description: Use when the app needs to render video — personalised clips, generated reels, data-driven animations, slideshows. The app authors Remotion React compositions in app/remotion/ and renders them on the platform with createRemotion(env); the output is an MP4 stored as an R2 key in the app's own storage. Covers the composition constraint, the assets map, polling for progress, serving the video, and self-verifying a composition with a still.
allowed-tools: createEntity updateEntity
metadata:
  agents: [chat, builder]
---

# Video rendering (Remotion)

Render video from React. The app writes **Remotion compositions** (`<Composition>`, `useCurrentFrame`, Remotion zod schemas) under `app/remotion/`, and `createRemotion(env)` renders them on the platform. Output is always an **R2 key in the app's own storage — never bytes** — so you keep the key in D1 and serve the video from your own route.

This is a real vendor in the programming model: you write Remotion code, so the module is named for it. Everything server-side is keyless, same as `createAI` / `createImage`.

---

## The one rule that shapes every composition

**A composition renders in a container with no request context.** It cannot call `createDb`, read the signed-in app user, use `context.cloudflare.env`, or `fetch`. It receives `props` and draws — nothing else.

So the app gathers everything **first**, in a loader or action, and passes it in:

- Plain data (text, numbers, arrays, colours) → `props`.
- Binary inputs that differ per render (an app user's photo, a voiceover) → the **`assets` map** (below), read inside the composition with `staticFile("<name>.<ext>")`.
- Binary inputs that are the same every render (a logo, a local font, a background) → commit them to **`app/remotion/assets/`** and read them with `staticFile("<name>.<ext>")` too. That directory is the only one bundled into the render — the app's `public/` is not, so a composition can never read from it.

This is the most common way to break a render, and it fails at render time, not build time. If a composition needs a value, it comes through `props`, `assets`, or `app/remotion/assets/`.

## 1. Author compositions in `app/remotion/`

Add the Remotion packages **pinned to `4.0.522`** — `bun add remotion@4.0.522 @remotion/cli@4.0.522 @remotion/zod-types@4.0.522`. The version is not a preference: the platform renderer runs 4.0.522 and refuses a bundle built against anything else. An unpinned `bun add` resolves to something newer and fails the build at the bundle step — pin every `@remotion/*` package you add, not just these three.

`app/remotion/` needs two kinds of file, and both are required:

- **`app/remotion/index.ts`** — the entry point, and the only thing the deploy bundles. It exists to call `registerRoot()`; that call is what puts compositions into the bundle. Without this file there is nothing to bundle and the deploy says so.
- **a Root** declaring the compositions, plus a component file per composition.

An optional third: **`app/remotion/assets/`**, for files `staticFile()` reads that are the same every render. It is the bundle's only static directory.

**Keep `app/remotion/` self-contained.** A composition imports from inside `app/remotion/` and from npm packages — not from `~/…`, and not up a relative path that climbs out of the directory. If a composition needs something the app already has, a brand colour or a formatting helper, copy the value in rather than importing across. App components are written for the app: they assume a router, hooks and a DOM that a composition rendering in a headless container does not have, and an import that drags one in fails at render time, not at build time.

```ts
// app/remotion/index.ts — the whole file
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
```

Exporting `RemotionRoot` is not enough on its own: a bundle built from a Root that nobody registered contains **zero** compositions, deploys clean, and fails every render with "composition not found".

Each `<Composition>` gets an `id`, a component, dimensions/fps/duration, and a **zod `schema`** for its props — the schema is what makes props typechecked end to end.

```tsx
// app/remotion/Root.tsx
import { Composition } from "remotion";
import { z } from "zod";
import { BirthdayCard } from "./BirthdayCard";
import { ThankYou } from "./ThankYou";

export const birthdaySchema = z.object({
  name: z.string(),
  message: z.string(),
  // An asset arrives by name; the composition reads it via staticFile.
  photo: z.string(),
});

export const thankYouSchema = z.object({ customer: z.string() });

// One Root declares every composition the app has — add a <Composition> per
// video, each with its own id, component and schema. There is no second Root.
export function RemotionRoot() {
  return (
    <>
      <Composition
        id="BirthdayCard"
        component={BirthdayCard}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1080}
        schema={birthdaySchema}
        defaultProps={{ name: "", message: "", photo: "photo.png" }}
      />
      <Composition
        id="ThankYou"
        component={ThankYou}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        schema={thankYouSchema}
        defaultProps={{ customer: "" }}
      />
    </>
  );
}
```

`render({ composition })` picks between them by `id`, so the ids are the app's
video catalogue — keep them descriptive.

```tsx
// app/remotion/BirthdayCard.tsx
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate } from "remotion";
import type { z } from "zod";
import type { birthdaySchema } from "./Root";

export function BirthdayCard({ name, message }: z.infer<typeof birthdaySchema>) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#111", color: "white", opacity }}>
      <Img src={staticFile("photo.png")} />
      <h1>Happy birthday, {name}!</h1>
      <p>{message}</p>
    </AbsoluteFill>
  );
}
```

**Clips inside a composition use `<OffthreadVideo>`, not `<Video>`.** It extracts frames server-side, which is what a headless render needs. The two do not share props: `<Video>` is a plain HTML5 `<video>` and takes its attributes (`loop`, `poster`, `preload`), while `<OffthreadVideo>` rejects them at typecheck. To loop a clip, wrap it — `<Loop durationInFrames={…}><OffthreadVideo src={…} /></Loop>` (`Loop` is exported from `remotion`). `playbackRate`, `muted`, `volume` and `trimBefore` work on both. Before swapping one component for the other, check every prop against the one you are actually using.

Keep the composition pure: no data fetching, no reading globals, no current-time reads (`Date.now()` would differ every render). Everything variable is a prop.

## 2. Generate the composition types

After adding or changing a composition, run:

```bash
dev-tools remotion generate-compositions
```

This reads `app/remotion/` and writes `app/generated/compositions.ts` — the union of composition ids, mirroring `db-schema.ts`. It's what makes `render({ composition: "BirthdayCrd" })` a **typecheck error** instead of a failure minutes later inside a container. Props stay typed by the composition's own zod schema. Never edit the generated file; re-run the command when compositions change.

## 3. Verify a composition with a still — you can't watch video, so look at frames

You write video and cannot play it back. Compile what you just wrote, then render single frames off it:

```bash
dev-tools remotion bundle
dev-tools remotion still BirthdayCard --frame 0
dev-tools remotion still BirthdayCard --frame 75
dev-tools remotion still BirthdayCard --frame 149
```

**If the composition reads a `staticFile()` the app supplies per render, pass `--assets`** — otherwise those files are missing from the frame and you have verified a composition the app never runs. Files committed to `app/remotion/assets/` need no flag; they are already in the bundle.

A still's values are a **local file path or an http(s) URL**, not the app-storage key `render()` takes:

```bash
dev-tools remotion still BirthdayCard --frame 75 \
  --props '{"name":"Sam"}' --assets '{"photo.png":"./sample-photo.png"}'
```

The reason they differ: a still runs during the build, before the real file exists — no app user has uploaded a photo yet. So point it at a stand-in of the same kind and check the frame is laid out correctly around it. What the still proves is the layout, the framing, and that `staticFile()` resolves; not that a particular app user's file works.

Stand-ins are stored outside the app's own storage and deleted when the run ends, so one never appears in the app or at `/assets/*`. Do **not** write them into the app's storage to get around this — that is served publicly and persists. `app/remotion/assets/` is not the place for them either: it is committed, so a stand-in there ships to production.

`bundle` compiles `app/remotion/` into a test bundle that only stills read — no deploy, and it cannot affect what the live app or the preview renders. It is thrown away when the run ends.

**Re-run `bundle` after every composition change.** `still` renders the last bundle you made, so skipping it means checking frames of code you already replaced.

Each still writes a PNG into the workspace **and prints a critique** — a vision model describing the frame it just rendered. Read the critique and open the PNG; they catch different things. Fix anything either flags, then bundle and re-render.

Render three across the timeline — open, middle, close — after every composition change; it catches most layout and animation breakage for a fraction of a full render. Pass props the frame needs with `--props '{"name":"Sam","message":"..."}'`.

**If you cannot get a still to render, say so in your reply.** A composition you never saw a frame of is unverified, and telling an app builder their video works when you could not check is worse than telling them it is untested.

## 4. Render from a loader or action

`createRemotion(env)` is **server-side only** (loaders / actions / scheduled handlers). `render()` returns immediately with a `jobId` — the render runs on the platform; you poll for it.

```ts
import { createRemotion } from "~stencil/remotion";
import { createDb } from "~stencil/db";
import { requireAuth } from "~stencil/auth/server";
import { cards } from "~/generated/db-schema";

export async function action({ request, context }: Route.ActionArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  const db = createDb(context.cloudflare.env);

  // Gather everything up front — the composition can't reach the DB or the request.
  const { jobId } = await createRemotion(context.cloudflare.env).render({
    composition: "BirthdayCard",
    props: { name: user.name, message: "Many happy returns" },
    assets: {
      // Key = the filename the composition reads with staticFile(). Give it the
      // extension. Value = an app-storage key OR an absolute http(s) URL, which
      // the platform materialises into the render before the first frame.
      "photo.png": "uploads/1234-child.png",
    },
  });

  // The platform only knows a render happened — link it to your own domain row.
  await db.insert(cards).values({
    id: crypto.randomUUID(),
    userId: user.id,
    jobId,
    status: "queued",
    createdAt: new Date().toISOString(),
  });
  return { jobId };
}
```

Name each key with its extension — `"photo.png"`, not `"photo"` — and pass that same string to `staticFile()`. A key without one still works (the extension is inferred from the file's content type), but an unrecognised type is then a hard error rather than a guess.

Why `assets` is explicit: app R2 objects are private, so the platform fetches each one server-side and drops it into the render — nothing is ever exposed, and a missing file fails as "asset `photo.png` could not be fetched" **before** frame 1 rather than as a confusing timeout deep in the render.

## 5. Poll for status — from the loader, never `useEffect`

`status(jobId)` returns `queued | rendering (percent) | succeeded (key, durationSeconds) | failed (error) | cancelled`. Drive progress with a **resource route + `useFetcher`/`useRevalidator`**, not `fetch` in `useEffect` (that rule holds here too).

```ts
// app/routes/api.render-status.$jobId.tsx — resource route
import { createRemotion } from "~stencil/remotion";
export async function loader({ params, context }: Route.LoaderArgs) {
  return createRemotion(context.cloudflare.env).status(params.jobId!);
}
```

```tsx
// In the component: poll the resource route on an interval with useFetcher.
const fetcher = useFetcher<typeof loader>();
useEffect(() => {
  const id = setInterval(() => fetcher.load(`/api/render-status/${jobId}`), 2000);
  return () => clearInterval(id);
}, [jobId]);
const percent = fetcher.data?.percent ?? 0;
```

`render()` also returns an `estimatedSeconds` when it can, so the UI can say "about 20 seconds" instead of an indefinite spinner. `cancel(jobId)` stops a running render (it still bills the partial time), and `list()` returns this app's recent renders.

## 6. Serve the finished video from your own route

On `succeeded`, `status(jobId)` gives an R2 `key` in the app's own storage. Serve it with **range requests** so seeking works — exactly the media-serving pattern in the **`storage` skill**:

```tsx
<video src={`/api/files/${card.videoKey}`} controls preload="metadata" />
```

**The app owns its videos.** Keep the `jobId` and the key in D1 against your domain row, and when you delete the record, delete the R2 object too (`createStorage(env).delete(key)`). The platform never prunes app content on a timer.

## 7. Completion webhook (optional — polling already works)

`status(jobId)` is the primary path and always works. If you'd rather be pushed the result than poll, fill in the handler in **`app/routes/api.internal.remotion-complete.tsx`** — the platform side is already wired.

The route wraps your handler in `internalAction` from `~stencil/internal`, which owns the bearer check, JSON parse, and retry contract; you write only the app logic:

```ts
// app/routes/api.internal.remotion-complete.tsx
import { internalAction, type RemotionCompletePayload } from "~stencil/internal";

async function onRemotionComplete(payload: RemotionCompletePayload, env: Env): Promise<void> {
  // payload = { jobId, status, key?, durationSeconds?, error? }
  // Look up your row by payload.jobId and update it — idempotently.
}

export const action = internalAction<RemotionCompletePayload>(onRemotionComplete);
```

The route ships in the template and is registered in `app/routes.ts` at `api/internal/remotion-complete` — leave that entry in place. Delivery is at-least-once, so the handler must be **idempotent**, keyed on `jobId`.

---

## Checklist

- Compositions live in `app/remotion/`, pure — data via `props`, binaries via `assets`, no DB / request / clock reads.
- Clips use `<OffthreadVideo>`; loop with `<Loop>`, never a `loop` prop. Check each prop against the component you are actually using.
- `dev-tools remotion generate-compositions` after any composition change → typed `composition` and `props`.
- `dev-tools remotion bundle`, then `dev-tools remotion still <id> --frame N` at three points — with `--assets` (local paths or URLs) if the composition reads `staticFile()`. Read the critique, open the PNG, re-bundle after every change.
- Never claim a video works without a frame you actually saw; an unrenderable still is something to report, not to talk past.
- `render()` in a loader/action; poll `status()` via a resource route + `useFetcher`; never `fetch` in `useEffect`.
- Store `jobId` + key in D1; serve with range requests; delete the R2 object when you delete the record.
