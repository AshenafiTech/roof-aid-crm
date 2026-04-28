import {
  isProspectStatus,
  type ProspectStatus,
} from "@/lib/constants/prospect-status";

import type { ProspectFilters } from "./prospects";

// Every search-param the prospect list pages may write to the URL.
// Keep this in sync with the inputs in `prospect-list-view.tsx`.
export type ProspectListSearchParams = {
  city?: string;
  state?: string;
  status?: string;
  q?: string;
  street?: string;
  lat?: string;
  lng?: string;
  radiusKm?: string;
  load?: string;
  priceMin?: string;
  priceMax?: string;
};

export const PROSPECT_LIST_PAGE_SIZE = 60;

function num(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Single source of truth for "raw URL params → ProspectFilters". Every
// list page (prospects, new-leads, all-leads, contacted, follow-up,
// closed-customers, not-viable) calls this so the same query parameters
// always have the same effect on the server-side query.
export function parseProspectListFilters(
  params: ProspectListSearchParams,
  opts: {
    /** Force the status (e.g. status pages). When omitted, the URL `status` param applies. */
    status?: ProspectStatus;
    /** When true, ignore the URL `status` param entirely (used by single-status pages). */
    ignoreUrlStatus?: boolean;
    /** When set, scope to prospects assigned to this user (rufero scoping). */
    assignedTo?: string;
    /** Override the default ordering (default: "created_desc"). */
    sort?: "created_desc" | "updated_desc";
  } = {},
): ProspectFilters {
  const loadCount = num(params.load);
  const effectiveSize =
    loadCount != null && loadCount > PROSPECT_LIST_PAGE_SIZE
      ? loadCount
      : PROSPECT_LIST_PAGE_SIZE;

  const urlStatus =
    !opts.ignoreUrlStatus && params.status && isProspectStatus(params.status)
      ? params.status
      : undefined;

  return {
    city: params.city?.trim() || undefined,
    state: params.state?.trim() || undefined,
    status: opts.status ?? urlStatus,
    search: params.q?.trim() || undefined,
    street: params.street?.trim() || undefined,
    lat: num(params.lat),
    lng: num(params.lng),
    radiusKm: num(params.radiusKm),
    priceMin: num(params.priceMin),
    priceMax: num(params.priceMax),
    offset: 0,
    pageSize: effectiveSize,
    assignedTo: opts.assignedTo,
    sort: opts.sort,
  };
}
