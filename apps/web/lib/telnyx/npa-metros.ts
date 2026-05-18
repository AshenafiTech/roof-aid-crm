// US area-code (NPA) → metro lookup, plus a curated list of popular
// metros for the picker UI.
//
// Source: NANPA assignments. Coverage is the ~80 highest-population NPAs
// across the US — enough for the picker hint + sibling-suggestion UX.
// Not authoritative: the Telnyx inventory is the source of truth for
// what's actually buyable. This table just makes the UI friendlier.

export interface MetroEntry {
  /** Human-readable label like "New York City". */
  label: string;
  /** Two-letter US state code. */
  state: string;
  /** All NPAs that overlay or split this metro, in display order. */
  npas: string[];
}

/**
 * Popular metros surfaced as one-click chips on the picker. Order roughly
 * follows population + roofing-market importance (Sun Belt cities skew
 * higher than their headcount because of weather damage).
 */
export const POPULAR_METROS: MetroEntry[] = [
  { label: "NW Arkansas", state: "AR", npas: ["479"] },
  { label: "Austin", state: "TX", npas: ["512", "737"] },
  { label: "Dallas–Fort Worth", state: "TX", npas: ["214", "469", "972", "817", "682"] },
  { label: "Houston", state: "TX", npas: ["713", "281", "832", "346"] },
  { label: "Atlanta", state: "GA", npas: ["404", "470", "678", "770"] },
  { label: "Charlotte", state: "NC", npas: ["704", "980"] },
  { label: "Tampa", state: "FL", npas: ["813", "727"] },
  { label: "Orlando", state: "FL", npas: ["407", "321", "689"] },
  { label: "Miami", state: "FL", npas: ["305", "786"] },
  { label: "Denver", state: "CO", npas: ["303", "720"] },
  { label: "Phoenix", state: "AZ", npas: ["602", "480", "623"] },
  { label: "Nashville", state: "TN", npas: ["615", "629"] },
  { label: "Kansas City", state: "MO", npas: ["816", "913"] },
  { label: "St. Louis", state: "MO", npas: ["314", "636"] },
  { label: "Oklahoma City", state: "OK", npas: ["405", "572"] },
  { label: "Tulsa", state: "OK", npas: ["918", "539"] },
];

/**
 * Reverse-index used by `metroForNpa` and `siblingsForNpa`.
 */
const METROS_BY_NPA: Record<string, MetroEntry> = (() => {
  const out: Record<string, MetroEntry> = {};
  for (const m of POPULAR_METROS) {
    for (const npa of m.npas) out[npa] = m;
  }
  // A handful of additional metros we don't surface as chips but want
  // to be able to label and suggest siblings for.
  const extras: MetroEntry[] = [
    { label: "New York City", state: "NY", npas: ["212", "646", "917", "332"] },
    { label: "Los Angeles", state: "CA", npas: ["213", "323", "310", "424", "747", "818"] },
    { label: "Chicago", state: "IL", npas: ["312", "773", "872"] },
    { label: "San Francisco", state: "CA", npas: ["415", "628"] },
    { label: "Seattle", state: "WA", npas: ["206", "425"] },
    { label: "Boston", state: "MA", npas: ["617", "857"] },
    { label: "Las Vegas", state: "NV", npas: ["702", "725"] },
    { label: "Honolulu", state: "HI", npas: ["808"] },
    { label: "Anchorage", state: "AK", npas: ["907"] },
    { label: "Minneapolis", state: "MN", npas: ["612", "763", "952"] },
    { label: "Indianapolis", state: "IN", npas: ["317", "463"] },
    { label: "Cincinnati", state: "OH", npas: ["513"] },
    { label: "Cleveland", state: "OH", npas: ["216", "440"] },
    { label: "Columbus", state: "OH", npas: ["614", "380"] },
    { label: "Pittsburgh", state: "PA", npas: ["412", "878"] },
    { label: "Philadelphia", state: "PA", npas: ["215", "267", "445"] },
    { label: "Detroit", state: "MI", npas: ["313", "248"] },
    { label: "Salt Lake City", state: "UT", npas: ["801", "385"] },
    { label: "Memphis", state: "TN", npas: ["901"] },
    { label: "New Orleans", state: "LA", npas: ["504"] },
    { label: "Birmingham", state: "AL", npas: ["205", "659"] },
    { label: "Little Rock", state: "AR", npas: ["501", "327"] },
    { label: "Toll-free", state: "US", npas: ["800", "833", "844", "855", "866", "877", "888"] },
  ];
  for (const m of extras) {
    for (const npa of m.npas) {
      if (!out[npa]) out[npa] = m;
    }
  }
  return out;
})();

/**
 * Returns the metro for a given NPA, or null if we don't know one.
 * The picker uses this to render an inline "479 — NW Arkansas" hint.
 */
export function metroForNpa(npa: string): MetroEntry | null {
  return METROS_BY_NPA[npa] ?? null;
}

/**
 * For a given NPA that returned no available numbers, returns the
 * sibling NPAs that overlay the same metro — the most useful "try
 * one of these instead" suggestions.
 */
export function siblingsForNpa(npa: string): string[] {
  const m = METROS_BY_NPA[npa];
  if (!m) return [];
  return m.npas.filter((n) => n !== npa);
}
