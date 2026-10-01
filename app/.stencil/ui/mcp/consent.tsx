import type { ConsentLoaderData } from "../../types/mcp";

/**
 * The OAuth consent screen an app user sees when an MCP client asks to connect.
 *
 * Rendering only — whatever routes to it resolves the client and handles the
 * decision. A plain `<form method="post">`, so allowing or denying works before
 * hydration and needs no router.
 */
export default function OAuthConsent({
  data,
  error,
}: {
  data: ConsentLoaderData;
  /** A failed decision, to show above the buttons. */
  error?: string;
}) {
  if (!data.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <h1 className="text-2xl font-semibold text-foreground">Request expired</h1>
        <p className="mt-2 text-muted-foreground">
          This authorization request is no longer valid. Start again from the app you were connecting.
        </p>
      </main>
    );
  }

  const [primaryHost, ...otherHosts] = data.hosts;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">Authorize access</h1>
        <p className="mt-2 text-foreground-secondary">
          An application wants to connect to your account and act on your behalf.
        </p>

        <div className="mt-6 rounded-lg bg-background-secondary p-4">
          <p className="text-sm text-muted-foreground">Requests will be sent to</p>
          <p className="mt-1 break-all text-lg font-medium text-foreground">
            {primaryHost ?? "an unverified destination"}
          </p>
          {otherHosts.length > 0 && (
            <p className="mt-1 break-all text-sm text-muted-foreground">
              also {otherHosts.join(", ")}
            </p>
          )}
          <p className="mt-3 text-sm text-foreground-secondary">
            It calls itself{" "}
            <span className="font-medium text-foreground">{data.clientName}</span>, but any app can
            choose that name — only continue if you recognize the destination above.
          </p>
        </div>

        {data.scopes.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">It is asking to</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">
              {data.scopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-error">{error}</p>}

        <form method="post" className="mt-6 flex gap-3">
          <input type="hidden" name="consent_code" value={data.consentCode} />
          <button
            type="submit"
            name="intent"
            value="deny"
            className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
          >
            Deny
          </button>
          <button
            type="submit"
            name="intent"
            value="allow"
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Allow access
          </button>
        </form>
      </div>
    </main>
  );
}
