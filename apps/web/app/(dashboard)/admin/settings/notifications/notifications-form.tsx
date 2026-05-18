"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications/preferences";

type Permission = "default" | "granted" | "denied" | "unsupported";

export function NotificationsForm({
  initialPreferences,
}: {
  initialPreferences: NotificationPreferences;
}) {
  const [emailNewMessage, setEmailNewMessage] = useState(
    initialPreferences.emailNewMessage,
  );
  const [permission, setPermission] = useState<Permission>("default");
  const [isSaving, startSave] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as Permission);
  }, []);

  function persist(next: boolean) {
    startSave(async () => {
      const res = await updateNotificationPreferences({
        emailNewMessage: next,
      });
      if (res.ok) {
        toast.success("Preferences saved.");
      } else {
        toast.error(res.error);
        setEmailNewMessage((prev) => !prev);
      }
    });
  }

  async function handleToggleEmail() {
    const next = !emailNewMessage;
    setEmailNewMessage(next);

    if (next && permission === "default" && "Notification" in window) {
      const result = await Notification.requestPermission();
      setPermission(result as Permission);
      if (result !== "granted") {
        toast.message(
          "Preference saved, but browser notifications are blocked.",
        );
      }
    }

    persist(next);
  }

  async function handleRequestPermission() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
    if (result === "granted") {
      toast.success("Notifications enabled in this browser.");
    } else if (result === "denied") {
      toast.error(
        "Notifications are blocked. Enable them in your browser settings.",
      );
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PermissionBanner
        permission={permission}
        onRequest={handleRequestPermission}
      />

      <Card className="divide-y">
        <ToggleRow
          icon={Mail}
          title="New email"
          description="Show a push notification when a new email arrives in your connected Gmail inbox."
          enabled={emailNewMessage}
          onToggle={handleToggleEmail}
          disabled={isSaving}
        />
      </Card>
    </div>
  );
}

function PermissionBanner({
  permission,
  onRequest,
}: {
  permission: Permission;
  onRequest: () => void;
}) {
  if (permission === "granted") {
    return (
      <Card className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-green-100 p-2 text-green-700 dark:bg-green-900/40 dark:text-green-200">
          <Bell className="size-5" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-medium">Browser notifications are enabled.</p>
          <p className="text-muted-foreground">
            Roof-Aid can show push notifications in this browser.
          </p>
        </div>
      </Card>
    );
  }

  if (permission === "denied") {
    return (
      <Card className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-amber-100 p-2 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          <BellOff className="size-5" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-medium">Notifications are blocked.</p>
          <p className="text-muted-foreground">
            Allow notifications for this site in your browser settings to
            receive push alerts.
          </p>
        </div>
      </Card>
    );
  }

  if (permission === "unsupported") {
    return (
      <Card className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2 text-muted-foreground">
          <BellOff className="size-5" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-medium">
            This browser does not support push notifications.
          </p>
          <p className="text-muted-foreground">
            Try Chrome, Edge, or Firefox on desktop.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="rounded-md bg-muted p-2 text-muted-foreground">
        <Bell className="size-5" />
      </div>
      <div className="flex-1 text-sm">
        <p className="font-medium">Allow browser notifications.</p>
        <p className="text-muted-foreground">
          Grant permission so Roof-Aid can alert you when something needs your
          attention.
        </p>
      </div>
      <Button size="sm" onClick={onRequest}>
        Allow
      </Button>
    </Card>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="rounded-md bg-muted p-2">
        <Icon className="size-5" />
      </div>
      <div className="flex-1 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${title}`}
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          enabled ? "bg-primary" : "bg-muted-foreground/30",
          disabled && "opacity-60",
        )}
      >
        {disabled ? (
          <Loader2 className="absolute left-1/2 size-3.5 -translate-x-1/2 animate-spin text-white" />
        ) : (
          <span
            className={cn(
              "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        )}
      </button>
    </div>
  );
}
