"use client";

import { createContext, use, type ReactNode } from "react";
import type { User } from "@/lib/api/types";

// `undefined` only outside the provider, so a missing provider fails loudly instead of reading as signed out.
const SessionContext = createContext<User | null | undefined>(undefined);

/** Hands the user the root layout fetched (`getCurrentUser`) to client components. */
export function SessionProvider({ user, children }: { user: User | null; children: ReactNode }) {
  return <SessionContext value={user}>{children}</SessionContext>;
}

/** The signed-in viewer, or null. */
export function useSession(): User | null {
  const user = use(SessionContext);
  if (user === undefined) throw new Error("useSession() must be used inside <SessionProvider>.");
  return user;
}
