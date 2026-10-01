import { redirectDocument } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { isDispatcherPage } from "../../platform-paths";

/**
 * Hand a dispatcher-owned path back to the dispatcher. Returns for anything
 * else, so the caller decides what an unmatched path means.
 *
 * Exported for an app that already owns a splat route: two `*` routes is a
 * build error, so such an app leaves this one out and calls this at the top of
 * its own loader, keeping whatever 404 it already had.
 *
 *   export function loader({ request }: LoaderFunctionArgs) {
 *     passthroughIfDispatcherPage(request);
 *     // …your own not-found handling, unchanged
 *   }
 *
 * A REDIRECT, not a render: this runs on the server for a document request and
 * in the browser for a client navigation, so the app user reaches the
 * dispatcher's page with the right status either way, without waiting on
 * JavaScript. `redirectDocument` forces a real navigation rather than an
 * in-router one — the dispatcher owns this path, so the app must let go of it.
 */
export function passthroughIfDispatcherPage(request: Request): void {
  const url = new URL(request.url);
  if (isDispatcherPage(url.pathname)) throw redirectDocument(url.pathname + url.search);
}

/** Pass the platform's pages through; everything else 404s as it always did. */
export function loader({ request }: LoaderFunctionArgs): never {
  passthroughIfDispatcherPage(request);
  throw new Response(null, { status: 404, statusText: "Not Found" });
}

// Never rendered: the loader always throws. Without a component React Router
// treats the splat as a resource route and returns the thrown 404 as an empty
// response instead of bubbling it to the root error screen.
export default function CatchAll() {
  return null;
}
