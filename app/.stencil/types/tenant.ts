import type { AuthUser } from "./auth";

/** The app user whose subdomain a request arrived on. */
export type Tenant = {
  /** The word before the domain, as claimed by the app user. */
  subdomain: string;
  /** The domain it is a subdomain of. */
  domain: string;
  user: AuthUser;
};
