import { route, type RouteConfigEntry } from "@react-router/dev/routes";
import { BACKEND_BASE, createBackendFetch } from "../backend";

/**
 * Member connections: letting each of your app's members connect their own
 * third-party account (their Google Calendar, their Slack) so your app can act
 * on their behalf.
 *
 * This is not the same thing as the app owner connecting *their* account. Each
 * member connects their own, and one member's data is never visible to another.
 *
 * Two things go together and must be added in the same change:
 *
 *   1. `app/connections.ts`, the manifest naming which providers you use
 *   2. `...stencilConnectionRoutes` in `app/routes.ts`
 *
 * A manifest with no registered route pack is a broken app: `requireConnection`
 * redirects members to `/app/connections`, and without the pack that is a 404.
 */

/** One provider this app wants its members to be able to connect. */
export interface ConnectionManifestEntry {
  /** Catalog slug, e.g. `google-calendar`, or a custom provider's slug. */
  provider: string;
  /**
   * Why this app wants it, shown to the member on the connections page.
   *
   * An app that cannot articulate why it wants somebody's calendar should not
   * be asking for it, which is why this is not optional.
   */
  reason: string;
  /** A missing connection degrades a feature rather than blocking it. */
  optional?: boolean;
}

export type ConnectionManifest = ConnectionManifestEntry[];

/**
 * The Stencil connections route pack: `/app/connections`.
 *
 * Spread into your routes config, with a RELATIVE path. React Router's config
 * loader runs before tsconfig aliases resolve, so `~stencil/connections` does
 * not work in `routes.ts` even though it works everywhere else:
 *
 *   import { stencilConnectionRoutes } from "./.stencil/connections";
 *
 *   export default [
 *     index("routes/home.tsx"),
 *     ...stencilConnectionRoutes,
 *   ] satisfies RouteConfig;
 */
export const stencilConnectionRoutes: RouteConfigEntry[] = [
  route("app/connections", ".stencil/connections/routes.tsx"),
  route("api/connections/*", ".stencil/connections/api.$.tsx"),
];

/** What a member's connection to one provider currently is. */
export type ConnectionStatus =
  | "connected"
  | "needs_reauth"
  | "not_connected"
  /**
   * The manifest names this provider but the app owner has not finished setting
   * it up. An ordinary state, not an error: the app renders it greyed out and
   * carries on.
   */
  | "unavailable";

/** A member's connection, with no credentials in it. Never any. */
export interface ConnectionSummary {
  provider: string;
  status: ConnectionStatus;
  /** Display metadata only: the account's email, a workspace name. */
  connectionData: Record<string, unknown>;
  scopes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A connection that has stopped working and needs the member to reconnect. */
export interface BrokenConnection {
  memberId: string;
  provider: string;
  since: string;
}

/** The typed failures a call can return. Branch on these, do not match strings. */
export type ConnectionErrorCode =
  | "not_connected"
  | "needs_reauth"
  | "provider_not_configured"
  | "provider_error"
  | "invalid_input"
  | "rate_limited";

export class ConnectionError extends Error {
  constructor(
    readonly code: ConnectionErrorCode | string,
    message: string,
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}

export interface ProxyRequest {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** True when the provider's response exceeded 1 MB and was cut short. */
  truncated: boolean;
}

/**
 * Server-side client for member connections.
 *
 * Throws when `BACKEND_SERVICE` is absent, which is what stops this being called
 * from a component. Every method needs the app's own bearer key, and that key
 * must never reach a browser.
 */
export function createConnections(env: Env) {
  if (!env.BACKEND_SERVICE) {
    throw new Error(
      "createConnections() is server-side only. Call it from a loader, an " +
        "action, or a scheduled handler, never from a component.",
    );
  }

  const backendFetch = createBackendFetch(env);

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await backendFetch(`${BACKEND_BASE}/member-connections${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new ConnectionError("provider_error", "The connections service replied unexpectedly.");
    }

    if (!response.ok) {
      throw new ConnectionError(
        typeof parsed.error === "string" ? parsed.error : "provider_error",
        typeof parsed.message === "string"
          ? parsed.message
          : "That connection could not be used right now.",
      );
    }

    return parsed as T;
  }

  return {
    /**
     * Act as one member.
     *
     * `memberId` is the member's id in this app's own database, the same id
     * `requireAuth` gives you. It is opaque to the platform.
     */
    as(memberId: string) {
      return {
        /** Run a catalog tool, validated against that tool's own input schema. */
        async call(provider: string, tool: string, input?: unknown): Promise<unknown> {
          const { output } = await post<{ output: unknown }>("/invoke", {
            memberId,
            provider,
            tool,
            input,
          });
          return output;
        },

        /** Call the provider's API directly. Locked to that provider's host. */
        async request(provider: string, req: ProxyRequest): Promise<ProxyResponse> {
          return post<ProxyResponse>("/invoke", { memberId, provider, request: req });
        },

        /** This member's status for one provider. Never throws for an ordinary state. */
        async status(provider: string): Promise<ConnectionStatus> {
          const { status } = await post<{ status: ConnectionStatus }>("/status", {
            memberId,
            provider,
          });
          return status;
        },

        /**
         * The same answer for several providers in one round trip.
         *
         * What a page listing the whole manifest should use. Asking one at a
         * time is a service hop each, which is cheap once and a visible pause by
         * the fourth entry.
         */
        async statuses(providers: string[]): Promise<Record<string, ConnectionStatus>> {
          if (providers.length === 0) return {};
          const { statuses } = await post<{ statuses: Record<string, ConnectionStatus> }>(
            "/status",
            { memberId, providers },
          );
          return statuses;
        },

        /**
         * Remove this member's connection to one provider.
         *
         * Deletes our record. It does NOT revoke the grant at the provider:
         * revoking at Google kills every scope for that OAuth client, which
         * under a shared client would take out other providers too. Tell the
         * member the truth and link them to the provider's own permissions page.
         *
         * The app genuinely loses access either way, immediately.
         */
        async remove(provider: string): Promise<void> {
          await post<{ removed: boolean }>("/remove", { memberId, provider });
        },

        /** Everything this member has connected. Contains no credentials. */
        async list(): Promise<ConnectionSummary[]> {
          const { connections } = await post<{ connections: ConnectionSummary[] }>(
            "/list",
            { memberId },
          );
          return connections;
        },
      };
    },

    /**
     * Every connection in this app that has stopped working.
     *
     * The hook for background notification. Stencil deliberately does not email
     * your members about a broken connection: their relationship is with your
     * app, and a Stencil-branded mail about it would contradict that, while an
     * app-branded mail sent by the platform would be worse. Deliverability,
     * unsubscribe and consent are yours.
     *
     * If your app already has recurring actions, poll this from one and notify
     * with `~stencil/email`. If it does not, the in-app states are enough.
     */
    async brokenConnections(): Promise<BrokenConnection[]> {
      const { connections } = await post<{ connections: BrokenConnection[] }>(
        "/broken",
        {},
      );
      return connections;
    },
  };
}

export type Connections = ReturnType<typeof createConnections>;
