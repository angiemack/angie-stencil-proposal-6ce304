import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/** Better Auth tables for D1 (SQLite). Required by the drizzle adapter to
 * resolve model names ("user", "session", "account", "verification") to
 * their underlying tables. The matching DDL lives in ./db-seed.sql. */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  /** The app user's own subdomain on the app builder's domain, if they hold one. */
  subdomain: text("subdomain").unique(),
  /** JSON of the campaign tags and outside referrer the app user first arrived with; null when untagged. */
  signupAttribution: text("signup_attribution"),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** A subdomain its holder gave up. Blocked for 30 days so links to it don't
 *  land on someone else the week after. */
export const releasedSubdomain = sqliteTable("released_subdomain", {
  subdomain: text("subdomain").primaryKey(),
  userId: text("user_id"),
  releasedAt: integer("released_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const subscription = sqliteTable("subscription", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull(),
  tierId: text("tier_id").notNull(),
  subscriptionId: text("subscription_id").notNull().unique(),
  status: text("status").notNull(), // active | trialing | past_due | canceled | incomplete
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }).notNull(),
  // Set while a cancellation is pending: the subscription stays `active` but
  // ends (instead of renewing) at this time. Null when no cancellation is scheduled.
  cancelAt: integer("cancel_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** Per-app-user TOTP secret and backup codes for Better Auth's twoFactor plugin. */
export const twoFactor = sqliteTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("two_factor_secret_idx").on(t.secret), index("two_factor_user_id_idx").on(t.userId)],
);

/** OAuth 2.1 provider tables backing Better Auth's `mcp` plugin (shared with
 *  oidc-provider). Field names are matched by the adapter against the plugin's
 *  own schema — note `redirectUrls`, comma-joined, not `redirectUris`. */

export const oauthApplication = sqliteTable("oauth_application", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  metadata: text("metadata"),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  redirectUrls: text("redirect_urls").notNull(),
  type: text("type").notNull(),
  disabled: integer("disabled", { mode: "boolean" }).default(false),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const oauthAccessToken = sqliteTable("oauth_access_token", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull().unique(),
  refreshToken: text("refresh_token").notNull().unique(),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }).notNull(),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }).notNull(),
  clientId: text("client_id").notNull().references(() => oauthApplication.clientId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const oauthConsent = sqliteTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthApplication.clientId, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  consentGiven: integer("consent_given", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
