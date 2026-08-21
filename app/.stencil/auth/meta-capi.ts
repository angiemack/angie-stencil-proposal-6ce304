import { BACKEND_BASE, createBackendFetch } from "../backend";

const CAPI_CONFIG_URL = `${BACKEND_BASE}/meta/capi-config`;
const GRAPH_VERSION = "v21.0";

type MetaCapiConfig = { pixelId: string | null; accessToken: string | null };

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** `user.create.after` handler: fire CompleteRegistration past the signup response
 *  (draft-gated, on `waitUntil`, errors swallowed) so Meta never turns signup into a 500. */
export function handleCompleteRegistration(
  env: Env,
  ctx: ExecutionContext | undefined,
  user: { id: string; email: string },
  hookCtx: unknown,
): void {
  if (env.IS_DRAFT === "true") return;
  const endpoint = hookCtx as { request?: Request; headers?: Headers } | undefined;
  const headers = endpoint?.request?.headers ?? endpoint?.headers;
  const run = sendCompleteRegistration(env, user, headers).catch((err) =>
    console.error("[meta-capi] CompleteRegistration failed:", err),
  );
  if (ctx) ctx.waitUntil(run);
  else void run;
}

/** Fetch the pixel ID + access token, then POST one CompleteRegistration to the
 *  Meta Conversions API. Best-effort: any failure is logged, never surfaced. */
export async function sendCompleteRegistration(
  env: Env,
  user: { id: string; email: string },
  headers: Headers | undefined,
): Promise<void> {
  const res = await createBackendFetch(env)(CAPI_CONFIG_URL);
  if (!res.ok) throw new Error(`CAPI config fetch returned ${res.status}`);
  const { pixelId, accessToken } = await res.json<MetaCapiConfig>();
  if (!pixelId || !accessToken) return;

  const cookie = headers?.get("cookie") ?? null;
  const userData: Record<string, unknown> = {
    em: [await sha256Hex(user.email.trim().toLowerCase())],
  };
  const ip = headers?.get("cf-connecting-ip");
  if (ip) userData.client_ip_address = ip;
  const ua = headers?.get("user-agent");
  if (ua) userData.client_user_agent = ua;
  const fbp = readCookie(cookie, "_fbp");
  if (fbp) userData.fbp = fbp;
  const fbc = readCookie(cookie, "_fbc");
  if (fbc) userData.fbc = fbc;

  const body = {
    data: [
      {
        event_name: "CompleteRegistration",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        // Shared with any future client-side CompleteRegistration so Meta dedupes
        // the pair instead of double-counting the same signup.
        event_id: user.id,
        user_data: userData,
      },
    ],
  };

  const post = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!post.ok) {
    throw new Error(`Meta CAPI returned ${post.status}: ${(await post.text()).slice(0, 500)}`);
  }
}
