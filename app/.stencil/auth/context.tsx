import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AuthContextValue = { user: AuthUser };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: PropsWithChildren<{ user: AuthUser }>) {
  return (
    <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
  );
}

/**
 * Returns auth context. Only call inside components rendered by a route that
 * called requireAuth and wrapped its output in <AuthProvider>.
 * Guaranteed non-null — requireAuth redirects before the component renders.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be called inside a protected route");
  return ctx;
}
