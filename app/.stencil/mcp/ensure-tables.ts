// The oauth_* tables ship in a new app's seed, but apps provisioned earlier
// have none. Create them on first OAuth traffic; the flag keeps it to one
// batch per isolate. oauth_application (and its client_id unique index) must
// precede the tables whose foreign key targets that column.
const OAUTH_DDL = [
  "CREATE TABLE IF NOT EXISTS `oauth_application` (`id` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `icon` text, `metadata` text, `client_id` text NOT NULL, `client_secret` text, `redirect_urls` text NOT NULL, `type` text NOT NULL, `disabled` integer DEFAULT false, `user_id` text, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade);",
  "CREATE UNIQUE INDEX IF NOT EXISTS `oauth_application_client_id_unique` ON `oauth_application` (`client_id`);",
  "CREATE TABLE IF NOT EXISTS `oauth_access_token` (`id` text PRIMARY KEY NOT NULL, `access_token` text NOT NULL, `refresh_token` text NOT NULL, `access_token_expires_at` integer NOT NULL, `refresh_token_expires_at` integer NOT NULL, `client_id` text NOT NULL, `user_id` text, `scopes` text NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade);",
  "CREATE UNIQUE INDEX IF NOT EXISTS `oauth_access_token_access_token_unique` ON `oauth_access_token` (`access_token`);",
  "CREATE UNIQUE INDEX IF NOT EXISTS `oauth_access_token_refresh_token_unique` ON `oauth_access_token` (`refresh_token`);",
  "CREATE TABLE IF NOT EXISTS `oauth_consent` (`id` text PRIMARY KEY NOT NULL, `client_id` text NOT NULL, `user_id` text NOT NULL, `scopes` text NOT NULL, `consent_given` integer NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade);",
];

let ensured = false;

/** Idempotently create the OAuth provider tables on the workspace D1. Safe to
 *  call on every OAuth request — it runs the batch once per isolate. */
export async function ensureMcpTables(env: Env): Promise<void> {
  if (ensured) return;
  await env.DB.batch(OAUTH_DDL.map((sql) => env.DB.prepare(sql)));
  ensured = true;
}
