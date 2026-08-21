import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

// Hydration state flips exactly once (server/first-render → hydrated) and never
// changes again, so the store never needs to notify — a no-op subscribe is correct.
const emptySubscribe = () => () => {};

/**
 * Returns `false` during SSR and the first client render, then `true` once the
 * app has hydrated.
 *
 * Use it to gate anything whose value differs between the server and the browser
 * — most commonly the current date/time. Cloudflare renders in **UTC** while the
 * browser renders in the **visitor's local timezone**, so `new Date()`,
 * `Date.now()`, `.getHours()`, `.toLocaleDateString()`, etc. produce different
 * text on each side and React throws a hydration mismatch (#418). Gating on
 * `useHydrated()` keeps the first client render identical to the server HTML,
 * then fills in the real, local value after mount.
 *
 * @example
 * const hydrated = useHydrated();
 * // renders "" on the server + first client render, then the local date
 * return <span>{hydrated ? new Date().toLocaleDateString() : ""}</span>;
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
 * the first client render. Use for whole blocks that depend on the browser's
 * clock, timezone, or other client-only state — current-time greetings, "today"
 * highlights, calendars.
 *
 * `children` is a **function** so its (mismatch-prone) contents are never
 * evaluated during SSR — only after the browser has taken over.
 *
 * Keep the whole page converged on one clock: render time-sensitive UI through
 * this (or `useHydrated`) so it's blank on the server and local on the client —
 * never leave some fields on server time and others on local time.
 *
 * @example
 * <ClientOnly fallback={<span className="opacity-0">Good day</span>}>
 *   {() => <span>Good {greetingForHour(new Date().getHours())}</span>}
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
