/**
 * Ambient global types for the platform layer — the `Env` binding surface and
 * the client-side `window.stencil` APIs. Refreshed on every build with the rest
 * of `app/.stencil/`, so a new platform binding reaches existing apps on their
 * next build instead of failing to compile against a frozen copy.
 */

/**
 * Client-side Stencil APIs injected by the platform on the published app.
 * Browser-only, and only on the live app (not the editor preview). The push
 * API additionally requires PWA to be enabled in app settings.
 */
type StencilPushStatus =
  | "unsupported" // browser has no service worker / Push API
  | "needs-install" // iOS Safari: the user must Add to Home Screen first
  | "denied" // notifications blocked by the user
  | "default" // supported, permission not yet requested
  | "granted" // permission granted, no active subscription
  | "subscribed"; // permission granted and subscribed

type StencilPushResult =
  | { ok: true }
  | { ok: false; reason: StencilPushStatus | "not-configured" | "server" };

interface Window {
  stencil?: {
    /**
     * Web Push opt-in. Call subscribe() from a user gesture (e.g. a button
     * click) — iOS ignores permission prompts that aren't gesture-initiated.
     */
    push?: {
      subscribe(): Promise<StencilPushResult>;
      unsubscribe(): Promise<StencilPushResult>;
      status(): Promise<StencilPushStatus>;
    };
    /** Track a custom analytics event. */
    track?(name: string, props?: Record<string, unknown>): void;
  };
}

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  BETTER_AUTH_SECRET: string;
  APP_SLUG: string;
  APP_ID: string;
  AUTH_ISSUER_URL: string;
  AUTH?: Fetcher;
  BACKEND_SERVICE?: Fetcher;
  BACKEND_SERVICE_API_KEY?: string;
  PAYMENTS?: Fetcher;
  // Secret used to authenticate the platform's recurring-action triggers. Set
  // automatically at deploy; the scheduled route verifies inbound requests against it.
  SCHEDULE_TRIGGER_SECRET?: string;
  IS_DRAFT?: string;
}
