"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import {
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { NotificationRow } from "@/lib/queries/notifications";
import { getNotificationMeta } from "@/lib/constants/notification-types";

import { markAsRead, markAllAsRead, deleteNotification } from "./actions";

function getRelatedHref(notification: NotificationRow): string | null {
  if (!notification.related_id || !notification.related_type) return null;
  switch (notification.related_type) {
    case "prospect":
      return `/prospects/${notification.related_id}`;
    case "appointment":
      return `/appointments`;
    case "document":
      return `/documents`;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Detail Dialog                                                      */
/* ------------------------------------------------------------------ */

function NotificationDialog({
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
          <p className="text-sm text-foreground leading-relaxed">
            {notification.body}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No additional details.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {notification.created_at
            ? format(new Date(notification.created_at), "MMM d, yyyy 'at' h:mm a")
            : ""}
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          {href && (
            <Button
              size="sm"
              onClick={handleNavigate}
              disabled={isPending}
            >
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
/*  Compact Row                                                        */
/* ------------------------------------------------------------------ */

function NotificationItem({
  notification,
  onSelect,
}: {
  notification: NotificationRow;
  onSelect: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const meta = getNotificationMeta(notification.type);
  const Icon = meta.icon;
  const isRead = notification.is_read ?? false;

  function handleMarkRead(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      await markAsRead({ id: notification.id });
    });
  }

  function handleClick() {
    if (!isRead) {
      startTransition(async () => {
        await markAsRead({ id: notification.id });
      });
    }
    onSelect();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent/50",
        !isRead && "border-primary/20 bg-primary/5",
        isRead && "border-border bg-background",
        isPending && "opacity-50",
      )}
    >
      {!isRead && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      )}
      <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          !isRead ? "font-medium" : "font-normal",
        )}
      >
        {notification.title ?? "Notification"}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {notification.created_at
          ? formatDistanceToNow(new Date(notification.created_at), {
              addSuffix: true,
            })
          : ""}
      </span>
      {!isRead && (
        <span
          role="button"
          tabIndex={0}
          onClick={handleMarkRead}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleMarkRead(e as unknown as React.MouseEvent);
          }}
          className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-accent group-hover:flex"
          aria-label="Mark as read"
        >
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Pagination                                                         */
/* ------------------------------------------------------------------ */

function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");

  pages.push(total);
  return pages;
}

function Pagination({
  currentPage,
  totalPages,
  pageSize,
  total,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const rangeStart = (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams);
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(`/notifications${qs ? `?${qs}` : ""}`);
    });
  }

  if (totalPages <= 1) return null;

  const pages = buildPageNumbers(currentPage, totalPages);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-between",
        isPending && "opacity-50",
      )}
    >
      <p className="text-sm text-muted-foreground">
        Showing {rangeStart}–{rangeEnd} of {total}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={currentPage <= 1 || isPending}
          onClick={() => goToPage(currentPage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span
              key={`ellipsis-${i}`}
              className="flex h-8 w-8 items-center justify-center text-sm text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? "default" : "outline"}
              size="icon"
              className="h-8 w-8 text-sm"
              disabled={isPending}
              onClick={() => goToPage(p)}
              aria-label={`Page ${p}`}
              aria-current={p === currentPage ? "page" : undefined}
            >
              {p}
            </Button>
          ),
        )}

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={currentPage >= totalPages || isPending}
          onClick={() => goToPage(currentPage + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NotificationList                                                   */
/* ------------------------------------------------------------------ */

export function NotificationList({
  notifications,
  total,
  currentPage,
  pageSize,
  unreadCount,
}: {
  notifications: NotificationRow[];
  total: number;
  currentPage: number;
  pageSize: number;
  unreadCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<NotificationRow | null>(null);
  const totalPages = Math.ceil(total / pageSize);

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllAsRead();
    });
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <p className="text-sm text-muted-foreground">No notifications yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} notification{total !== 1 ? "s" : ""}
          {unreadCount > 0 && ` (${unreadCount} unread)`}
        </p>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isPending}
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-1">
        {notifications.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onSelect={() => setSelected(n)}
          />
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        total={total}
      />

      {selected && (
        <NotificationDialog
          notification={selected}
          open={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        />
      )}
    </div>
  );
}
