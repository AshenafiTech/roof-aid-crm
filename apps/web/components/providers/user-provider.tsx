"use client";

import { createContext, useContext } from "react";

import type { AuthUser } from "@/lib/types/auth";

const UserContext = createContext<AuthUser | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/**
 * Access the authenticated user inside any client component under the dashboard layout.
 * Throws if used outside of UserProvider — this is intentional so bugs surface early.
 */
export function useUser(): AuthUser {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error("useUser() must be used within a <UserProvider>");
  }
  return user;
}
