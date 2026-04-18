"use client";

import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export function RealtimeRefresh({ prospectId }: { prospectId: string }) {
  useRealtimeRefresh({
    table: "prospects",
    filter: `id=eq.${prospectId}`,
  });
  useRealtimeRefresh({
    table: "activities",
    filter: `prospect_id=eq.${prospectId}`,
  });
  useRealtimeRefresh({
    table: "notes",
    filter: `prospect_id=eq.${prospectId}`,
  });
  return null;
}
