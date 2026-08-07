import { redirectDocument } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

/**
 * Force a full HTTP navigation so Stencil can handle the request
 * (instead of React Router treating it as an in-SPA route and 404-ing).
 * Used by the /login and /signup loaders.
 */
export function passthroughToDispatcher({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  throw redirectDocument(url.pathname + url.search);
}
