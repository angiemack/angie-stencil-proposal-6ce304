import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { requireAuth } from "../auth/server";
import { signHandoff } from "./handoff";
import { createConnections } from "./index";

/**
 * `/api/connections/*` — the app's own half of the connect flow.
 *
 * Only one thing happens here, and it has to happen inside the app: minting the
 * handoff that vouches for the member. Stencil has no session for them and never
 * will, so the app signs a short-lived token with its own per-app key and sends
 * the member's browser to the broker carrying it.
 *
 * `requireAuth` first. Without it, anyone could mint a handoff naming any member
 * id and connect a provider account to somebody else's record.
 */
/**
 * Typed from react-router's own argument types rather than the generated
 * `./+types/api.$`.
 *
 * Typegen only emits types for routes registered in `app/routes.ts`, and this
 * pack is deliberately opt-in: an app that has not spread
 * `stencilConnectionRoutes` has no generated types for these files, and the
 * layer must still typecheck in every app. `AppLoadContext` is globally
 * augmented by the worker entry, so `context.cloudflare.env` is typed either way.
 */
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const action = params["*"];

  if (action !== "start") {
    throw new Response("Not found", { status: 404 });
  }

  const { user } = await requireAuth(request, env);

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  if (!provider) {
    throw new Response("Missing provider", { status: 400 });
  }

  // Where the member lands afterwards. Defaults to the connections page rather
  // than to wherever they came from, because the referrer is attacker-supplied
  // and the broker validates the return URL against this app's own hostnames
  // anyway; an invalid one there is a 400 the member cannot act on.
  const returnTo = url.searchParams.get("returnTo") ?? "/app/connections";
  const returnUrl = new URL(returnTo, url.origin).toString();

  const handoff = await signHandoff(env.BACKEND_SERVICE_API_KEY ?? "", {
    appId: env.APP_ID,
    memberId: user.id,
    provider,
    returnUrl,
  });

  // A REDIRECT, not a fetch. The platform rule that an app must reach a Stencil
  // service through its service binding is about worker-to-worker subrequests,
  // which do not reach the worker from inside the same zone. This is the member's
  // own browser navigating, so the ordinary public route applies, and it has to
  // be a navigation anyway: the next step is a provider's consent screen.
  return redirect(
    `https://app.hellostencil.com/api/member-connections/start?handoff=${encodeURIComponent(handoff)}`,
  );
}

/**
 * `POST /api/connections/remove` — the member removes one of their connections.
 *
 * A form post rather than a fetch, so it works without JS and so the browser
 * handles the redirect back. `requireAuth` scopes it to the member making the
 * request: the member id comes from their session, never from the form, or one
 * member could remove another's connection by editing a hidden field.
 */
export async function action({ request, context, params }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  if (params["*"] !== "remove") {
    throw new Response("Not found", { status: 404 });
  }

  const { user } = await requireAuth(request, env);

  const form = await request.formData();
  const provider = String(form.get("provider") ?? "");
  if (!provider) {
    throw new Response("Missing provider", { status: 400 });
  }

  await createConnections(env).as(user.id).remove(provider);

  return redirect("/app/connections?removed=" + encodeURIComponent(provider));
}
