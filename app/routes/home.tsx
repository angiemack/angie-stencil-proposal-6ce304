import { Link } from "react-router";
import type { Route } from "./+types/home";
import { Text } from "~stencil/strings";

export const prerender = true;

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Hello World" },
    { name: "description", content: "Welcome to my app" },
  ];
}

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Text id="home.title" as="h1" className="text-2xl font-medium" />
        <Link
          to="/app"
          className="mt-4 inline-block text-sm text-muted-foreground hover:underline"
        >
          <Text id="home.cta" />
        </Link>
      </div>
    </div>
  );
}
