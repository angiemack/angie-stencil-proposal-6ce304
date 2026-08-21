---
name: hydration-safe-rendering
description: Prevents and fixes React hydration mismatches — "Minified React error #418", #423, #425, "Hydration failed because the server rendered HTML didn't match the client", a page that flashes or re-renders on load, or an error report the app builder sends from a live preview. Apply whenever a component reads localStorage, sessionStorage, window, navigator, matchMedia, or the current date/time, whenever a lazy useState initializer is written, and before finishing any route that renders conditionally. Covers useHydrated/ClientOnly, the "typeof window" trap, and invalid tag nesting.
metadata:
  title: Hydration-Safe Rendering
---

# Hydration-Safe Rendering

Every route in this app is server-rendered on Cloudflare and then hydrated in the
browser. **The first client render must produce exactly the element tree the
server produced.** When it doesn't, React throws #418, discards the server HTML,
and re-renders the subtree — the app still works, so the bug is invisible to you
and highly visible to the app builder, who sees a flash and a runtime error and
burns build turns asking for it to be fixed.

## Read the error before changing anything

The error text tells you which half of the problem you have. Do not skip this —
it is the difference between a five-minute fix and five wrong ones.

| Error | What React means | Where to look |
|---|---|---|
| `#418 …args[]=HTML` | An **element** is missing, extra, or of a different type | Rules 1 and 4 |
| `#418 …args[]=text` | An element matched but its **text** differs | Rule 3 |
| `#423`, `#425` | Recovered hydration error / text mismatch | Rules 1 and 3 |

`args[]=HTML` is **not** caused by dates, `Date.now()`, or `Math.random()` — those
change text, not structure. Chasing them there wastes the turn.

If the report carries a `Component stack:` block, start there — it names the
component and its ancestors even in a minified production build, which the error
message itself never does.

## Rule 1 — Never read browser-only state during the first render

`localStorage`, `sessionStorage`, `window.innerWidth`, `matchMedia`,
`navigator`, and `document` do not exist on the server. Reading them to decide
**whether an element renders** is the single most common cause of `#418 HTML` in
these apps.

**A `typeof window !== "undefined"` guard does not fix this.** It stops the
server crashing, and nothing more — the guard is false on the server and true on
the very first client render, which is precisely the mismatch. A lazy
`useState(() => …)` initializer runs during that first client render too, so it
is exactly as unsafe as reading in the render body.

```tsx
// BAD — server renders the block, a browser with dismissals renders nothing → #418 HTML
const [dismissed, setDismissed] = useState<Set<string>>(() => {
  if (typeof window === "undefined") return new Set();
  return new Set(JSON.parse(localStorage.getItem("dismissed") ?? "[]"));
});
const visible = notifications.filter((n) => !dismissed.has(n.id));
return <>{visible.length > 0 && <NotificationList items={visible} />}</>;

// GOOD — start from the server's value, reconcile after mount
const [dismissed, setDismissed] = useState<Set<string>>(new Set());
useEffect(() => {
  setDismissed(new Set(JSON.parse(localStorage.getItem("dismissed") ?? "[]")));
}, []);
```

Same trap, viewport flavour:

```tsx
// BAD — desktop client opens the panel, server never did
const [open, setOpen] = useState(() => window.innerWidth >= 1024 && localStorage.getItem(key) === "1");

// GOOD
const [open, setOpen] = useState(false);
useEffect(() => {
  if (window.innerWidth >= 1024) setOpen(localStorage.getItem(key) === "1");
}, []);
```

## Rule 2 — When a block genuinely cannot render on the server, gate it

`~stencil/hydration` exists for this. `useHydrated()` is `false` on the server
and on the first client render, then `true`; `ClientOnly` takes a function so its
contents are never evaluated during SSR.

```tsx
import { useHydrated, ClientOnly } from "~stencil/hydration";

const hydrated = useHydrated();
return <span>{hydrated ? new Date().toLocaleDateString() : ""}</span>;

<ClientOnly fallback={<span className="opacity-0">Good day</span>}>
  {() => <span>Good {greetingForHour(new Date().getHours())}</span>}
</ClientOnly>
```

## Rule 3 — Time and locale come from the loader, not from render

Cloudflare renders in **UTC**; the browser renders in the visitor's timezone. So
`new Date()`, `Date.now()`, `.getHours()`, `.toLocaleDateString()`,
`Intl.DateTimeFormat` without an explicit `timeZone` all differ across the
boundary.

Compute the clock **once in the loader** and pass it down — then both sides
render the same string and no gating is needed:

```ts
export async function loader() {
  return { nowMs: Date.now(), items };   // one clock, serialized into the HTML
}
```

Format from that `nowMs` with UTC-stable helpers (`getUTCMonth`, a month-name
table, plain `YYYY-MM-DD` string comparison). Reach for `useHydrated()` only when
the value must genuinely be the visitor's local time.

## Rule 4 — Never nest tags the HTML parser will rearrange

The browser silently restructures invalid nesting while parsing, so the DOM stops
matching the HTML the server sent — a permanent `#418 HTML` that no amount of
state-gating will fix, and that `suppressHydrationWarning` cannot hide. It never
shows up server-side, because React's string renderer is lenient about nesting —
only the browser's parser rewrites it, so this always reproduces and never in SSR.

Never emit:

- a `<div>`, `<p>`, `<ul>`, `<table>`, `<section>`, or any heading inside a `<p>`
- `<a>` inside `<a>`, `<button>` inside `<button>`, `<form>` inside `<form>`
- `<li>` directly inside `<li>`
- anything but `<li>` as a direct child of `<ul>`/`<ol>`
- text or a `<div>` as a direct child of `<table>`/`<tbody>`/`<tr>`
- anything but `<option>`/`<optgroup>` as a direct child of `<select>`

This includes nesting created through components — a UI component whose root is a
`<p>` (card/dialog descriptions often are) must never be given block children.

## Rule 5 — `suppressHydrationWarning` is not a fix

It silences a mismatch on **one element's own text or attributes**, one level
deep. It does not apply to children, does not stop `#418 HTML`, and leaves the
underlying divergence in place. Use it only for a value that is genuinely
expected to differ and is genuinely inconsequential. If you are reaching for it
to make an error go away, you have not found the cause yet.

## Checklist before finishing a route

- [ ] Does any `useState` lazy initializer touch `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, or `matchMedia`? → move it into `useEffect`.
- [ ] Does any `typeof window !== "undefined"` appear outside an effect or event handler? → it is a mismatch, not a guard.
- [ ] Does any `&&` or ternary that decides whether an element renders depend on browser-only state? → default to the server's branch, reconcile in an effect.
- [ ] Does any component call `new Date()`, `Date.now()`, or `toLocale*` during render? → move the clock to the loader.
- [ ] Any `<div>` inside `<p>`, `<a>` in `<a>`, or non-`<li>` child of `<ul>`? → restructure.
