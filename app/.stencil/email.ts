import { BACKEND_BASE, createBackendFetch } from "./backend";

export interface SendEmailParams {
  to: string | string[];
  senderName?: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  reply_to?: string | string[];
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

/** One attachment on a received message. `path` is an internal, bearer-gated
 *  backend path — NOT a public URL, so never hand it to the browser as a link.
 *  Fetch the bytes server-side with `createEmail(env).getAttachment(id, index)`
 *  and re-serve them from your own route. */
export interface InboundAttachment {
  filename: string;
  contentType?: string;
  size?: number;
  /** Internal backend path (e.g. `/email/inbound/:id/attachments/:index`).
   *  Reference only — fetch via `getAttachment`, don't link to it directly. */
  path: string;
}

/** The app's inbound email address, as returned by `createEmail(env).address()`. */
export interface InboundAddress {
  /** Where mail lands when the sender addresses no mailbox, e.g. `noreply.<slug>@mail.hellostencil.com`. */
  default: string;
  /** The general shape any inbound address for this app follows, e.g. `<mailbox>.<slug>@mail.hellostencil.com`. */
  pattern: string;
  /** True when the app's email identity is a custom domain its owner connected.
   *  The platform flips this automatically — app code never needs to branch on it. */
  custom: boolean;
  /** Present when `custom` is true: the app's original shared-domain address,
   *  retained as a permanent alias that still receives. */
  sharedAlias?: { default: string; pattern: string };
}

/** Create an email client proxied through the Stencil backend service. No API keys required in the app. */
export function createEmail(env: Env) {
  const backendFetch = createBackendFetch(env);

  return {
    async send(params: SendEmailParams): Promise<{ id: string }> {
      const res = await backendFetch(`${BACKEND_BASE}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`Email send failed: ${await res.text()}`);
      return res.json() as Promise<{ id: string }>;
    },

    /** This app's inbound email address. `default` is where mail lands when the
     *  sender uses no mailbox; `pattern` is the general `<mailbox>.<slug>@…` shape
     *  (any `<mailbox>` routes to this app). Never build the address by hand —
     *  the platform owns the domain, so always read it from here. */
    async address(): Promise<InboundAddress> {
      const res = await backendFetch(`${BACKEND_BASE}/email/address`);
      if (!res.ok) throw new Error(`address failed: ${await res.text()}`);
      return res.json() as Promise<InboundAddress>;
    },

    /** Fetch one attachment's bytes, server-side, through the platform binding.
     *  `index` is the attachment's position in the received message's attachments.
     *  Returns the raw `Response` (Content-Type / Content-Disposition set) so you
     *  can re-serve it from your own route — attachments are never publicly
     *  reachable, so this is the only way to hand one to an end user. Example: a
     *  resource route that streams it back with `return new Response(res.body, res)`. */
    async getAttachment(id: string, index: number): Promise<Response> {
      const res = await backendFetch(
        `${BACKEND_BASE}/email/inbound/${encodeURIComponent(id)}/attachments/${index}`,
      );
      if (!res.ok) throw new Error(`getAttachment failed: ${await res.text()}`);
      return res;
    },
  };
}

export type Email = ReturnType<typeof createEmail>;
