/** What an app user's connection to one provider currently is. */
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

/** What one provider looks like to an app user, as the loader supplies it. */
export interface ConnectionView {
  provider: string;
  /** The manifest's `reason`, shown to the app user. */
  reason: string;
  optional: boolean;
  status: ConnectionStatus;
  /** Display metadata only: the account's email, a workspace name. */
  connectionData: Record<string, unknown>;
  connectedAt?: string;
}
