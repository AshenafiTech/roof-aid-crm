"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { Bell, Check, CheckCheck, ExternalLink, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getNotificationMeta } from "@/lib/constants/notification-types";
import type { NotificationRow } from "@/lib/queries/notifications";
import {
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "./notifications/actions";

type Props = {
  userId: string;
  initialCount: number;
  initialNotifications: NotificationRow[];
};

function getRelatedHref(n: NotificationRow): string | null {
  if (!n.related_id || !n.related_type) return null;
  switch (n.related_type) {
    case "prospect":
      return `/prospects/${n.related_id}`;
    case "appointment":
      return `/appointments`;
    case "document":
      return `/documents`;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Detail Dialog (shared popup for reading a notification)            */
/* ------------------------------------------------------------------ */

function NotificationDetailDialog({
  notification,
  open,
  onOpenChange,
}: {
  notification: NotificationRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const meta = getNotificationMeta(notification.type);
  const Icon = meta.icon;
  const href = getRelatedHref(notification);
  const isRead = notification.is_read ?? false;

  function handleDelete() {
    startTransition(async () => {
      await deleteNotification({ id: notification.id });
      onOpenChange(false);
    });
  }

  function handleNavigate() {
    onOpenChange(false);
    if (href) router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                !isRead ? "bg-primary/10" : "bg-muted",
              )}
            >
              <Icon className={cn("h-4 w-4", meta.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm">
                {notification.title ?? "Notification"}
              </DialogTitle>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {meta.label}
                </Badge>
                {!isRead && (
                  <Badge variant="default" className="text-[10px]">
                    Unread
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {notification.body ? (
          <p className="text-sm leading-relaxed text-foreground">
            {notification.body}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No additional details.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {notification.created_at
            ? format(
                new Date(notification.created_at),
                "MMM d, yyyy 'at' h:mm a",
              )
            : ""}
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          {href && (
            <Button size="sm" onClick={handleNavigate} disabled={isPending}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View details
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Bell + Dropdown                                                    */
/* ------------------------------------------------------------------ */

export function NotificationBell({
  userId,
  initialCount,
  initialNotifications,
}: Props) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<NotificationRow | null>(null);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

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
        }
        router.refresh();
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  const badge = count > 99 ? "99+" : count > 0 ? String(count) : null;

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllAsRead();
    });
  }

  function handleSelect(n: NotificationRow) {
    if (!(n.is_read ?? false)) {
      startTransition(async () => {
        await markAsRead({ id: n.id });
      });
    }
    setSelected(n);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            aria-label={
              count > 0 ? `${count} unread notifications` : "Notifications"
            }
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
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80">
          <div className="flex items-center justify-between px-1.5 py-1">
            <DropdownMenuLabel className="py-0">
              Notifications
            </DropdownMenuLabel>
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-xs"
                onClick={handleMarkAllRead}
                disabled={isPending}
              >
                <CheckCheck className="mr-1 h-3 w-3" />
                Mark all read
              </Button>
            )}
          </div>
          <DropdownMenuSeparator />

          {notifications.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((n) => {
              const meta = getNotificationMeta(n.type);
              const Icon = meta.icon;
              const isRead = n.is_read ?? false;

              return (
                <DropdownMenuItem
                  key={n.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5",
                    !isRead && "bg-primary/5",
                  )}
                  onSelect={() => handleSelect(n)}
                >
                  {!isRead && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                  <Icon
                    className={cn("h-3.5 w-3.5 shrink-0", meta.color)}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
                      !isRead ? "font-medium" : "font-normal",
                    )}
                  >
                    {n.title ?? "Notification"}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {n.created_at
                      ? formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                        })
                      : ""}
                  </span>
                </DropdownMenuItem>
              );
            })
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="justify-center text-xs font-medium"
            onSelect={() => router.push("/notifications")}
          >
            View all notifications
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {selected && (
        <NotificationDetailDialog
          notification={selected}
          open={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        />
      )}
    </>
  );
}
