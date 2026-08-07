import { BACKEND_BASE, createBackendFetch } from "./backend";

export interface SendPushParams {
  /** Notification heading. Required. */
  title: string;
  /** Notification body text. Required. */
  body: string;
  /** URL to open when the notification is clicked (defaults to "/"). */
  url?: string;
  /** Override the notification icon (defaults to the app's icon). */
  icon?: string;
  /**
   * Seconds the push service holds the message for an offline device before
   * discarding it. Defaults to 3600 (1h); max 86400.
   *
   * Set it SHORT for anything time-bound — a "starts in 10 minutes" reminder with
   * `ttl: 900` expires instead of arriving an hour late, which is the behaviour
   * you want. Only use long values for messages that stay true (a digest).
   */
  ttl?: number;
  /**
   * Delivery priority. Defaults to `"high"`, which on Android lets the
   * notification break through Doze instead of waiting for a maintenance window.
   * Drop to `"normal"`/`"low"` for non-urgent digests to be kind to batteries.
   */
  urgency?: "low" | "normal" | "high";
  /**
   * Collapse key. Two notifications with the same tag don't stack — the newer
   * replaces the older. Use a stable per-purpose key (`"practice-reminder"`) so a
   * recurring nudge stays one line in the notification shade instead of piling up.
   */
  tag?: string;
  /** With `tag`: re-alert (sound/vibration) when replacing. Default silent replace. */
  renotify?: boolean;
  /** Keep the notification up until the user acts on it. Desktop only. */
  requireInteraction?: boolean;
  /** One of these picks the audience — exactly one is required. */
  toUserId?: string;
  toUserIds?: string[];
  broadcast?: boolean;
}

export interface SendPushResult {
  ok: true;
  /** Id of this send — the key clicks are attributed to. */
  id: string;
  /**
   * `no_recipients` means the audience matched zero live subscriptions — the send
   * did nothing. Treat it as a failure worth logging, not a success.
   */
  status: "sent" | "partial" | "failed" | "no_recipients";
  /** Subscriptions the notification was sent to. */
  recipients: number;
  /** Accepted by the push service. NOT proof a device displayed it. */
  delivered: number;
  failed: number;
  /** Expired subscriptions pruned during this send. */
  pruned: number;
  /** Present when the audience exceeded the per-call limit and was capped. */
  truncated?: boolean;
}

/**
 * Send Web Push notifications, proxied through the Stencil backend service. No
 * keys required in the app. Server-side only (loaders / actions / scheduled
 * handlers). Requires PWA to be enabled in the app's settings.
 */
export function createPush(env: Env) {
  const backendFetch = createBackendFetch(env);

  return {
    async send(params: SendPushParams): Promise<SendPushResult> {
      const res = await backendFetch(`${BACKEND_BASE}/push/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`Push send failed: ${await res.text()}`);
      return res.json() as Promise<SendPushResult>;
    },
  };
}

export type Push = ReturnType<typeof createPush>;
