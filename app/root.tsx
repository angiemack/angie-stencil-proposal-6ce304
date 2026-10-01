import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { withStrings } from "~stencil/react-router/strings";
import { StencilRoot } from "~stencil/react-router/root";
import { PlatformErrorBoundary } from "~stencil/react-router/error-boundary";

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
  return (
    <StencilRoot>
      <Outlet />
    </StencilRoot>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <PlatformErrorBoundary error={error} />;
}
