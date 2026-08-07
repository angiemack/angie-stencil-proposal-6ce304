import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/generated/db-schema";

/** Create a Drizzle database client backed by the workspace D1 database. */
export function createDb(env: Env) {
  return drizzle(env.DB, { schema });
}
