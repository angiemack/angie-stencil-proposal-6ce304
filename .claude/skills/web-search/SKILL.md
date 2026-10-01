---
name: web-search
description: Reaching the open web from a built app — searching, and fetching a page's contents — for features that enrich or verify against live sources. No API keys. Load before building anything that reads the web at runtime.
metadata:
  agents: [chat, builder]
---

# Web search and fetch

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

**Never implement search as a model call.** `createAI`/`generateObject` over the model's own memory is not search: it returns stale, invented results with total confidence. If a feature asks to find, search, discover, or show latest/current/live anything — prices, events, products, listings, opportunities — it MUST go through `createSearch` or `createFetch`.

Great fit for scheduled work (load the `recurring-actions` skill): a scheduled handler runs `createSearch` to gather fresh leads, uses `createAI` to score each against a user's descriptor, and upserts the good ones. Keep result counts modest — a scheduled run is one normal request and must fit normal limits. Only add these when the app genuinely needs the web; don't wire them in otherwise.

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

