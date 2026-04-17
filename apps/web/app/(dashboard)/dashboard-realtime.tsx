"use client";

import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export function DashboardRealtime({
  tenantId,
  userId,
}: {
  tenantId: string;
  userId: string;
}) {
  useRealtimeRefresh({
    table: "prospects",
    filter: `tenant_id=eq.${tenantId}`,
  });
  useRealtimeRefresh({
    table: "activities",
    filter: `tenant_id=eq.${tenantId}`,
  });
  useRealtimeRefresh({
    table: "notifications",
    filter: `user_id=eq.${userId}`,
  });
  return null;
}
