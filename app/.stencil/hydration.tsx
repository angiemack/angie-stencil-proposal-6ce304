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
