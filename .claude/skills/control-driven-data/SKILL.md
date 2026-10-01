---
name: control-driven-data
description: >
  Makes on-page controls actually change the data on screen. Apply when a control (filter,
  tab, picker, sort, toggle) decides what loaded data is shown, or when fixing a report
  like "I changed the setting and nothing happened until I left and came back".
metadata:
  agents: [builder]
---

# Control-Driven Data

A loader runs only on navigation. A control — a filter, tab, picker, or sort —
whose value sits in `useState` beside data read once from `loaderData` re-renders
the same stale payload after every change: the control does nothing until the app
user leaves the page and comes back. Nothing throws, nothing looks wrong in the
code, and the app user concludes the app is broken.

**The control's value has to reach the code that loads the data.** Pick the
mechanism by how much of the loader depends on it.

## Default — URL search params

When the control decides what the screen shows, keep its value in the URL:
changing it is a navigation, so the loader re-runs, and the selection survives
reload and sharing.

```tsx
// BAD — the loader never hears about the selection; the list never changes
export default function Songs({ loaderData }: Route.ComponentProps) {
  const [speed, setSpeed] = useState("slow");
  return (
    <>
      <SpeedPicker value={speed} onChange={setSpeed} />
      <SongList songs={loaderData.songs} />
    </>
  );
}

// GOOD — the selection lives in the URL, so changing it re-runs the loader
import { useSearchParams } from "react-router";

export async function loader({ request, context }: Route.LoaderArgs) {
  const speed = new URL(request.url).searchParams.get("speed") ?? "slow";
  const db = createDb(context.cloudflare.env);
  const songs = await db.select().from(tracks).where(eq(tracks.speed, speed));
  return { songs, speed };
}

export default function Songs({ loaderData }: Route.ComponentProps) {
  const [, setSearchParams] = useSearchParams();
  return (
    <>
      <SpeedPicker
        value={loaderData.speed}
        onChange={(speed) => setSearchParams({ speed }, { preventScrollReset: true })}
      />
      <SongList songs={loaderData.songs} />
    </>
  );
}
```

Render the control from `loaderData` (or `searchParams`), not from a second copy
in `useState` — one source of truth, so the control and the data cannot disagree.

## One slice of a bigger loader

When the loader returns several datasets and the control affects only one, don't
re-run it all — serve that slice from a resource route and fetch it with
`useFetcher`, straight from the change handler (no `useEffect`):

```tsx
// routes/api.songs.tsx — resource route returning only the control-dependent slice
export async function loader({ request, context }: Route.LoaderArgs) {
  const speed = new URL(request.url).searchParams.get("speed") ?? "slow";
  const db = createDb(context.cloudflare.env);
  return { songs: await db.select().from(tracks).where(eq(tracks.speed, speed)) };
}

// In the page component — everything else on the page keeps its loaderData
import type { loader as apiLoader } from "./api.songs";

const fetcher = useFetcher<typeof apiLoader>();
const songs = fetcher.data?.songs ?? loaderData.songs;
<SpeedPicker
  value={speed}
  onChange={(s) => {
    setSpeed(s);
    fetcher.load(`/api/songs?speed=${s}`);
  }}
/>;
```

## Two related cases that need neither

- **After a mutation** — `<Form method="post">` and `useFetcher` submissions
  revalidate every loader automatically once the action returns. No extra code.
- **A refresh not tied to any control** (data changed server-side, a "refresh"
  button): `const revalidator = useRevalidator()` from `react-router`, then
  `revalidator.revalidate()` re-runs the loaders in place.

## Not an option: `fetch()` in `useEffect`

A raw `fetch()` in `useEffect` recreates the same two-sources-of-truth problem —
loader data and fetched data drifting apart — plus request races, loading and
error states the router already handles. If you are reaching for it, one of the
two mechanisms above fits; use that instead.
