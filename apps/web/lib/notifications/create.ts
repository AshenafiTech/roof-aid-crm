import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type NotificationInsert =
  Database["public"]["Tables"]["notifications"]["Insert"];

type CreateNotificationParams = {
  tenantId: string;
  userId: string;
  type: NotificationInsert["type"];
  title: string;
  body?: string;
  relatedId?: string;
  relatedType?: "prospect" | "appointment" | "document";
};

/**
 * Insert a notification for a specific user.
 * Call this from server actions after events like lead assignment,
 * status changes, inbound calls, etc.
 */
export async function createNotification(
  supabase: SupabaseClient<Database>,
  params: CreateNotificationParams,
) {
  const { error } = await supabase.from("notifications").insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    related_id: params.relatedId ?? null,
    related_type: params.relatedType ?? null,
  });

  if (error) {
    console.error("Failed to create notification:", error);
  }
}

/**
 * Insert the same notification for multiple users at once.
 */
export async function createNotificationForMany(
  supabase: SupabaseClient<Database>,
  userIds: string[],
  params: Omit<CreateNotificationParams, "userId">,
) {
  if (userIds.length === 0) return;

  const rows = userIds.map((userId) => ({
    tenant_id: params.tenantId,
    user_id: userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    related_id: params.relatedId ?? null,
    related_type: params.relatedType ?? null,
  }));

  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    console.error("Failed to create notifications:", error);
  }
}
