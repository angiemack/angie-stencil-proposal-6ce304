import { useEffect } from "react";
import { CompassIcon, TriangleAlertIcon } from "lucide-react";
import { isRouteErrorResponse } from "react-router";

// Button classes inlined, not imported from app-owned UI — this screen must render
// even when the app's own Button is broken or gone.
const ACTION =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3 text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px";
const PRIMARY =
  "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-none active:shadow-none";
const OUTLINE =
  "border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50";

// The screen shown when a page fails, and the only place that failure is reported
// to the app builder. Copy is hardcoded, not <Text>: <Text> reads the root loader's
// data and this renders when that loader may have thrown.
export function PlatformErrorBoundary({ error }: { error: unknown }) {
  let heading = "Something went wrong";
  let details = "This page didn't load. Trying again usually fixes it.";
  let notFound = false;
  let statusLine: string | undefined;
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    notFound = error.status === 404;
    if (notFound) {
      heading = "Page not found";
      details = "This page doesn't exist, or it moved somewhere else.";
    } else {
      // Keep the code on screen so a member reporting the problem can quote it.
      statusLine = [error.status, error.statusText].filter(Boolean).join(" ");
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  // React Router renders this boundary for render-phase throws, so window's "error"
  // event never fires — this is the only place holding the error object.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let status: number | undefined;
    let detail: { message: string; stack: string };
    if (isRouteErrorResponse(error)) {
      // 404s are mostly crawler noise; report every other route error, else it reaches no one.
      if (error.status === 404) return;
      status = error.status;
      detail = { message: `${error.status} ${error.statusText || "error"}`.trim(), stack: "" };
    } else if (error instanceof Error) {
      detail = { message: error.message, stack: error.stack ?? "" };
    } else {
      detail = {
        message: typeof error === "string" ? error : "An unexpected error occurred.",
        stack: "",
      };
    }

    try {
      window.postMessage({ source: "stencil-app", type: "render-error", status, error: detail }, "*");
    } catch {
      // best-effort — never let reporting throw inside the error boundary
    }
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <span className="mb-6 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {notFound ? (
            <CompassIcon className="size-6" />
          ) : (
            <TriangleAlertIcon className="size-6" />
          )}
        </span>
        <h1 className="font-display text-2xl leading-tight tracking-tight text-balance">
          {heading}
        </h1>
        <p className="mt-2.5 text-muted-foreground text-balance">{details}</p>
        {/* Reloading a 404 only re-renders the 404, so home leads that case. */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {notFound ? (
            <>
              <a href="/" className={`${ACTION} ${PRIMARY}`}>
                Back to home
              </a>
              <button
                type="button"
                onClick={() => window.history.back()}
                className={`${ACTION} ${OUTLINE}`}
              >
                Go back
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className={`${ACTION} ${PRIMARY}`}
              >
                Try again
              </button>
              <a href="/" className={`${ACTION} ${OUTLINE}`}>
                Back to home
              </a>
            </>
          )}
        </div>
        {statusLine && (
          <p className="mt-6 font-mono text-xs text-muted-foreground">{statusLine}</p>
        )}
        {stack && (
          <pre className="mt-8 max-h-40 w-full overflow-auto rounded-lg border bg-muted p-4 text-left font-mono text-xs text-muted-foreground">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
