"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CalendarDays, List } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

const TIME_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "past", label: "Past" },
  { value: "all", label: "All time" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no-show", label: "No show" },
  { value: "rescheduled", label: "Rescheduled" },
];

const SORT_OPTIONS = [
  { value: "date_asc", label: "Date ↑ (soonest)" },
  { value: "date_desc", label: "Date ↓ (latest)" },
  { value: "created_desc", label: "Recently added" },
];

export type RuferoOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

function ruferoLabel(r: RuferoOption): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unknown";
}

const VIEW_COOKIE = "appt_view";
const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function persistView(view: "list" | "calendar") {
  if (typeof document === "undefined") return;
  document.cookie = `${VIEW_COOKIE}=${view};path=/;max-age=${VIEW_COOKIE_MAX_AGE};samesite=lax`;
}

export function AppointmentFilters({
  ruferos,
  showRuferoFilter,
  currentView,
}: {
  ruferos: RuferoOption[];
  showRuferoFilter: boolean;
  currentView: "list" | "calendar";
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const time = sp.get("time") ?? "upcoming";
  const status = sp.get("status") ?? "";
  const sort = sp.get("sort") ?? "date_asc";
  const view = currentView;

  const ruferoParam = sp.get("rufero") ?? "";
  const ruferoValue = ruferoParam || ALL;

  function update(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    start(() => router.push(qs ? `/appointments?${qs}` : "/appointments"));
  }

  function setView(next: "list" | "calendar") {
    if (next === view) return;
    persistView(next);
    update({ view: next === "list" ? undefined : "calendar" });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* View toggle */}
      <div
        role="tablist"
        aria-label="Appointments view"
        className="inline-flex rounded-md border bg-muted/40 p-0.5"
      >
        <Button
          role="tab"
          aria-selected={view === "list"}
          variant={view === "list" ? "default" : "ghost"}
          size="sm"
          className={`h-7 gap-1.5 px-3 text-xs ${
            view === "list" ? "shadow-sm" : "text-muted-foreground"
          }`}
          onClick={() => setView("list")}
          disabled={pending}
        >
          <List className="h-3.5 w-3.5" />
          List
        </Button>
        <Button
          role="tab"
          aria-selected={view === "calendar"}
          variant={view === "calendar" ? "default" : "ghost"}
          size="sm"
          className={`h-7 gap-1.5 px-3 text-xs ${
            view === "calendar" ? "shadow-sm" : "text-muted-foreground"
          }`}
          onClick={() => setView("calendar")}
          disabled={pending}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Calendar
        </Button>
      </div>

      <Select
        value={time}
        onValueChange={(v) =>
          update({ time: v === "upcoming" ? undefined : v })
        }
      >
        <SelectTrigger className="h-8 w-[130px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status || ALL}
        onValueChange={(v) => update({ status: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="h-8 w-[140px] text-sm">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showRuferoFilter && (
        <Select
          value={ruferoValue}
          onValueChange={(v) =>
            update({ rufero: v === ALL ? undefined : v })
          }
        >
          <SelectTrigger className="h-8 w-[180px] text-sm">
            <SelectValue placeholder="All ruferos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All ruferos</SelectItem>
            {ruferos.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {ruferoLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {view !== "calendar" && (
        <Select
          value={sort}
          onValueChange={(v) =>
            update({ sort: v === "date_asc" ? undefined : v })
          }
        >
          <SelectTrigger className="h-8 w-[170px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
