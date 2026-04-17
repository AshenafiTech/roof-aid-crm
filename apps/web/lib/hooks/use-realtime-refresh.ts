"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

type Options = {
  table: string;
  filter?: string;
  event?: RealtimeEvent;
  onEvent?: (payload: unknown) => void;
};

export function useRealtimeRefresh({
  table,
  filter,
  event = "*",
  onEvent,
}: Options) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channelName = `realtime:${table}:${filter ?? "all"}:${event}`;
    const channel = supabase.channel(channelName);

    channel.on(
      // Library typings for postgres_changes are loose in @supabase/supabase-js —
      // casting here avoids fighting them for a well-documented API.
      "postgres_changes" as never,
      { event, schema: "public", table, filter } as never,
      (payload: unknown) => {
        onEvent?.(payload);
        router.refresh();
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, event, onEvent, router]);
}
