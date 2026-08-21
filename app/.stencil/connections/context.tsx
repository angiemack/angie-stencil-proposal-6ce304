import { createContext, useContext, type PropsWithChildren } from "react";
import type { ConnectionStatus } from "./index";

/** What one provider looks like to a member, as the loader supplies it. */
export interface ConnectionView {
  provider: string;
  /** The manifest's `reason`, shown to the member. */
  reason: string;
  optional: boolean;
  status: ConnectionStatus;
  /** Display metadata only: the account's email, a workspace name. */
  connectionData: Record<string, unknown>;
  connectedAt?: string;
}

type ConnectionsContextValue = { connections: ConnectionView[] };

const ConnectionsContext = createContext<ConnectionsContextValue | null>(null);

/**
 * Supply connection state to the tree.
 *
 * State comes from a loader, never from a `useEffect` fetch. That is the
 * template's data-loading rule and it matters here specifically: a button whose
 * status arrives one render late shows "Connect" to somebody who is already
 * connected, and they click it.
 *
 *   export async function loader({ request, context }: Route.LoaderArgs) {
 *     const { user } = await requireAuth(request, context.cloudflare.env);
 *     const connections = await createConnections(context.cloudflare.env)
 *       .as(user.id)
 *       .list();
 *     return { connections };
 *   }
 */
export function ConnectionsProvider({
  connections,
  children,
}: PropsWithChildren<{ connections: ConnectionView[] }>) {
  return (
    <ConnectionsContext.Provider value={{ connections }}>
      {children}
    </ConnectionsContext.Provider>
  );
}

/**
 * One provider's state, plus the URL that starts connecting it.
 *
 * Returns `unavailable` when the provider is not in the supplied list at all,
 * which is the same thing the app owner not having set it up looks like. Both
 * mean "there is nothing here to connect", and giving them one answer keeps
 * callers from having to handle a fourth case that renders identically.
 */
export function useConnection(provider: string): {
  status: ConnectionStatus;
  connection: ConnectionView | null;
  /** Navigate here to start the flow. A plain link, so it works without JS. */
  connectHref: string;
} {
  const ctx = useContext(ConnectionsContext);
  if (!ctx) {
    throw new Error(
      "useConnection must be called inside <ConnectionsProvider>. Supply " +
        "connections from your route loader.",
    );
  }

  const connection = ctx.connections.find((c) => c.provider === provider) ?? null;

  return {
    status: connection?.status ?? "unavailable",
    connection,
    connectHref: `/api/connections/start?provider=${encodeURIComponent(provider)}`,
  };
}

/** Everything the loader supplied, for a page that lists them all. */
export function useConnections(): ConnectionView[] {
  const ctx = useContext(ConnectionsContext);
  if (!ctx) {
    throw new Error("useConnections must be called inside <ConnectionsProvider>");
  }
  return ctx.connections;
}
