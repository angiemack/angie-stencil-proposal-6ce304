import { isRouteErrorResponse } from "react-router";
import type { PlatformError } from "../types/error";
import { ErrorScreen } from "../ui/error-boundary";

/** Classify whatever React Router threw into the shape the error screen renders. */
function normalise(error: unknown): PlatformError {
  if (isRouteErrorResponse(error)) {
    return {
      status: error.status,
      statusText: error.statusText,
      message: `${error.status} ${error.statusText || "error"}`.trim(),
    };
  }
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return {
    message: typeof error === "string" ? error : "An unexpected error occurred.",
  };
}

/**
 * The app's `ErrorBoundary`, pinned as a one-liner in `app/root.tsx`.
 *
 * Everything router-shaped lives here — deciding what counts as a route error
 * response, and whether this is a dev build. The screen itself is framework-free.
 */
export function PlatformErrorBoundary({ error }: { error: unknown }) {
  return <ErrorScreen error={normalise(error)} dev={import.meta.env.DEV} />;
}
