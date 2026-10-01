// Shared-password gate for the letter. Server-only: the password never reaches
// the browser in any form. The unlock cookie carries an opaque token, not the
// password, so nothing about the secret is exposed even to an unlocked visitor.

const COOKIE_NAME = "martha_unlock";
// Opaque marker stored in the cookie once the password matches. Not derived
// from the password and reveals nothing about it.
const UNLOCK_TOKEN = "unlocked-2026-08";
// The shared password. Lives only on the server.
const PASSWORD = "dreambig";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

// Applied to every gate/letter response (and the redirects) so neither page is
// indexed or followed.
export const ROBOTS = "noindex, nofollow";

/** True when the request already carries a valid unlock cookie. */
export function isUnlocked(request: Request): boolean {
  const header = request.headers.get("cookie");
  if (!header) return false;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === COOKIE_NAME) return value === UNLOCK_TOKEN;
  }
  return false;
}

/** Case-insensitive, whitespace-trimmed comparison against the shared password. */
export function passwordMatches(input: FormDataEntryValue | null): boolean {
  if (typeof input !== "string") return false;
  return input.trim().toLowerCase() === PASSWORD;
}

/** The Set-Cookie value that unlocks the letter for 30 days. */
export function unlockCookie(): string {
  return [
    `${COOKIE_NAME}=${UNLOCK_TOKEN}`,
    "Path=/",
    `Max-Age=${THIRTY_DAYS_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}
