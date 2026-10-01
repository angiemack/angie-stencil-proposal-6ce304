import { useEffect, useState } from "react";
import { useConnection } from "./context";

/**
 * Whether this page is the app builder looking at their own unpublished app.
 *
 * Draft and preview hostnames are only ever reached from inside Stencil, so they
 * are a reliable stand-in for "the person looking at this can fix it". A
 * published app — platform subdomain or custom domain — never matches.
 *
 * Deliberately false during SSR and on the first client render, then true after
 * mount. The hostname does not exist on the server, and rendering different
 * markup on each side is a hydration mismatch; one flash of nothing on a draft
 * page is a much better trade than a broken tree on every page.
 */
function useIsBuilderPreview(): boolean {
  const [isPreview, setIsPreview] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    setIsPreview(
      host.endsWith("-draft.apps.hellostencil.com") ||
        host.endsWith(".previews.hellostencil.com"),
    );
  }, []);
  return isPreview;
}

export interface ConnectButtonProps {
  provider: string;
  /** Overrides the default label for the `not_connected` state. */
  label?: string;
  className?: string;
  /** Where to send the app user back to. Defaults to the current page. */
  returnTo?: string;
}

/** A readable name for a provider slug, when the app supplies none. */
function titleFor(provider: string): string {
  return provider
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * The inline button that starts an app user connecting one provider.
 *
 * Renders NOTHING to an app user when the provider is unavailable. An app whose
 * owner has not finished setting a provider up should show no button at all,
 * rather than a dead one that produces an error when clicked; the app user
 * cannot fix it and did not cause it.
 *
 * **The app builder is told instead.** Silence is right for the published app
 * and wrong for the one person who can act on it: an app builder looking at
 * their own draft sees an empty page and no reason for it, which is how app
 * `4d5b8115c62b` spent three rounds asking for a button that was already there.
 *
 * A plain link, not a fetch. The flow is a full-page redirect out to the
 * provider and back, so there is nothing for client-side JS to do, and a link
 * works before hydration.
 *
 */
export function ConnectButton({
  provider,
  label,
  className,
  returnTo,
}: ConnectButtonProps) {
  const { status, connection, connectHref } = useConnection(provider);
  const isBuilderPreview = useIsBuilderPreview();

  if (status === "unavailable") {
    if (!isBuilderPreview) return null;
    return (
      <span
        className="inline-flex items-center gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        data-connection-status="unavailable"
      >
        {titleFor(provider)} is not switched on for this app yet. Turn it on in App
        settings, then Build, then App user connections. Only you can see this.
      </span>
    );
  }

  const href = returnTo
    ? `${connectHref}&returnTo=${encodeURIComponent(returnTo)}`
    : connectHref;

  const base =
    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-ring focus-visible:ring-offset-2";

  if (status === "connected") {
    const account = accountLabel(connection?.connectionData);
    return (
      <span
        className={className ?? `${base} bg-muted text-muted-foreground`}
        data-connection-status="connected"
      >
        {account ? `Connected as ${account}` : `${titleFor(provider)} connected`}
      </span>
    );
  }

  if (status === "needs_reauth") {
    // The account label survives a broken connection deliberately, so the app
    // user reads "Reconnect ran@gmail.com" and does not have to work out which
    // of their accounts this was.
    const account = accountLabel(connection?.connectionData);
    return (
      <a
        href={href}
        className={className ?? `${base} bg-amber-100 text-amber-900 hover:bg-amber-200`}
        data-connection-status="needs_reauth"
      >
        {account ? `Reconnect ${account}` : `Reconnect ${titleFor(provider)}`}
      </a>
    );
  }

  return (
    <a
      href={href}
      className={className ?? `${base} bg-primary text-primary-foreground hover:bg-primary/90`}
      data-connection-status="not_connected"
    >
      {label ?? `Connect ${titleFor(provider)}`}
    </a>
  );
}

/**
 * A human-readable label for the connected account.
 *
 * `connection_data` is provider metadata and its shape varies, so this reads the
 * few keys providers actually use and gives up quietly rather than rendering
 * something like `[object Object]` next to somebody's name.
 *
 */
export function accountLabel(
  connectionData: Record<string, unknown> | undefined,
): string | null {
  for (const key of ["email", "login", "username", "name", "workspace"]) {
    const value = connectionData?.[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
