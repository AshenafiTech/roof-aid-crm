export const PROSPECT_STATUSES = [
  "new_leads",
  "prospects",
  "contacted",
  "scheduled",
  "closed_customer",
  "not_viable",
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  new_leads: "New Leads",
  prospects: "Prospects",
  contacted: "Contacted",
  scheduled: "Scheduled",
  closed_customer: "Closed Customer",
  not_viable: "Not Viable",
};

export const PROSPECT_STATUS_COLORS: Record<ProspectStatus, string> = {
  new_leads: "bg-blue-50 text-blue-700 border-blue-200",
  prospects: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-sky-50 text-sky-700 border-sky-200",
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  closed_customer: "bg-emerald-50 text-emerald-700 border-emerald-200",
  not_viable: "bg-gray-50 text-gray-500 border-gray-200",
};

export const PROSPECT_STATUS_ACCENTS: Record<ProspectStatus, string> = {
  new_leads: "border-l-blue-400",
  prospects: "border-l-blue-400",
  contacted: "border-l-sky-400",
  scheduled: "border-l-sky-400",
  closed_customer: "border-l-emerald-500",
  not_viable: "border-l-gray-300",
};

export const PROSPECT_STATUS_ROW_BG: Record<ProspectStatus, string> = {
  new_leads: "",
  prospects: "",
  contacted: "",
  scheduled: "",
  closed_customer: "",
  not_viable: "bg-muted/30 text-muted-foreground",
};

export const PROSPECT_STATUS_BAR_COLORS: Record<ProspectStatus, string> = {
  new_leads: "bg-blue-500",
  prospects: "bg-blue-400",
  contacted: "bg-sky-500",
  scheduled: "bg-sky-400",
  closed_customer: "bg-emerald-500",
  not_viable: "bg-gray-300",
};

export function isProspectStatus(value: unknown): value is ProspectStatus {
  return typeof value === "string" && (PROSPECT_STATUSES as readonly string[]).includes(value);
}
