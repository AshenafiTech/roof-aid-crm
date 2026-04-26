"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarPlus,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  Flag,
  Home,
  LayoutList,
  Loader2,
  Mail,
  Map,
  MapPin,
  MessageSquare,
  Mic,
  Navigation,
  Pencil,
  Phone,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  Search,
  Send,
  Square,
  StickyNote,
  Tag,
  Trash2,
  Upload,
  User,
  UserCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FollowUpNoteDialog } from "@/components/shared/follow-up-note-dialog";
import { ScheduleAppointmentDialog } from "@/components/shared/schedule-appointment-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_ACCENTS,
  isProspectStatus,
  type ProspectStatus,
} from "@/lib/constants/prospect-status";
import { cn } from "@/lib/utils";
import type { ProspectListItem } from "@/lib/queries/prospects";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProspectMap, parseCoordinates, type ProximitySearch } from "./prospect-map";
import {
  assignProspect,
  bulkAssign,
  bulkChangeStatus,
  bulkDelete,
  bulkToggleDnc,
  changeStatus,
  toggleDoNotCall,
  listRuferos,
} from "@/app/(dashboard)/prospects/[id]/actions";
import {
  rememberLastViewedProspect,
  useRestoreLastViewedProspect,
} from "@/lib/hooks/use-last-viewed-prospect";

const ALL = "__all__";

function formatCurrency(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatAssigned(assigned: ProspectListItem["assigned_user"]): string {
  if (!assigned) return "Unassigned";
  const name = [assigned.first_name, assigned.last_name].filter(Boolean).join(" ").trim();
  return name || "Unassigned";
}

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
}

const PRICE_RANGES = [
  { label: "All prices", min: "", max: "" },
  { label: "Under $100K", min: "", max: "100000" },
  { label: "$100K – $200K", min: "100000", max: "200000" },
  { label: "$200K – $300K", min: "200000", max: "300000" },
  { label: "$300K – $500K", min: "300000", max: "500000" },
  { label: "$500K – $750K", min: "500000", max: "750000" },
  { label: "$750K – $1M", min: "750000", max: "1000000" },
  { label: "Over $1M", min: "1000000", max: "" },
  { label: "Custom", min: "__custom__", max: "__custom__" },
] as const;

function matchPriceRange(min: string, max: string): string {
  if (!min && !max) return "All prices";
  const match = PRICE_RANGES.find(
    (r) => r.min !== "__custom__" && r.min === min && r.max === max,
  );
  return match?.label ?? "Custom";
}

const VIEW_MODE_KEY = "roofaid-view-mode";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function ProspectListView({
  rows,
  total,
  cities,
  states,
  pageSize,
  basePath,
  statusFilter,
  showStatusFilter = true,
}: {
  rows: ProspectListItem[];
  total: number;
  cities: string[];
  states: string[];
  pageSize: number;
  basePath: string;
  statusFilter?: ProspectStatus;
  showStatusFilter?: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [viewMode, setViewMode] = useState<"map" | "list">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      if (saved === "map" || saved === "list") return saved;
    }
    return "map";
  });
  const [proximity, setProximity] = useState<ProximitySearch | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlayHidden, setOverlayHidden] = useState(false);
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [showCoordSearch, setShowCoordSearch] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();

  const persistViewMode = useCallback((mode: "map" | "list") => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

  // Staged (draft) filter state — only committed to the URL when the user clicks "Query Database".
  const spString = sp.toString();
  const [draft, setDraft] = useState<URLSearchParams>(() => new URLSearchParams(spString));
  useEffect(() => {
    setDraft(new URLSearchParams(spString));
  }, [spString]);

  function setDraftParam(key: string, value: string | undefined) {
    setDraft((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  const _proximityRows = proximity
    ? rows.filter((r) => {
        const c = parseCoordinates(r.coordinates);
        if (!c) return false;
        return haversineKm(proximity.lat, proximity.lng, c.lat, c.lng) <= proximity.radiusKm;
      })
    : rows;

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(displayRows.map((r) => r.id)));
    }
  }

  function clearChecked() {
    setCheckedIds(new Set());
  }

  const city = draft.get("city") ?? "";
  const stateParam = draft.get("state") ?? "";
  const status = draft.get("status") ?? "";
  const q = draft.get("q") ?? "";
  const street = draft.get("street") ?? "";
  const coordLat = draft.get("lat") ?? "";
  const coordLng = draft.get("lng") ?? "";
  const coordRadius = draft.get("radiusKm") ?? "";
  const priceMin = draft.get("priceMin") ?? "";
  const priceMax = draft.get("priceMax") ?? "";
  const hasFilters = !!(city || stateParam || status || q || street || coordLat || priceMin || priceMax);

  const coordFilterLat = coordLat ? Number(coordLat) : null;
  const coordFilterLng = coordLng ? Number(coordLng) : null;
  const coordFilterRadius = coordRadius ? Number(coordRadius) : 5;

  const displayRows = (() => {
    let filtered = _proximityRows;
    if (coordFilterLat != null && coordFilterLng != null && Number.isFinite(coordFilterLat) && Number.isFinite(coordFilterLng)) {
      filtered = filtered.filter((r) => {
        const c = parseCoordinates(r.coordinates);
        if (!c) return false;
        return haversineKm(coordFilterLat, coordFilterLng, c.lat, c.lng) <= coordFilterRadius;
      });
    }
    return filtered;
  })();

  const allChecked = displayRows.length > 0 && displayRows.every((r) => checkedIds.has(r.id));
  const someChecked = checkedIds.size > 0;

  useRestoreLastViewedProspect([displayRows.length, viewMode]);

  // Normalize (drop "load" pagination param) for dirty comparison against the applied URL.
  const normalizedDraft = (() => {
    const n = new URLSearchParams(draft);
    n.delete("load");
    return n.toString();
  })();
  const normalizedApplied = (() => {
    const n = new URLSearchParams(sp);
    n.delete("load");
    return n.toString();
  })();
  const draftDirty = normalizedDraft !== normalizedApplied;

  function applyDraft() {
    const next = new URLSearchParams(draft);
    next.delete("load");
    const qs = next.toString();
    const currentQs = normalizedApplied;
    if (qs === currentQs) {
      start(() => router.refresh());
    } else {
      start(() => router.push(qs ? `${basePath}?${qs}` : basePath));
    }
  }

  const showing = displayRows.length;
  const hasMore = showing < total;

  function push(next: URLSearchParams) {
    next.delete("load");
    const qs = next.toString();
    start(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  function setParam(key: string, value: string | undefined) {
    setDraftParam(key, value);
  }

  function loadMore() {
    const params = new URLSearchParams(sp);
    params.set("load", String(showing + pageSize));
    const qs = params.toString();
    start(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  }

  function toggleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
    setOverlayHidden(false);
  }

  return (
    <div className="-mx-4 -mt-6 -mb-6 sm:-mx-6 flex flex-col" style={{ height: "calc(100vh - 3.5rem)" }}>
      {/* Filter bar */}
      <div className="border-b bg-background px-4 py-3 sm:px-6 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">City</span>
            <Select value={city || ALL} onValueChange={(v) => setParam("city", v === ALL ? undefined : v)}>
              <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue placeholder="All cities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All cities</SelectItem>
                {cities.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">State</span>
            <Select value={stateParam || ALL} onValueChange={(v) => setParam("state", v === ALL ? undefined : v)}>
              <SelectTrigger className="h-8 w-[120px] text-sm"><SelectValue placeholder="All states" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All states</SelectItem>
                {states.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {showStatusFilter && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
              <Select value={status || ALL} onValueChange={(v) => setParam("status", v === ALL ? undefined : v)}>
                <SelectTrigger className="h-8 w-[150px] text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {PROSPECT_STATUSES.map((s: ProspectStatus) => (
                    <SelectItem key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Price</span>
            <Select
              value={matchPriceRange(priceMin, priceMax)}
              onValueChange={(label) => {
                const range = PRICE_RANGES.find((r) => r.label === label);
                if (!range) return;
                if (range.min === "__custom__") {
                  setShowPriceFilter(true);
                  return;
                }
                setShowPriceFilter(false);
                setDraftParam("priceMin", range.min || undefined);
                setDraftParam("priceMax", range.max || undefined);
              }}
            >
              <SelectTrigger className="h-8 w-[160px] text-sm">
                <DollarSign className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="All prices" />
              </SelectTrigger>
              <SelectContent>
                {PRICE_RANGES.map((r) => (
                  <SelectItem key={r.label} value={r.label}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="h-5 w-px bg-border hidden sm:block" />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyDraft();
            }}
            className="flex items-center gap-2 flex-1 min-w-[180px]"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                value={q}
                onChange={(e) => setDraftParam("q", e.target.value || undefined)}
                placeholder="Search name or address..."
                className="h-8 text-sm pl-8"
              />
            </div>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              applyDraft();
            }}
            className="flex items-center gap-2 min-w-[140px]"
          >
            <div className="relative flex-1">
              <MapPin className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="street"
                value={street}
                onChange={(e) => setDraftParam("street", e.target.value || undefined)}
                placeholder="Street address..."
                className="h-8 text-sm pl-8"
              />
            </div>
          </form>

          <Button
            variant={showCoordSearch ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowCoordSearch((v) => !v)}
          >
            <Navigation className="h-3.5 w-3.5" /> Coords
          </Button>

          <div className="flex items-center gap-2 ml-auto">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setShowPriceFilter(false); setDraft(new URLSearchParams()); }} disabled={pending}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
            <div className="hidden sm:flex rounded-md border">
              <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className="h-8 rounded-r-none px-3" onClick={() => persistViewMode("list")}>
                <LayoutList className="mr-1 h-3.5 w-3.5" /> List
              </Button>
              <Button variant={viewMode === "map" ? "default" : "ghost"} size="sm" className="h-8 rounded-l-none px-3" onClick={() => persistViewMode("map")}>
                <Map className="mr-1 h-3.5 w-3.5" /> Map
              </Button>
            </div>
            {basePath === "/new-leads" && (
              <Button asChild variant="outline" size="sm" className="h-8">
                <Link href="/new-leads/import">
                  <Upload className="mr-1 h-3.5 w-3.5" /> Import
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              onClick={applyDraft}
              disabled={pending}
              className={cn(draftDirty && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
            >
              {pending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Query Database
              {draftDirty && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-yellow-300" aria-hidden />}
            </Button>
          </div>
        </div>

        {/* Coordinate search */}
        {(showCoordSearch || coordLat || coordLng) && (
          <div className="flex items-center gap-3 pt-1">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Coordinates</span>
            <Input
              type="number"
              step="any"
              placeholder="Latitude"
              value={coordLat}
              onChange={(e) => setDraftParam("lat", e.target.value || undefined)}
              className="h-7 w-[120px] text-xs"
            />
            <Input
              type="number"
              step="any"
              placeholder="Longitude"
              value={coordLng}
              onChange={(e) => setDraftParam("lng", e.target.value || undefined)}
              className="h-7 w-[120px] text-xs"
            />
            <Input
              type="number"
              step="any"
              placeholder="Radius (km)"
              value={coordRadius}
              onChange={(e) => setDraftParam("radiusKm", e.target.value || undefined)}
              className="h-7 w-[100px] text-xs"
            />
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => {
              setShowCoordSearch(false);
              setDraftParam("lat", undefined);
              setDraftParam("lng", undefined);
              setDraftParam("radiusKm", undefined);
            }}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        )}

        {/* Custom price range inputs */}
        {showPriceFilter && (
          <form
            className="flex items-center gap-3 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const min = (fd.get("priceMin") as string)?.trim();
              const max = (fd.get("priceMax") as string)?.trim();
              setDraftParam("priceMin", min || undefined);
              setDraftParam("priceMax", max || undefined);
            }}
          >
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Custom Range</span>
            <Input
              name="priceMin"
              type="number"
              placeholder="Min ($)"
              defaultValue={priceMin}
              className="h-7 w-[110px] text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              name="priceMax"
              type="number"
              placeholder="Max ($)"
              defaultValue={priceMax}
              className="h-7 w-[110px] text-xs"
            />
            <Button type="submit" variant="secondary" size="sm" className="h-7 text-xs px-3">
              Apply
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => {
              setShowPriceFilter(false);
              setDraftParam("priceMin", undefined);
              setDraftParam("priceMax", undefined);
            }}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </form>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — prospect list */}
        <div className={cn(
          "flex flex-col overflow-hidden",
          viewMode === "map" ? "w-full sm:w-[380px] lg:w-[420px] shrink-0 border-r" : "flex-1",
        )}>
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
            {someChecked ? (
              <div className="flex items-center gap-3 flex-1">
                <p className="text-xs font-medium text-primary">
                  {checkedIds.size} selected
                </p>
                <BulkActionsMenu
                  ids={Array.from(checkedIds)}
                  disabled={bulkPending}
                  onAction={(action) => {
                    startBulk(async () => {
                      try {
                        await action();
                        clearChecked();
                        router.refresh();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Bulk action failed");
                      }
                    });
                  }}
                />
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={clearChecked}>
                  Deselect all
                </Button>
                {bulkPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                {proximity ? (
                  <>
                    <span>
                      {showing} within {proximity.radiusKm.toFixed(1)} km of pinned point
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[11px] px-1.5"
                      onClick={() => setProximity(null)}
                    >
                      <X className="h-3 w-3 mr-0.5" /> Clear radius
                    </Button>
                  </>
                ) : (
                  <>
                    {showing} of {total} {statusFilter ? PROSPECT_STATUS_LABELS[statusFilter].toLowerCase() : "records"}
                  </>
                )}
              </p>
            )}
            {selectedId && !someChecked && (
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { setSelectedId(null); setOverlayHidden(false); }}>
                Clear selection
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {displayRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Search className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-base font-semibold">No Results</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-[240px]">
                  Select a city or status above, or search by name, address, or phone.
                </p>
              </div>
            ) : viewMode === "map" ? (
              <div className="divide-y">
                {displayRows.map((row) => (
                  <MapCardItem
                    key={row.id}
                    prospect={row}
                    isSelected={selectedId === row.id}
                    onSelect={() => toggleSelect(row.id)}
                  />
                ))}
                {hasMore && (
                  <div className="flex justify-center py-4">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
                      {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Load {pageSize} More
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {/* Column header */}
                <div className="flex items-center gap-3 px-4 py-1.5 border-b bg-muted sticky top-0 z-10">
                  <button type="button" onClick={toggleAll} className="shrink-0 flex items-center justify-center w-4 h-4 text-muted-foreground hover:text-primary transition-colors">
                    {allChecked ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                  </button>
                  <div className="w-3.5 shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[150px] shrink-0">Name</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[120px] shrink-0 hidden lg:block">Phone</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[160px] shrink-0 hidden xl:block">Email</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex-1 min-w-[120px] shrink-0 hidden md:block">Address</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[90px] shrink-0">Status</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[100px] shrink-0 hidden lg:block">Assigned</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[70px] shrink-0 hidden xl:block">Source</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[40px] shrink-0 text-right hidden sm:block">Hail</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[80px] shrink-0 text-right hidden sm:block">Value</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[42px] shrink-0" />
                  {basePath === "/prospects" && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-[260px] shrink-0 text-center hidden sm:block">Actions</span>
                  )}
                </div>
                <div className="divide-y">
                  {displayRows.map((row) => (
                    <ListRowItem
                      key={row.id}
                      prospect={row}
                      isExpanded={selectedId === row.id}
                      onToggle={() => toggleSelect(row.id)}
                      showRowActions={basePath === "/prospects"}
                      isChecked={checkedIds.has(row.id)}
                      onCheck={() => toggleChecked(row.id)}
                    />
                  ))}
                  {hasMore && (
                    <div className="flex justify-center py-4">
                      <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
                        {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        Load {pageSize} More
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — map view: map + detail overlay */}
        {viewMode === "map" && (
          <div className="hidden sm:flex flex-1 flex-col relative">
            <ProspectMap
              prospects={displayRows}
              focused={selected}
              onSelect={(id) => {
                setSelectedId(id);
                setOverlayHidden(false);
              }}
              proximity={proximity}
              onProximityChange={setProximity}
              tabLabel={basePath === "/new-leads" ? "leads" : "prospects"}
              className="absolute inset-0"
            />
            {!proximity && (
              <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-md bg-background/90 backdrop-blur-sm px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm border">
                Right-click the map to search by radius
              </div>
            )}

            {selected && !overlayHidden && (
              <div className="absolute bottom-0 inset-x-0 bg-background/95 backdrop-blur-sm border-t shadow-2xl max-h-[50%] overflow-y-auto">
                <ProspectDetailPanel prospect={selected} onClose={() => setOverlayHidden(true)} compact />
              </div>
            )}
            {selected && overlayHidden && (
              <Button
                size="sm"
                variant="secondary"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-lg"
                onClick={() => setOverlayHidden(false)}
              >
                Show details
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Bulk actions dropdown ── */
function BulkActionsMenu({
  ids,
  disabled,
  onAction,
}: {
  ids: string[];
  disabled: boolean;
  onAction: (action: () => Promise<unknown>) => void;
}) {
  const [ruferos, setRuferos] = useState<{ id: string; first_name: string | null; last_name: string | null }[]>([]);
  const [ruferosFetched, setRuferosFetched] = useState(false);

  function fetchRuferos() {
    if (ruferosFetched) return;
    listRuferos().then((r) => { setRuferos(r); setRuferosFetched(true); });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={disabled}>
          Bulk Actions <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onPointerEnter={fetchRuferos}>
            <UserCheck className="mr-2 h-3.5 w-3.5" /> Assign Rufero
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => onAction(() => bulkAssign({ ids, assignedTo: null }))}>
              <X className="mr-2 h-3.5 w-3.5" /> Unassign
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {ruferos.map((r) => (
              <DropdownMenuItem key={r.id} onClick={() => onAction(() => bulkAssign({ ids, assignedTo: r.id }))}>
                <User className="mr-2 h-3.5 w-3.5" />
                {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
              </DropdownMenuItem>
            ))}
            {ruferosFetched && ruferos.length === 0 && (
              <DropdownMenuItem disabled>No ruferos found</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Tag className="mr-2 h-3.5 w-3.5" /> Change Status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {PROSPECT_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onClick={() => onAction(() => bulkChangeStatus({ ids, status: s }))}>
                <StatusBadge status={s} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onAction(() => bulkToggleDnc({ ids, doNotCall: true }))}>
          <PhoneOff className="mr-2 h-3.5 w-3.5" /> Mark Do Not Call
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(() => bulkToggleDnc({ ids, doNotCall: false }))}>
          <Phone className="mr-2 h-3.5 w-3.5" /> Remove DNC Flag
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => {
            if (!confirm(`Delete ${ids.length} prospect(s)? This cannot be undone.`)) return;
            onAction(() => bulkDelete({ ids }));
          }}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete ({ids.length})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Inline action buttons for prospect rows (prospects section only) ── */
function InlineRowActions({ prospect }: { prospect: ProspectListItem }) {
  const [callOpen, setCallOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [dncPending, startDnc] = useTransition();
  const router = useRouter();
  const coords = parseCoordinates(prospect.coordinates);

  return (
    <>
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="default"
                onClick={() => setCallOpen(true)}
                className="h-7 w-7"
              >
                <Phone className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{prospect.do_not_call ? "DNC Flagged — Call" : "Call"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setSmsOpen(true)}
                className="h-7 w-7"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{prospect.do_not_call ? "DNC Flagged — SMS" : "SMS"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setEmailOpen(true)}
                className="h-7 w-7"
              >
                <Mail className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Email</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setScheduleOpen(true)}
                className="h-7 w-7"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Schedule</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setAssignOpen(true)}
                className="h-7 w-7"
              >
                <UserCheck className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Assign</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  if (coords) window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`, "_blank");
                  else toast("No coordinates available");
                }}
                className="h-7 w-7"
              >
                <Navigation className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Navigate</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setFlagOpen(true)}
                className="h-7 w-7"
              >
                <Flag className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Flag</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={prospect.do_not_call ? "destructive" : "outline"}
                disabled={dncPending}
                onClick={() => {
                  startDnc(async () => {
                    try {
                      await toggleDoNotCall({ id: prospect.id, doNotCall: !prospect.do_not_call });
                      toast.success(prospect.do_not_call ? "DNC flag removed" : "Marked as Do Not Call");
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to toggle DNC");
                    }
                  });
                }}
                className="h-7 w-7"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{prospect.do_not_call ? "Remove DNC Flag" : "Mark DNC"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <CallDialog open={callOpen} onOpenChange={setCallOpen} prospect={prospect} />
      <SmsDialog open={smsOpen} onOpenChange={setSmsOpen} prospect={prospect} />
      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} prospect={prospect} />
      <ScheduleAppointmentDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        prospectId={prospect.id}
        prospectName={prospect.name}
        prospectLocation={[prospect.address, prospect.city, prospect.state]
          .filter(Boolean)
          .join(", ")}
        defaultRuferoId={prospect.assigned_to ?? null}
      />
      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} prospect={prospect} />
      <FlagDialog open={flagOpen} onOpenChange={setFlagOpen} prospect={prospect} />
    </>
  );
}

/* ���─ Map view: compact card in left panel ── */
function MapCardItem({
  prospect,
  isSelected,
  onSelect,
}: {
  prospect: ProspectListItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const status = isProspectStatus(prospect.status) ? prospect.status : null;
  const accent = status ? PROSPECT_STATUS_ACCENTS[status] : "border-l-transparent";
  const location = [prospect.city, prospect.state].filter(Boolean).join(", ");
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isSelected) {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  return (
    <button
      ref={ref}
      type="button"
      data-prospect-id={prospect.id}
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "relative w-full text-left border-l-4 px-3 py-2 transition-all",
        isSelected
          ? "border-l-primary bg-primary/10 shadow-[inset_0_0_0_1px_var(--primary)] z-10"
          : cn(accent, "hover:bg-muted/40"),
      )}
    >
      {isSelected && (
        <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <MapPin className="h-3 w-3" />
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn("truncate text-sm", isSelected ? "font-semibold text-primary" : "font-medium")}>
              {prospect.name}
            </p>
            {prospect.do_not_call && (
              <span className="shrink-0 flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                <PhoneOff className="h-2.5 w-2.5" /> DNC
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-x-3 text-xs text-muted-foreground">
            {location && <span className="truncate">{location}</span>}
            {prospect.phones?.[0] && <span className="shrink-0">{prospect.phones[0]}</span>}
          </div>
        </div>
        <div className={cn("flex flex-col items-end gap-1 shrink-0", isSelected && "pr-6")}>
          <StatusBadge status={prospect.status} className="text-[10px] px-1.5 py-0" />
          {prospect.home_value ? (
            <span className="text-[10px] text-muted-foreground font-medium">{formatCurrency(prospect.home_value)}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/* ── List view: expandable row ── */
function ListRowItem({
  prospect,
  isExpanded,
  onToggle,
  showRowActions,
  isChecked,
  onCheck,
}: {
  prospect: ProspectListItem;
  isExpanded: boolean;
  onToggle: () => void;
  showRowActions?: boolean;
  isChecked?: boolean;
  onCheck?: () => void;
}) {
  const status = isProspectStatus(prospect.status) ? prospect.status : null;
  const accent = status ? PROSPECT_STATUS_ACCENTS[status] : "border-l-transparent";
  const location = [prospect.city, prospect.state].filter(Boolean).join(", ");

  const phone = prospect.phones?.[0] ?? "";

  return (
    <div data-prospect-id={prospect.id} className={cn("border-l-4 transition-colors", accent, isExpanded && "bg-accent/20", isChecked && "bg-primary/5")}>
      <div
        className={cn(
          "w-full text-left px-4 py-2 transition-colors flex items-center gap-3",
          !isExpanded && !isChecked && "hover:bg-muted/40",
        )}
      >
        <button type="button" onClick={onCheck} className="shrink-0 flex items-center justify-center w-4 h-4 text-muted-foreground hover:text-primary transition-colors">
          {isChecked ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onToggle} className="shrink-0">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>

        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-3 min-w-0 text-left">
          <div className="w-[150px] shrink-0 min-w-0">
            <p className="truncate text-sm font-medium">{prospect.name}</p>
            {prospect.do_not_call && (
              <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1 py-0 text-[10px] font-medium text-destructive mt-0.5">
                <PhoneOff className="h-2.5 w-2.5" /> DNC
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate w-[120px] shrink-0 hidden lg:block">{phone || "—"}</span>
          <span className="text-xs text-muted-foreground truncate w-[160px] shrink-0 hidden xl:block">{prospect.email || "—"}</span>
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-[120px] shrink-0 hidden md:block">
            {prospect.address ?? "—"}, {location}
          </span>
          <span className="w-[90px] shrink-0"><StatusBadge status={prospect.status} /></span>
          <span className="text-xs text-muted-foreground truncate w-[100px] shrink-0 hidden lg:block">
            {formatAssigned(prospect.assigned_user)}
          </span>
          <span className="text-xs text-muted-foreground truncate w-[70px] shrink-0 hidden xl:block">
            {prospect.source ?? "—"}
          </span>
          <span className="text-xs text-muted-foreground w-[40px] shrink-0 text-right hidden sm:block">
            {prospect.hail_size != null ? `${prospect.hail_size}"` : "—"}
          </span>
          <span className="text-xs font-medium w-[80px] shrink-0 text-right hidden sm:block">{formatCurrency(prospect.home_value)}</span>
        </button>

        <span className="w-[42px] shrink-0" />

        {showRowActions && (
          <div className="w-[260px] shrink-0 hidden sm:flex justify-center">
            <InlineRowActions prospect={prospect} />
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="border-t bg-muted/10">
          <ProspectDetailPanel prospect={prospect} />
        </div>
      )}
    </div>
  );
}

/* ── Detail field component ── */
function DetailField({ icon: Icon, label, value, copyable }: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  copyable?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-sm truncate">{value || "—"}</p>
          {copyable && (
            <button type="button" onClick={() => copyToClipboard(copyable)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shared detail panel used in both views ── */
function ProspectDetailPanel({
  prospect,
  onClose,
  compact,
}: {
  prospect: ProspectListItem;
  onClose?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [statusPending, startStatus] = useTransition();
  const [dncPending, startDnc] = useTransition();
  const [callOpen, setCallOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const coords = parseCoordinates(prospect.coordinates);
  const location = [prospect.address, prospect.city, prospect.state, prospect.zip].filter(Boolean).join(", ");
  const assignedName = formatAssigned(prospect.assigned_user);

  function applyStatus(newStatus: ProspectStatus, followUpNote?: string) {
    startStatus(async () => {
      try {
        await changeStatus({ id: prospect.id, status: newStatus, followUpNote });
        toast.success(`Status changed to ${PROSPECT_STATUS_LABELS[newStatus]}`);
        setFollowUpOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to change status");
      }
    });
  }

  function onStatusChange(newStatus: string) {
    if (!isProspectStatus(newStatus)) return;
    if (newStatus === "follow_up") {
      setFollowUpOpen(true);
      return;
    }
    applyStatus(newStatus);
  }

  return (
    <div className={cn("p-4 space-y-4", compact && "p-3 space-y-3")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={cn("font-bold truncate", compact ? "text-base" : "text-lg")}>{prospect.name}</h3>
              <StatusBadge status={prospect.status} />
              {prospect.do_not_call && (
                <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  <PhoneOff className="h-3 w-3" /> Do Not Call
                </span>
              )}
            </div>
            {location && (
              <p className="mt-0.5 text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {location}
              </p>
            )}
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {assignedName}
              </span>
              {prospect.created_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Added {formatDate(prospect.created_at)}
                </span>
              )}
              {prospect.source && (
                <span className="flex items-center gap-1">
                  <CircleDot className="h-3 w-3" /> {prospect.source}
                </span>
              )}
            </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/prospects/${prospect.id}`}
                  onClick={() => rememberLastViewedProspect(prospect.id)}
                >
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>Full Profile</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="default" onClick={() => setCallOpen(true)} className="gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Call
              </Button>
            </TooltipTrigger>
            {prospect.do_not_call && <TooltipContent>DNC Flagged — call with caution</TooltipContent>}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setSmsOpen(true)} className="gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> SMS
              </Button>
            </TooltipTrigger>
            {prospect.do_not_call && <TooltipContent>DNC Flagged — message with caution</TooltipContent>}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)} className="gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send email</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)} className="gap-1.5">
                <CalendarPlus className="h-3.5 w-3.5" /> Schedule
              </Button>
            </TooltipTrigger>
            <TooltipContent>Schedule appointment</TooltipContent>
          </Tooltip>

          <div className="h-5 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/prospects/${prospect.id}`}
                onClick={() => rememberLastViewedProspect(prospect.id)}
              >
                <Button size="sm" variant="ghost" className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>Edit prospect</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setAssignOpen(true)}>
                <UserCheck className="h-3.5 w-3.5" /> Assign
              </Button>
            </TooltipTrigger>
            <TooltipContent>Assign rufero</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => {
                const c = parseCoordinates(prospect.coordinates);
                if (c) window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`, "_blank");
                else toast("No coordinates available for this prospect");
              }}>
                <Navigation className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Navigate to address</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/prospects/${prospect.id}?tab=notes`}
                onClick={() => rememberLastViewedProspect(prospect.id)}
              >
                <Button size="sm" variant="ghost" className="gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>Add note</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={() => setFlagOpen(true)} className="gap-1.5">
                <Flag className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Flag prospect</TooltipContent>
          </Tooltip>

          <div className="h-5 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={prospect.do_not_call ? "destructive" : "outline"}
                disabled={dncPending}
                onClick={() => {
                  startDnc(async () => {
                    try {
                      await toggleDoNotCall({ id: prospect.id, doNotCall: !prospect.do_not_call });
                      toast.success(prospect.do_not_call ? "DNC flag removed" : "Marked as Do Not Call");
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to toggle DNC");
                    }
                  });
                }}
                className="gap-1.5"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                {prospect.do_not_call ? "Remove DNC" : "DNC"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{prospect.do_not_call ? "Remove Do Not Call flag" : "Mark as Do Not Call"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator />

      {/* Detail cards grid */}
      <div className={cn("grid gap-4", compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
        {/* Contact Information */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
              <Phone className="h-3.5 w-3.5 text-primary" />
            </div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</h4>
          </div>
          <div className="space-y-0.5">
            <DetailField
              icon={Phone}
              label="Primary Phone"
              value={prospect.phones?.[0] || "—"}
              copyable={prospect.phones?.[0] || undefined}
            />
            {prospect.phones && prospect.phones.length > 1 && (
              <DetailField
                icon={Phone}
                label="Secondary Phone"
                value={prospect.phones[1]}
                copyable={prospect.phones[1]}
              />
            )}
            <DetailField
              icon={Mail}
              label="Email"
              value={prospect.email || "—"}
              copyable={prospect.email || undefined}
            />
          </div>
        </Card>

        {/* Property Information */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
              <Home className="h-3.5 w-3.5 text-primary" />
            </div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Property</h4>
          </div>
          <div className="space-y-0.5">
            <DetailField icon={MapPin} label="Address" value={prospect.address} copyable={location || undefined} />
            <DetailField label="City / State / ZIP" value={
              [prospect.city, prospect.state, prospect.zip].filter(Boolean).join(", ") || "—"
            } />
            <div className="grid grid-cols-2 gap-x-3">
              <DetailField label="Home Value" value={
                <span className="font-semibold text-foreground">{formatCurrency(prospect.home_value)}</span>
              } />
              <DetailField label="Hail Size" value={
                prospect.hail_size != null ? (
                  <span className="font-semibold text-foreground">{prospect.hail_size}&quot;</span>
                ) : "—"
              } />
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <DetailField label="Type" value={prospect.tipo} />
              <DetailField label="Source" value={prospect.source} />
            </div>
          </div>
        </Card>

        {/* Status & Actions */}
        <Card className={cn("p-4", compact && "sm:col-span-2")}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
              <CircleDot className="h-3.5 w-3.5 text-primary" />
            </div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status & Assignment</h4>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                <Select
                  value={prospect.status ?? undefined}
                  onValueChange={onStatusChange}
                  disabled={statusPending}
                >
                  <SelectTrigger className="h-7 w-[150px] text-xs">
                    {statusPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <SelectValue />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {PROSPECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Assigned To</p>
              <span className="text-sm font-medium">{assignedName}</span>
            </div>

            {prospect.assigned_at && (
              <p className="text-[11px] text-muted-foreground">
                Assigned on {formatDate(prospect.assigned_at)}
              </p>
            )}

            {prospect.tags && prospect.tags.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1.5 flex items-center gap-1"><Tag className="h-3 w-3" /> Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {prospect.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[11px] font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {prospect.do_not_call && prospect.do_not_call_reason && (
              <>
                <Separator />
                <div className="rounded-md bg-destructive/5 border border-destructive/20 p-2.5">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1">
                    <PhoneOff className="h-3 w-3" /> DNC Reason
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{prospect.do_not_call_reason}</p>
                  {prospect.do_not_call_at && (
                    <p className="text-[10px] text-muted-foreground mt-1">Since {formatDate(prospect.do_not_call_at)}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Inline map for list view */}
      {coords && !onClose && (
        <Card className="overflow-hidden">
          <div className="h-72 relative">
            <iframe
              title={`Map for ${prospect.name}`}
              className="h-full w-full"
              src={`https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d5000!2d${coords.lng}!3d${coords.lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus`}
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-md px-2 py-1 text-xs font-medium flex items-center gap-1 shadow-sm">
              <MapPin className="h-3 w-3 text-primary" /> {prospect.city || "Location"}
            </div>
          </div>
        </Card>
      )}

      <CallDialog open={callOpen} onOpenChange={setCallOpen} prospect={prospect} />
      <SmsDialog open={smsOpen} onOpenChange={setSmsOpen} prospect={prospect} />
      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} prospect={prospect} />
      <ScheduleAppointmentDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        prospectId={prospect.id}
        prospectName={prospect.name}
        prospectLocation={[prospect.address, prospect.city, prospect.state]
          .filter(Boolean)
          .join(", ")}
        defaultRuferoId={prospect.assigned_to ?? null}
      />
      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} prospect={prospect} />
      <FlagDialog open={flagOpen} onOpenChange={setFlagOpen} prospect={prospect} />
      <FollowUpNoteDialog
        open={followUpOpen}
        onOpenChange={(o) => {
          if (!statusPending) setFollowUpOpen(o);
        }}
        prospectName={prospect.name}
        pending={statusPending}
        onSave={(note) => applyStatus("follow_up", note)}
      />
    </div>
  );
}

/* ── SMS Dialog ── */
function SmsDialog({
  open,
  onOpenChange,
  prospect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: ProspectListItem;
}) {
  const [message, setMessage] = useState("");
  const phone = prospect.phones?.[0] ?? "";

  function handleSend() {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    toast.success(`SMS queued for ${prospect.name}. Integration with Telnyx coming in M4.`);
    setMessage("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Send SMS
          </DialogTitle>
          <DialogDescription>
            Send a text message to {prospect.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {getInitials(prospect.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{prospect.name}</p>
              <p className="text-xs text-muted-foreground">{phone || "No phone number"}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sms-to">To</Label>
            <Input id="sms-to" value={phone} readOnly className="bg-muted/30" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sms-message">Message</Label>
              <span className="text-[11px] text-muted-foreground">{message.length}/1600</span>
            </div>
            <Textarea
              id="sms-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              maxLength={1600}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={!phone}>
              <Send className="mr-2 h-4 w-4" /> Send SMS
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Email Dialog ── */
function EmailDialog({
  open,
  onOpenChange,
  prospect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: ProspectListItem;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [template, setTemplate] = useState("manual");
  const email = prospect.email ?? "";

  function applyTemplate(value: string) {
    setTemplate(value);
    if (value === "followup") {
      setSubject(`Follow-up: Roof Inspection for ${prospect.name}`);
      setBody(
        `Hi ${prospect.name.split(" ")[0]},\n\nI wanted to follow up regarding the roof inspection we discussed. We identified potential hail damage in your area and would love to schedule a time to take a closer look at your property.\n\nPlease let me know a time that works best for you.\n\nBest regards`
      );
    } else if (value === "intro") {
      setSubject(`Introduction — Roof-Aid Services`);
      setBody(
        `Hi ${prospect.name.split(" ")[0]},\n\nMy name is [Your Name] from Roof-Aid. We've been helping homeowners in ${prospect.city || "your area"} with storm damage assessments and roof repairs.\n\nI'd love to schedule a free inspection at your convenience.\n\nBest regards`
      );
    } else {
      setSubject("");
      setBody("");
    }
  }

  function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Please fill in subject and message");
      return;
    }
    toast.success(`Email queued for ${prospect.name}. Integration with SendGrid coming in M4.`);
    setSubject("");
    setBody("");
    setTemplate("manual");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Send Email
          </DialogTitle>
          <DialogDescription>
            Compose an email to {prospect.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {getInitials(prospect.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{prospect.name}</p>
              <p className="text-xs text-muted-foreground">{email || "No email address"}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={template} onValueChange={applyTemplate}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="followup">Project Follow-up</SelectItem>
                <SelectItem value="intro">Introduction</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dialog-email-to">To</Label>
            <Input id="dialog-email-to" value={email} readOnly className="bg-muted/30" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dialog-email-subject">Subject</Label>
            <Input
              id="dialog-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dialog-email-body">Message</Label>
            <Textarea
              id="dialog-email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message..."
              rows={6}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={!email}>
              <Send className="mr-2 h-4 w-4" /> Send Email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Assign Rufero Dialog ── */
function AssignDialog({
  open,
  onOpenChange,
  prospect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: ProspectListItem;
}) {
  const [ruferos, setRuferos] = useState<{ id: string; first_name: string | null; last_name: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [assignPending, startAssign] = useTransition();
  const UNASSIGNED = "__unassigned__";

  function ruferoName(u: { first_name: string | null; last_name: string | null }) {
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown";
  }

  if (open && !loaded && !loading) {
    setLoading(true);
    listRuferos()
      .then((data) => {
        setRuferos(data);
        setLoaded(true);
      })
      .catch(() => toast.error("Failed to load ruferos"))
      .finally(() => setLoading(false));
  }

  function onAssign(value: string) {
    const assignedTo = value === UNASSIGNED ? null : value;
    startAssign(async () => {
      try {
        await assignProspect({ id: prospect.id, assignedTo });
        const name = assignedTo ? ruferos.find((r) => r.id === assignedTo) : null;
        toast.success(name ? `Assigned to ${ruferoName(name)}` : "Unassigned");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to assign");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Assign Rufero
          </DialogTitle>
          <DialogDescription>
            Assign a rufero to {prospect.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {getInitials(prospect.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{prospect.name}</p>
              <p className="text-xs text-muted-foreground">
                Currently: {formatAssigned(prospect.assigned_user)}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading ruferos...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Select Rufero</Label>
              <Select
                value={prospect.assigned_to ?? UNASSIGNED}
                onValueChange={onAssign}
                disabled={assignPending}
              >
                <SelectTrigger>
                  {assignPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Select a rufero..." />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {ruferos.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {ruferoName(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ruferos.length === 0 && loaded && (
                <p className="text-xs text-muted-foreground">No active ruferos found in your tenant.</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Call Dialog ── */
function CallDialog({
  open,
  onOpenChange,
  prospect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: ProspectListItem;
}) {
  const phone = prospect.phones?.[0] ?? "";
  const phone2 = prospect.phones?.[1] ?? "";
  const [selectedPhone, setSelectedPhone] = useState(phone);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700">
              <PhoneCall className="h-4 w-4" />
            </div>
            Call Prospect
          </DialogTitle>
          <DialogDescription>
            Place a call to {prospect.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-lg border bg-muted/30 p-4 text-center">
            <p className="text-sm font-medium">{prospect.name}</p>
            <p className="text-2xl font-bold tracking-wide mt-1">{selectedPhone || "No number"}</p>
            {prospect.do_not_call && (
              <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-destructive font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> Do Not Call flagged
              </div>
            )}
          </div>

          {phone2 && (
            <div className="space-y-2">
              <Label>Select number</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedPhone === phone ? "default" : "outline"}
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => setSelectedPhone(phone)}
                >
                  <Phone className="h-3.5 w-3.5" /> {phone}
                </Button>
                <Button
                  variant={selectedPhone === phone2 ? "default" : "outline"}
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => setSelectedPhone(phone2)}
                >
                  <Phone className="h-3.5 w-3.5" /> {phone2}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Microphone</Label>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
              <Mic className="h-4 w-4" />
              <span>Default microphone</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              disabled={!selectedPhone}
              onClick={() => {
                toast.success(`Calling ${selectedPhone}... Integration with Telnyx coming in M4.`);
                onOpenChange(false);
              }}
            >
              <PhoneCall className="mr-2 h-4 w-4" /> Call Now
            </Button>
          </div>

          <p className="text-[11px] text-center text-muted-foreground">
            VoIP calling via Telnyx — coming in Milestone 4
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Flag Dialog ── */
function FlagDialog({
  open,
  onOpenChange,
  prospect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: ProspectListItem;
}) {
  const [reason, setReason] = useState("");
  const [flagType, setFlagType] = useState("follow_up");
  const [flagPending, startFlag] = useTransition();
  const router = useRouter();

  function handleFlag() {
    startFlag(async () => {
      try {
        if (flagType === "dnc") {
          await toggleDoNotCall({ id: prospect.id, doNotCall: true, reason: reason.trim() || undefined });
          toast.success(`${prospect.name} marked as Do Not Call`);
        } else if (flagType === "follow_up") {
          await changeStatus({
            id: prospect.id,
            status: "follow_up",
            followUpNote: reason.trim() || undefined,
          });
          toast.success(`${prospect.name} status changed to Follow Up`);
        } else {
          toast.success(`${prospect.name} flagged as "${flagType === "priority" ? "Priority" : "Issue"}"`);
        }
        setReason("");
        setFlagType("follow_up");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to flag prospect");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <Flag className="h-4 w-4" />
            </div>
            Flag Prospect
          </DialogTitle>
          <DialogDescription>
            Flag {prospect.name} for follow-up, DNC, or review
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Flag Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "follow_up", label: "Follow Up", color: "border-amber-200 bg-amber-50 text-amber-700", desc: "Changes status to Follow Up" },
                { value: "dnc", label: "Do Not Call", color: "border-red-200 bg-red-50 text-red-700", desc: "Flags as DNC" },
                { value: "priority", label: "Priority", color: "border-orange-200 bg-orange-50 text-orange-700", desc: "Marks as priority" },
                { value: "issue", label: "Issue", color: "border-gray-200 bg-gray-50 text-gray-700", desc: "Flags an issue" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFlagType(opt.value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium transition-all text-center",
                    flagType === opt.value
                      ? cn(opt.color, "ring-2 ring-offset-1 ring-primary/30")
                      : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {flagType === "follow_up" && "This will change the prospect status to Follow Up."}
              {flagType === "dnc" && "This will flag the prospect as Do Not Call."}
              {flagType === "priority" && "Marks this prospect as high priority."}
              {flagType === "issue" && "Flags an issue for review."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="flag-reason">Reason (optional)</Label>
            <Textarea
              id="flag-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add a note about why you're flagging this prospect..."
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleFlag} disabled={flagPending}>
              {flagPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flag className="mr-2 h-4 w-4" />}
              {flagType === "dnc" ? "Mark DNC" : flagType === "follow_up" ? "Set Follow Up" : "Flag Prospect"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
