import { drizzle } from "drizzle-orm/d1";
import { count, gt } from "drizzle-orm";
import { oauthApplication } from "../auth/schema";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;

/** Dynamic client registration is public (RFC 7591), so a script could mint
 *  oauth_application rows without limit. Throttle new rows per app to a rate the
 *  sliding window enforces without ever locking out real clients. */
export async function handleDcrThrottle(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (request.method !== "POST" || pathname !== "/api/auth/oauth2/register") {
    return null;
  }

  const db = drizzle(env.DB);
  const [row] = await db
    .select({ recent: count() })
    .from(oauthApplication)
    .where(gt(oauthApplication.createdAt, new Date(Date.now() - WINDOW_MS)));

  if ((row?.recent ?? 0) < MAX_PER_WINDOW) return null;

  return Response.json(
    {
      error: "temporarily_unavailable",
      error_description: "Too many client registrations. Try again later.",
    },
    { status: 429, headers: { "Retry-After": String(WINDOW_MS / 1000) } },
  );
}
