import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getSession } from "../../auth/server";
import { checkSubdomain, setSubdomain, tenantUrl } from "../../tenant";

/**
 * `/api/subdomain/*` — what `<SubdomainField />` talks to. Fetch endpoints, so a
 * signed-out caller gets a 401 rather than requireAuth's login redirect.
 *
 * Every write is for the signed-in app user; the id never comes from the
 * request. An app that lets its own admins set someone else's address calls
 * `setSubdomain` from its own route, behind its own authorization.
 */
/**
 * Typed from react-router's own argument types rather than the generated
 * `./+types/api.$`: typegen only covers routes registered in `app/routes.ts`,
 * and this pack is opt-in, so the layer must typecheck in an app that has not spread it.
 */
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  if (params["*"] !== "check") throw new Response("Not found", { status: 404 });

  const session = await getSession(request, env);
  if (!session) throw new Response("Unauthorized", { status: 401 });

  const word = (new URL(request.url).searchParams.get("subdomain") ?? "").trim().toLowerCase();
  const check = await checkSubdomain(request, env, word, session.user.id);
  return Response.json({ ...check, preview: check.ok ? tenantUrl(request, word) : null });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  if (params["*"] !== "set") throw new Response("Not found", { status: 404 });

  const session = await getSession(request, env);
  if (!session) throw new Response("Unauthorized", { status: 401 });

  const form = await request.formData();
  const word = String(form.get("subdomain") ?? "");
  const result = await setSubdomain(request, env, session.user.id, word);
  return Response.json(result);
}
