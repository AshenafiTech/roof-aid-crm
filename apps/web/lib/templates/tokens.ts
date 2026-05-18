// Per-kind variable catalog. Owners insert `{{token}}` placeholders in
// template bodies; the renderer (Edge Function) substitutes them with
// values resolved from the prospect + the telefonista-provided fields.
//
// `source`:
//   "prospect" — read from the prospects row at render time
//   "field"    — supplied by telefonista via NewDocumentDialog
//   "computed" — derived (e.g. today)

import type { TemplateKind } from "@/lib/templates/template-kinds";

export type TokenSource = "prospect" | "field" | "computed";

export interface TokenDef {
  token: string;        // {{insurance_company}}
  label: string;        // "Insurance carrier"
  source: TokenSource;
  type: "text" | "date" | "currency" | "number";
  help?: string;
}

const COMMON_TOKENS: TokenDef[] = [
  { token: "homeowner_name",  label: "Homeowner name",  source: "prospect", type: "text" },
  { token: "property_address", label: "Property address", source: "prospect", type: "text" },
  { token: "contractor_name", label: "Contractor / tenant name", source: "computed", type: "text" },
  { token: "today",           label: "Today's date",    source: "computed", type: "date" },
];

const CLAIM_TOKENS: TokenDef[] = [
  { token: "insurance_company", label: "Insurance carrier", source: "field", type: "text" },
  { token: "claim_number",      label: "Claim number",      source: "field", type: "text" },
  { token: "loss_date",         label: "Date of loss",      source: "field", type: "date" },
];

const CONTRACT_TOKENS: TokenDef[] = [
  { token: "deductible",     label: "Deductible",     source: "field", type: "currency" },
  { token: "total_job_cost", label: "Total job cost", source: "field", type: "currency" },
  { token: "scope_of_work",  label: "Scope of work",  source: "field", type: "text" },
];

export const TOKENS_BY_KIND: Record<TemplateKind, TokenDef[]> = {
  "3rd_party_auth": [...COMMON_TOKENS, ...CLAIM_TOKENS],
  acv_contract:    [...COMMON_TOKENS, ...CLAIM_TOKENS, ...CONTRACT_TOKENS],
  rcv_contract:    [...COMMON_TOKENS, ...CLAIM_TOKENS, ...CONTRACT_TOKENS],
  supplement: [
    ...COMMON_TOKENS,
    ...CLAIM_TOKENS,
    { token: "supplement_amount", label: "Supplement amount", source: "field", type: "currency" },
  ],
};

export function tokensFor(kind: TemplateKind): TokenDef[] {
  return TOKENS_BY_KIND[kind] ?? [];
}
