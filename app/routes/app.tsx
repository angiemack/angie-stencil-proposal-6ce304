import { Link } from "react-router";
import { requireAuth } from "~stencil/auth/server";
import { AuthProvider } from "~stencil/auth/context";
import type { Route } from "./+types/app";
import { Text } from "~stencil/strings";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  return { user };
}

export default function AppHome({ loaderData }: Route.ComponentProps) {
  return (
    <AuthProvider user={loaderData.user}>
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Text id="app.greeting" as="h1" className="text-2xl font-medium" vars={{ name: loaderData.user.name || loaderData.user.email }} />
          <Link
            to="/logout"
            className="mt-4 inline-block text-sm text-muted-foreground hover:underline"
          >
            <Text id="app.signOut" />
          </Link>
        </div>
      </div>
    </AuthProvider>
  );
}
