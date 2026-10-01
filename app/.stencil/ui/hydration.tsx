import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

// Hydration state flips exactly once (server/first-render → hydrated) and never
// changes again, so the store never needs to notify — a no-op subscribe is correct.
const emptySubscribe = () => () => {};

/**
 * Returns `false` during SSR and the first client render, then `true` once the
 * app has hydrated.
 *
 * Use it to gate anything whose value only exists in the browser —
 * `localStorage`, `window` dimensions, `matchMedia`. Reading such state during
 * render makes the first client render differ from the server HTML and React
 * throws a hydration mismatch (#418); gating keeps them identical, then fills
 * in the real value after mount.
 *
 * For the current date or time, don't gate: use `~stencil/time` instead — the
 * loader's clock plus `context.viewerTimeZone` renders the viewer's own day on
 * both sides with no blank first paint.
 *
 * @example
 * const hydrated = useHydrated();
 * // renders "" on the server + first client render, then the stored draft
 * return <span>{hydrated ? localStorage.getItem("draft") ?? "" : ""}</span>;
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // client snapshot
    () => false, // server snapshot
  );
}

/**
 * Renders `children()` only after hydration; shows `fallback` on the server and
 * the first client render. Use for whole blocks that only make sense in the
 * browser — a canvas, a `localStorage`-driven panel, an embedded map.
 *
 * `children` is a **function** so its (mismatch-prone) contents are never
 * evaluated during SSR — only after the browser has taken over.
 *
 * Date and time UI — "today" highlights, calendars, clock greetings — should
 * not be gated: `~stencil/time` renders the viewer's own day on both sides
 * with no blank first paint.
 *
 * @example
 * <ClientOnly fallback={<span className="opacity-0">Offline</span>}>
 *   {() => <span>{navigator.onLine ? "Online" : "Offline"}</span>}
 * </ClientOnly>
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: () => ReactNode;
  fallback?: ReactNode;
}): ReactNode {
  return useHydrated() ? children() : fallback;
}

/**
 * `hydrateRoot`'s `onRecoverableError` handler — wired up in `app/entry.client.tsx`.
 *
 * React recovers from a hydration mismatch by re-rendering the affected subtree
 * on the client, so the app keeps working, but its default handler rethrows and
 * the error surfaces as a bare "Minified React error #418" that names nothing.
 * Supplying this stops the rethrow and forwards the message, stack and
 * `componentStack` — which survives minification and pinpoints the component —
 * to the injector and the published-app error beacon.
 *
 * Reporting is all it does today; any further recoverable-error handling belongs
 * here rather than in the app-owned entry, which is why it's named for the hook
 * it implements and not for what it currently happens to do.
 */
export function handleRecoverableError(
  error: unknown,
  errorInfo?: { componentStack?: string | null },
): void {
  if (typeof window === "undefined") return;
  const err = error instanceof Error ? error : null;
  try {
    window.postMessage(
      {
        source: "stencil-app",
        type: "recoverable-error",
        error: {
          message: err?.message ?? String(error),
          stack: err?.stack ?? "",
          componentStack: errorInfo?.componentStack?.trim() ?? "",
        },
      },
      "*",
    );
  } catch {
    // best-effort — reporting must never break a render React already recovered
  }
}
