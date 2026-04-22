import {
  Bell,
  Calendar,
  FileCheck,
  PhoneIncoming,
  MessageSquare,
  UserPlus,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

export const NOTIFICATION_TYPES = [
  "appointment_assigned",
  "document_signed",
  "inbound_call",
  "inbound_sms",
  "lead_assigned",
  "system_alert",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: string): value is NotificationType {
  return NOTIFICATION_TYPES.includes(value as NotificationType);
}

export const NOTIFICATION_TYPE_META: Record<
  NotificationType,
  { label: string; icon: LucideIcon; color: string }
> = {
  appointment_assigned: {
    label: "Appointment Assigned",
    icon: Calendar,
    color: "text-blue-600",
  },
  document_signed: {
    label: "Document Signed",
    icon: FileCheck,
    color: "text-green-600",
  },
  inbound_call: {
    label: "Inbound Call",
    icon: PhoneIncoming,
    color: "text-violet-600",
  },
  inbound_sms: {
    label: "Inbound SMS",
    icon: MessageSquare,
    color: "text-orange-600",
  },
  lead_assigned: {
    label: "Lead Assigned",
    icon: UserPlus,
    color: "text-indigo-600",
  },
  system_alert: {
    label: "System Alert",
    icon: AlertTriangle,
    color: "text-red-600",
  },
};

export function getNotificationMeta(type: string | null) {
  if (type && isNotificationType(type)) {
    return NOTIFICATION_TYPE_META[type];
  }
  return { label: "Notification", icon: Bell, color: "text-muted-foreground" };
}
