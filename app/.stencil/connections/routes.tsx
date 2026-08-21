import { useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { requireAuth } from "../auth/server";
import { createConnections } from "./index";
import { ConnectionsProvider, useConnections, type ConnectionView } from "./context";
import { accountLabel, ConnectButton } from "./connect-button";

/**
 * `/app/connections` — where a member manages the accounts they have connected.
 *
 * The platform guarantees this page exists wherever connections are used, so
 * `requireConnection` always has somewhere to send people. Your app decides
 * where the links to it live.
 *
 * The manifest is read from `app/connections.ts` at build time. An app with no
 * manifest renders an empty state rather than a blank page, because the most
 * likely reason to be here with nothing to show is that setup is half done, and
 * a blank page cannot say so.
 */

/** Loaded lazily so an app with no manifest still builds. */
async function readManifest(): Promise<
  Array<{ provider: string; reason: string; optional?: boolean }>
> {
  try {
    // @ts-expect-error — app-owned file, present only once connections are used.
    const module = await import("~/connections");
    return (module.default ?? []) as Array<{
      provider: string;
      reason: string;
      optional?: boolean;
    }>;
  } catch {
    return [];
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const { user } = await requireAuth(request, env);

  const manifest = await readManifest();
  const member = createConnections(env).as(user.id);

  // Two round trips for the whole page, not two per provider.
  const [summaries, statuses] = await Promise.all([
    member.list(),
    member.statuses(manifest.map((entry) => entry.provider)),
  ]);

  // The manifest is the source of truth for what to show. A connection to a
  // provider the app no longer names is not rendered: the app cannot use it, so
  // offering the member a Reconnect button for it would be a lie.
  const connections: ConnectionView[] = manifest.map((entry) => {
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

export default function ConnectionsPage() {
  // `useLoaderData` rather than the generated `Route.ComponentProps`, for the
  // same reason as the loader args above: this pack is opt-in, so typegen has
  // not necessarily run for it.
  const { connections } = useLoaderData() as { connections: ConnectionView[] };
  return (
    <ConnectionsProvider connections={connections}>
      <ConnectionsList />
    </ConnectionsProvider>
  );
}

function ConnectionsList() {
  const connections = useConnections();
  const [params] = useSearchParams();
  const needed = params.get("needed");

  if (connections.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-medium">Connected accounts</h1>
        <p className="mt-3 text-muted-foreground">
          This app does not use any connected accounts yet.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-medium">Connected accounts</h1>
      <p className="mt-2 text-muted-foreground">
        Accounts you have connected to this app. Only you can see them.
      </p>

      {needed ? (
        <p
          className="mt-6 rounded-md border border-border bg-muted px-4 py-3 text-sm"
          role="status"
        >
          Connect your {titleFor(needed)} account to continue.
        </p>
      ) : null}

      <ul className="mt-8 flex flex-col gap-4">
        {connections.map((connection) => (
          <ConnectionRow key={connection.provider} connection={connection} />
        ))}
      </ul>
    </main>
  );
}

function titleFor(provider: string): string {
  return provider
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ConnectionRow({ connection }: { connection: ConnectionView }) {
  const account = accountLabel(connection.connectionData);

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{titleFor(connection.provider)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{connection.reason}</p>
          {connection.optional ? (
            <p className="mt-1 text-xs text-muted-foreground">Optional</p>
          ) : null}
        </div>

        {connection.status === "unavailable" ? (
          <span className="text-sm text-muted-foreground">
            Not set up by the app owner yet
          </span>
        ) : (
          <ConnectButton provider={connection.provider} />
        )}
      </div>

      {connection.status === "needs_reauth" ? (
        <p className="mt-3 text-sm text-amber-700">
          This connection stopped working. Reconnect to keep using it.
        </p>
      ) : null}

      {connection.status === "connected" ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {account ? `Connected as ${account}` : "Connected"}
            {connection.connectedAt ? ` · ${formatDate(connection.connectedAt)}` : ""}
          </span>
          <RemoveAccess provider={connection.provider} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Deliberately "Remove access", never "Disconnect".
 *
 * "Disconnect" implies the grant at the provider is gone, and for Google it is
 * not: revoking there kills every scope for that OAuth client, which under a
 * shared client would take out other apps too, so the platform does not do it.
 * A member who believes they revoked access and did not is worse off than one
 * told the truth and given the link.
 *
 * Removing the record here is authoritative for us either way: the proxy stops
 * immediately, so the app genuinely cannot read their data any more.
 */
function RemoveAccess({ provider }: { provider: string }) {
  const permissionsUrl = permissionsPageFor(provider);

  return (
    <form method="post" action="/api/connections/remove">
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        className="text-sm text-muted-foreground underline hover:text-foreground"
        onClick={(event) => {
          const message =
            `This app will no longer be able to read your ${titleFor(provider)} data.` +
            (permissionsUrl
              ? ` This doesn't remove it from your ${titleFor(provider)} account, which you can do on the provider's permissions page.`
              : "");
          if (!confirm(message)) event.preventDefault();
        }}
      >
        Remove access
      </button>
    </form>
  );
}

/**
 * Where a member can revoke the grant themselves.
 *
 * Only providers whose page we actually know. The second sentence of the removal
 * copy is dropped where there is none, rather than replaced with something vague
 * about "your account settings", which sends people looking for a page that may
 * not exist.
 */
function permissionsPageFor(provider: string): string | null {
  if (provider.startsWith("google")) {
    return "https://myaccount.google.com/permissions";
  }
  if (provider === "slack") return "https://slack.com/apps/manage";
  if (provider === "github") return "https://github.com/settings/applications";
  return null;
}

/**
 * A fixed date, formatted on the server and rendered as-is.
 *
 * Deliberately not localised: this is server-rendered and then hydrated, and
 * `toLocaleDateString` gives UTC on the server and the visitor's timezone in the
 * browser, which is a hydration mismatch. A connection date does not need to be
 * exact to the day in the reader's zone.
 */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
