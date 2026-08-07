import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

const client = createAuthClient({
  plugins: [genericOAuthClient()],
});

// Only expose action methods. Do NOT use client hooks (useSession etc.) —
// read auth state from loaders via requireAuth / getSession instead.
export const { signIn, signOut } = client;
