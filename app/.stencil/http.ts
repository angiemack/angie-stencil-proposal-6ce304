/**
 * A redirect Response, with no framework behind it.
 *
 * Identical to what React Router's `redirect()` builds, so the platform SDKs
 * that `throw redirect(...)` keep working unchanged under React Router and
 * under anything else. Unlike `Response.redirect`, a relative path is fine —
 * which is what every caller here passes.
 */
export function redirect(to: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: to } });
}
