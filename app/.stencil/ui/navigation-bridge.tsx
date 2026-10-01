import { useEffect } from "react";

/**
 * Navigates the app's client router when the preview parent posts a target
 * path, with no full reload. Announces readiness on mount so the parent uses
 * smooth nav instead of its reload fallback. Inert outside the preview iframe.
 *
 * `navigate` is injected rather than pulled from a router hook, so this stays
 * framework-free — the adapter that knows the router supplies it.
 */
export function NavigationBridge({ navigate }: { navigate: (path: string) => void }) {
  useEffect(() => {
    let framed = false;
    try {
      framed = window.self !== window.top;
    } catch {
      framed = true;
    }
    if (!framed) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object" || data.type !== "stencil:navigate") return;
      if (typeof data.path === "string" && data.path.startsWith("/")) navigate(data.path);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ source: "stencil-app", type: "navigate-bridge:ready" }, "*");

    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return null;
}
