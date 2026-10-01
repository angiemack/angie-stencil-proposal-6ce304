import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouteLoaderData } from "react-router";
import { captureFirstTouch } from "../auth/attribution";
import type { Tenant } from "../types/tenant";
import { NavigationBridge } from "../ui/navigation-bridge";
import { StringsProvider } from "../ui/strings";

/**
 * Everything the platform needs rendered at the app root, in one wrapper.
 *
 * Pinned in `app/root.tsx` around `<Outlet />`. It supplies platform strings to
 * every `<Text>` below it and runs the preview navigation bridge. Both need the
 * router, which is why they are wired here rather than in the components
 * themselves — those stay framework-free so a static frontend can render them.
 *
 *   export default function App() {
 *     return (
 *       <StencilRoot>
 *         <Outlet />
 *       </StencilRoot>
 *     );
 *   }
 *
 * Strings come from the root loader, which `withStrings` populates. A root that
 * lost its loader renders copy as empty rather than throwing.
 */
export function StencilRoot({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const data = useRouteLoaderData("root") as { strings?: Record<string, unknown> } | undefined;
  useEffect(() => {
    captureFirstTouch();
  }, []);

  return (
    <>
      <NavigationBridge navigate={navigate} />
      <StringsProvider strings={data?.strings ?? {}}>{children}</StringsProvider>
    </>
  );
}

/**
 * The app user whose subdomain this page is being served on, or null when it is
 * not on anyone's own address. Read from the root loader, which `withTenant`
 * populates — resolving it here means one lookup for the whole page.
 */
export function useTenant(): Tenant | null {
  const data = useRouteLoaderData("root") as { tenant?: Tenant | null } | undefined;
  return data?.tenant ?? null;
}
