import type { Database } from "@/lib/supabase/database.types";

export type ProspectRow = Database["public"]["Tables"]["prospects"]["Row"];
export type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
export type NoteRow = Database["public"]["Tables"]["notes"]["Row"];

export type UserLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type ProspectWithAssignee = ProspectRow & {
  assigned_user: UserLite | null;
};

export type ActivityWithUser = ActivityRow & {
  user: Pick<UserLite, "first_name" | "last_name"> | null;
};

export type NoteWithAuthor = NoteRow & {
  author: Pick<UserLite, "first_name" | "last_name"> | null;
};

export function displayName(
  user: { first_name: string | null; last_name: string | null } | null,
): string {
  if (!user) return "—";
  const name = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || "—";
}
