"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

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
  { value: "all", label: "All" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no-show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
];

export function AppointmentFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const time = sp.get("time") ?? "upcoming";
  const status = sp.get("status") ?? "";

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    const qs = next.toString();
    start(() => router.push(qs ? `/appointments?${qs}` : "/appointments"));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={time}
        onValueChange={(v) => setParam("time", v === "upcoming" ? undefined : v)}
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
        onValueChange={(v) => setParam("status", v === ALL ? undefined : v)}
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
    </div>
  );
}
