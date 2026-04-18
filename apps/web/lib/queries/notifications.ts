import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type NotificationRow =
  Database["public"]["Tables"]["notifications"]["Row"];

const PAGE_SIZE = 20;

export async function listNotifications(
  userId: string,
  opts: { page?: number; type?: string; unreadOnly?: boolean } = {},
) {
  const supabase = await createClient();
  const { page = 1, type, unreadOnly } = opts;
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (type) {
    query = query.eq("type", type);
  }
  if (unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    notifications: (data ?? []) as NotificationRow[],
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}

export async function getRecentNotifications(
  userId: string,
  limit = 5,
): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}
