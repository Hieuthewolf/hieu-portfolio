import { createAuthClient } from "better-auth/react";

// Same-origin: the auth routes live at /api/auth/* (dev via the Vite proxy, prod
// via the api/auth function). Defaults to window.location.origin + /api/auth.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
