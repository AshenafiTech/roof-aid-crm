// Canonical appointment status enum, labels, hexes, and chip classes.
// Mirrors apps/mobile/lib/core/constants/appointment_status.dart.
// Source of truth for Decision §3.1 in
// docs/milestone5/web-dependencies-for-mobile.md.

export const APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  rescheduled: "Rescheduled",
};

// Locked hexes — must match the Flutter constants byte-for-byte.
export const APPOINTMENT_STATUS_HEX: Record<AppointmentStatus, string> = {
  pending: "#9CA3AF",
  confirmed: "#2563EB",
  completed: "#16A34A",
  cancelled: "#DC2626",
  no_show: "#EA580C",
  rescheduled: "#7C3AED",
};

// Tailwind chip classes (badge/pill style) kept alongside the hexes for
// list and table views. Pick one or the other per component.
export const APPOINTMENT_STATUS_CHIP: Record<AppointmentStatus, string> = {
  pending: "bg-gray-50 text-gray-700 border-gray-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  no_show: "bg-orange-50 text-orange-700 border-orange-200",
  rescheduled: "bg-purple-50 text-purple-700 border-purple-200",
};

// Left-border accent style used by the month/week calendar cells.
export const APPOINTMENT_STATUS_CALENDAR_CHIP: Record<AppointmentStatus, string> = {
  pending: "border-l-gray-400 bg-gray-50 text-gray-900",
  confirmed: "border-l-blue-500 bg-blue-50 text-blue-900",
  completed: "border-l-emerald-500 bg-emerald-50 text-emerald-900",
  cancelled: "border-l-red-500 bg-red-50 text-red-900 line-through",
  no_show: "border-l-orange-500 bg-orange-50 text-orange-900",
  rescheduled: "border-l-purple-500 bg-purple-50 text-purple-900",
};
