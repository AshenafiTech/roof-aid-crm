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
  new_leads: "bg-blue-100 text-blue-800 border-blue-200",
  prospects: "bg-purple-100 text-purple-800 border-purple-200",
  contacted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  scheduled: "bg-orange-100 text-orange-800 border-orange-200",
  closed_customer: "bg-green-100 text-green-800 border-green-200",
  not_viable: "bg-gray-100 text-gray-800 border-gray-200",
};

export const PROSPECT_STATUS_ACCENTS: Record<ProspectStatus, string> = {
  new_leads: "border-l-blue-500",
  prospects: "border-l-purple-500",
  contacted: "border-l-yellow-500",
  scheduled: "border-l-orange-500",
  closed_customer: "border-l-green-600",
  not_viable: "border-l-gray-400",
};

export const PROSPECT_STATUS_ROW_BG: Record<ProspectStatus, string> = {
  new_leads: "",
  prospects: "",
  contacted: "bg-yellow-50/40 hover:bg-yellow-50",
  scheduled: "bg-orange-50/40 hover:bg-orange-50",
  closed_customer: "bg-green-50/40 hover:bg-green-50",
  not_viable: "bg-muted/30 text-muted-foreground",
};

export function isProspectStatus(value: unknown): value is ProspectStatus {
  return typeof value === "string" && (PROSPECT_STATUSES as readonly string[]).includes(value);
}
