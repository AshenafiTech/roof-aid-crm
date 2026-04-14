"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function NotificationBell({
  userId,
  initialCount,
}: {
  userId: string;
  initialCount: number;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`notifications:${userId}`);

    channel.on(
      "postgres_changes" as never,
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      } as never,
      (payload: { eventType?: string; new?: { is_read?: boolean } }) => {
        if (payload.eventType === "INSERT" && payload.new?.is_read === false) {
          setCount((c) => c + 1);
        } else {
          router.refresh();
        }
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  const badge = count > 99 ? "99+" : count > 0 ? String(count) : null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9"
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
      onClick={() => router.refresh()}
    >
      <Bell className="h-4 w-4" />
      {badge && (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground",
          )}
        >
          {badge}
        </span>
      )}
    </Button>
  );
}
