import { useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { requireAuth } from "../../auth/server";
import { createConnections, type ConnectionManifest } from "../../connections";
import appManifest from "~/connections";
import ConnectionsPage from "../../ui/connections/page";
import type { ConnectionView } from "../../types/connections";

// Typed here, not trusted from the app: the skill teaches `satisfies ConnectionManifest`,
// which keeps the literal element type — no `optional` — so reading it off the raw import fails.
const connectionManifest: ConnectionManifest = appManifest;

/**
 * `/app/connections` — the route module: data in, page out.
 *
 * The platform guarantees this page exists wherever connections are used, so
 * `requireConnection` always has somewhere to send people. Your app decides
 * where the links to it live.
 *
 * The manifest is `app/connections.ts`, which every app ships (empty by
 * default). An app that names no providers renders an empty state rather than
 * a blank page, because the most likely reason to be here with nothing to show
 * is that setup is half done, and a blank page cannot say so.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);

  const member = createConnections(env).as(user.id);

  // Two round trips for the whole page, not two per provider.
  const [summaries, statuses] = await Promise.all([
    member.list(),
    member.statuses(connectionManifest.map((entry) => entry.provider)),
  ]);

  // The manifest is the source of truth for what to show. A connection to a
  // provider the app no longer names is not rendered: the app cannot use it, so
  // offering the member a Reconnect button for it would be a lie.
  const connections: ConnectionView[] = connectionManifest.map((entry) => {
    const summary = summaries.find((s) => s.provider === entry.provider);
    return {
      provider: entry.provider,
      reason: entry.reason,
      optional: entry.optional ?? false,
      status: statuses[entry.provider] ?? "unavailable",
      connectionData: summary?.connectionData ?? {},
      connectedAt: summary?.createdAt,
    };
  });

  return { connections };
}

/** Feeds the framework-free page: loader data in, search param in, props out. */
export default function ConnectionsRoute() {
  // `useLoaderData` rather than the generated `Route.ComponentProps`: this pack
  // is opt-in, so typegen has not necessarily run for it.
  const { connections } = useLoaderData() as { connections: ConnectionView[] };
  const [params] = useSearchParams();
  return <ConnectionsPage connections={connections} needed={params.get("needed")} />;
}
