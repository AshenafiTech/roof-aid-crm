"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_META,
} from "@/lib/constants/notification-types";

export function NotificationFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = searchParams.get("type");
  const unreadOnly = searchParams.get("unread") === "1";

  function setFilter(type: string | null, unread?: boolean) {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (unread) params.set("unread", "1");
    const qs = params.toString();
    router.push(`/notifications${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={!currentType && !unreadOnly ? "default" : "outline"}
        size="sm"
        onClick={() => setFilter(null)}
      >
        All
      </Button>
      <Button
        variant={unreadOnly && !currentType ? "default" : "outline"}
        size="sm"
        onClick={() => setFilter(null, true)}
      >
        Unread
      </Button>
      {NOTIFICATION_TYPES.map((type) => {
        const meta = NOTIFICATION_TYPE_META[type];
        return (
          <Button
            key={type}
            variant={currentType === type ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(type)}
          >
            {meta.label}
          </Button>
        );
      })}
    </div>
  );
}
