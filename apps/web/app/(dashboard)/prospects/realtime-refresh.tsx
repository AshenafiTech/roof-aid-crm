"use client";

import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export function RealtimeRefresh({ tenantId }: { tenantId: string }) {
  useRealtimeRefresh({
    table: "prospects",
    filter: `tenant_id=eq.${tenantId}`,
  });
  return null;
}
