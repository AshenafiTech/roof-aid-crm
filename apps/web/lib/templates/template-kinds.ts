// Single source of truth for the four customizable template kinds.

export const TEMPLATE_KINDS = [
  "3rd_party_auth",
  "acv_contract",
  "rcv_contract",
  "supplement",
] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_TITLES: Record<TemplateKind, string> = {
  "3rd_party_auth": "3rd Party Authorization",
  acv_contract:     "ACV Contract",
  rcv_contract:     "RCV Contract",
  supplement:       "Supplement Document",
};

export const TEMPLATE_DESCRIPTIONS: Record<TemplateKind, string> = {
  "3rd_party_auth": "Lets the roofer talk to the homeowner's insurer.",
  acv_contract:     "Actual Cash Value scope-of-work contract.",
  rcv_contract:     "Replacement Cost Value scope-of-work contract.",
  supplement:       "Formal supplement claim attached to a contract.",
};
