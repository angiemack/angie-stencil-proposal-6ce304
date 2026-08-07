import type { Route } from "./+types/api.internal.payments-probe";

/**
 * Trusted route the platform calls after deploying a payments-enabled app to
 * confirm payments is wired up correctly. The checks it runs can only be made
 * from inside the deployed worker, where the real `env.PAYMENTS` binding exists:
 *
 *  - **reachable** — can the app reach the payments service through its
 *    `PAYMENTS` service binding?
 *  - **paymentsEnabled** — is this app actually selling subscriptions? If not,
 *    there is nothing to check.
 *  - **liveTierId** — the live plan the payments service currently holds for
 *    this app, so the platform can confirm it matches what this deploy expects.
 *
 * Authenticated with the same bearer secret as the scheduled route
 * (`SCHEDULE_TRIGGER_SECRET`): requests without a matching bearer are rejected
 * before any work. Read-only — the probe never mutates anything. This route is
 * platform-managed; leave it and its auth check as shipped.
 */

const PAYMENTS_BASE = "https://payments.hellostencil.com";

/**
 * Fetch the payments service through the `PAYMENTS` service binding — the
 * transport a deployed app uses (a plain `fetch()` only works on the local dev
 * server). Mirrors `~stencil/payments/server.ts`.
 */
function paymentsFetch(env: Env, path: string): Promise<Response> {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${env.BACKEND_SERVICE_API_KEY ?? ""}`);
  const req = new Request(`${PAYMENTS_BASE}${path}`, { headers });
  return env.PAYMENTS ? env.PAYMENTS.fetch(req) : fetch(req);
}

/** Constant-time string compare so the bearer check can't be timed byte-by-byte. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;

  // Fail closed: with no configured secret there is nothing to authenticate
  // against, so no caller can be trusted. (In production the platform always
  // injects it; this only trips in local dev without the binding.)
  const expected = env.SCHEDULE_TRIGGER_SECRET;
  if (!expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token || !timingSafeEqual(token, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 1. Reachability through the PAYMENTS binding ──────────────────────────
  let appId: string | null = null;
  let reachError: string | null = null;
  try {
    const res = await paymentsFetch(env, "/v1/whoami");
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { appId?: string };
      appId = body.appId ?? null;
      if (!appId) reachError = "whoami returned no appId";
    } else {
      reachError = `whoami returned ${res.status}`;
    }
  } catch (err) {
    reachError = err instanceof Error ? err.message : String(err);
  }

  if (!appId) {
    // Binding is broken — we can't even resolve the app. Report it as
    // unreachable and let the platform decide what to surface.
    return Response.json({
      reachable: false,
      reachError,
      paymentsEnabled: null,
      liveTierId: null,
    });
  }

  // ── 2. Is this app payments-enabled? ─────────────────────────────────────
  let paymentsEnabled = false;
  try {
    const res = await paymentsFetch(env, `/v1/apps/${appId}/payments/enabled`);
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { enabled?: boolean };
      paymentsEnabled = body.enabled === true;
    }
  } catch {
    // Treat an errored check as "not enabled" — the binding itself resolved
    // (whoami succeeded), so this is a payments-side hiccup, not a transport bug.
  }

  if (!paymentsEnabled) {
    return Response.json({ reachable: true, paymentsEnabled: false });
  }

  // ── 3. Live plan the payments service holds for this app. The platform
  //       compares it against what this deploy expects; a lookup error is
  //       reported as inconclusive. ──
  let liveTierId: string | null = null;
  let tierError: string | null = null;
  try {
    const res = await paymentsFetch(env, `/v1/apps/${appId}/tier`);
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        tier?: { id?: string } | null;
      };
      liveTierId = body.tier?.id ?? null;
    } else {
      tierError = `tier lookup returned ${res.status}`;
    }
  } catch (err) {
    tierError = err instanceof Error ? err.message : String(err);
  }

  return Response.json({
    reachable: true,
    paymentsEnabled: true,
    liveTierId,
    tierError,
  });
}
