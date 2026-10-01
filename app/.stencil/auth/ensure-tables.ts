// The two_factor table and the user.two_factor_enabled flag ship in a new app's
// seed, but apps provisioned earlier have neither. Create them on first auth
// traffic; the flag keeps it to one pass per isolate (see mcp/ensure-tables.ts).
const TWO_FACTOR_DDL = [
  "CREATE TABLE IF NOT EXISTS `two_factor` (`id` text PRIMARY KEY NOT NULL, `secret` text NOT NULL, `backup_codes` text NOT NULL, `user_id` text NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade);",
  "CREATE INDEX IF NOT EXISTS `two_factor_secret_idx` ON `two_factor` (`secret`);",
  "CREATE INDEX IF NOT EXISTS `two_factor_user_id_idx` ON `two_factor` (`user_id`);",
];

let ensured = false;

/** Idempotently add the two-factor schema to the workspace D1. A duplicate
 *  column is what an already-migrated app looks like, so it is the expected path. */
export async function ensureTwoFactorSchema(env: Env): Promise<void> {
  if (ensured) return;
  try {
    await env.DB.prepare(
      "ALTER TABLE `user` ADD COLUMN `two_factor_enabled` integer DEFAULT false",
    ).run();
  } catch (err) {
    if (!/duplicate column name/i.test(String(err))) throw err;
  }
  await env.DB.batch(TWO_FACTOR_DDL.map((sql) => env.DB.prepare(sql)));
  ensured = true;
}
