import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { withStrings } from "~stencil/strings";

export const loader = withStrings<Route.LoaderArgs>();

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/assets/logo.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  { rel: "stylesheet", href: "/theme.css" },
];


export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  // Surface render/route errors to the Stencil injector so it can offer a
  // "Fix with AI" run. React Router catches render-phase throws internally and
  // renders this boundary, so window's "error" event never fires — this is the
  // only place that still holds the error object. Read message/stack regardless
  // of import.meta.env.DEV (the dev gate above only controls on-screen display).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isRouteErrorResponse(error)) return; // 404s / route responses aren't crashes
    const detail =
      error instanceof Error
        ? { message: error.message, stack: error.stack ?? "" }
        : { message: typeof error === "string" ? error : "An unexpected error occurred.", stack: "" };
    try {
      window.postMessage(
        { source: "stencil-app", type: "render-error", error: detail },
        "*",
      );
    } catch {
      // best-effort — never let reporting throw inside the error boundary
    }
  }, [error]);

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
