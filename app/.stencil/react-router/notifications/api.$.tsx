import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getSession } from "../../auth/server";
import { createNotifications } from "../../notifications";

/**
 * `/api/notifications/*` — what the bell component talks to. Fetch endpoints, so
 * a signed-out caller gets a 401 rather than requireAuth's login redirect. Every
 * read and write is scoped to the session user; the user id never comes from the request.
 */
/**
 * Typed from react-router's own argument types rather than the generated
 * `./+types/api.$`: typegen only covers routes registered in `app/routes.ts`,
 * and this pack is opt-in, so the layer must typecheck in an app that has not spread it.
 */
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  if (params["*"] !== "list") {
    throw new Response("Not found", { status: 404 });
  }

  const session = await getSession(request, env);
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const notifications = createNotifications(env);
  const [items, unread] = await Promise.all([
    notifications.list(session.user.id),
    notifications.unreadCount(session.user.id),
  ]);
  return Response.json({ unread, notifications: items });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const path = params["*"];
  if (path !== "read" && path !== "read-all") {
    throw new Response("Not found", { status: 404 });
  }

  const session = await getSession(request, env);
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const notifications = createNotifications(env);
  if (path === "read-all") {
    await notifications.markAllRead(session.user.id);
  } else {
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    if (!id) {
      throw new Response("Missing id", { status: 400 });
    }
    await notifications.markRead(session.user.id, id);
  }
  return Response.json({ ok: true });
}
