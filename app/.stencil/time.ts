declare module "react-router" {
  interface AppLoadContext {
    /** IANA timezone of the person viewing this request, resolved before render. */
    viewerTimeZone: string;
  }
}

function isValidTimeZone(zone: string | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The viewer's IANA timezone for one request — Cloudflare's IP-derived zone,
 * else UTC. Called once per request by the worker entry; loaders read
 * `context.viewerTimeZone`.
 */
export function resolveViewerTimeZone(request: Request): string {
  const zone = (request as Request & { cf?: { timezone?: string } }).cf
    ?.timezone;
  return isValidTimeZone(zone) ? zone : "UTC";
}

/**
 * The calendar date at `at` in `timeZone`, as `YYYY-MM-DD` — what "today" means
 * to the person in that zone. Pass the loader's clock: `todayInZone(timeZone, nowMs)`.
 */
export function todayInZone(
  timeZone: string,
  at: number | Date = Date.now(),
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * A date formatted in an explicit zone, e.g. "Sep 7, 2026". Locale is pinned so
 * the server and the browser produce identical text.
 */
export function formatDateInZone(
  at: number | Date,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...(options ?? { month: "short", day: "numeric", year: "numeric" }),
  }).format(at);
}

/**
 * A time of day formatted in an explicit zone, labelled with it by default,
 * e.g. "3:30 PM EDT" — so a time shown to someone in another zone stays readable.
 */
export function formatTimeInZone(
  at: number | Date,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...(options ?? {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
  }).format(at);
}
