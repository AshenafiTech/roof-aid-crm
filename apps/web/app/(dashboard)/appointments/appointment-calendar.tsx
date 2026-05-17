"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  APPOINTMENT_STATUS_CALENDAR_CHIP,
  type AppointmentStatus,
} from "@/lib/constants/appointment-status";
import type { AppointmentListItem } from "@/lib/queries/appointments";
import type { UserRole } from "@/lib/types/auth";
import { AppointmentDrawer } from "@/components/shared/appointment-drawer";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseMonth(value: string | null): Date {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function formatMonthParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildGrid(monthStart: Date): Date[] {
  // 6-week grid starting on Sunday of the week containing the 1st.
  const start = new Date(monthStart);
  start.setDate(1 - start.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function AppointmentCalendar({
  appointments,
  currentUserRole,
}: {
  appointments: AppointmentListItem[];
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [drawerAppt, setDrawerAppt] =
    useState<AppointmentListItem | null>(null);

  const monthStart = parseMonth(sp.get("month"));
  const grid = useMemo(() => buildGrid(monthStart), [monthStart.getTime()]);

  const today = new Date();
  const todayKey = dayKey(today);
  const currentMonthIndex = monthStart.getMonth();

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentListItem[]>();
    for (const a of appointments) {
      const k = dayKey(new Date(a.scheduled_at));
      const arr = map.get(k);
      if (arr) arr.push(a);
      else map.set(k, [a]);
    }
    return map;
  }, [appointments]);

  function navigate(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    start(() => router.push(qs ? `/appointments?${qs}` : "/appointments"));
  }

  function goPrev() {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() - 1);
    navigate({ month: formatMonthParam(d) });
  }
  function goNext() {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() + 1);
    navigate({ month: formatMonthParam(d) });
  }
  function goToday() {
    navigate({ month: undefined });
  }

  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={goToday}
            disabled={pending}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goPrev}
            disabled={pending}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goNext}
            disabled={pending}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((cell, idx) => {
            const inMonth = cell.getMonth() === currentMonthIndex;
            const k = dayKey(cell);
            const isToday = k === todayKey;
            const dayAppts = byDay.get(k) ?? [];
            const visible = dayAppts.slice(0, 4);
            const overflow = dayAppts.length - visible.length;

            return (
              <div
                key={idx}
                className={`min-h-[110px] border-b border-r p-1.5 last:border-r-0 ${
                  inMonth ? "bg-background" : "bg-muted/20 text-muted-foreground"
                } ${(idx + 1) % 7 === 0 ? "border-r-0" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs ${
                      isToday
                        ? "bg-primary font-semibold text-primary-foreground"
                        : ""
                    }`}
                  >
                    {cell.getDate()}
                  </span>
                  {dayAppts.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {dayAppts.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {visible.map((a) => {
                    const chipClass =
                      APPOINTMENT_STATUS_CALENDAR_CHIP[
                        a.status as AppointmentStatus
                      ] ?? "border-l-gray-300 bg-gray-50 text-gray-700";
                    const name = a.prospect?.name ?? "Unknown";
                    return (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => setDrawerAppt(a)}
                        className={`block w-full truncate rounded-sm border-l-2 px-1.5 py-0.5 text-left text-[11px] hover:opacity-90 ${chipClass}`}
                        title={`${formatTime(a.scheduled_at)} · ${name}`}
                      >
                        <span className="font-medium">
                          {formatTime(a.scheduled_at)}
                        </span>{" "}
                        {name}
                      </button>
                    );
                  })}
                  {overflow > 0 && (
                    <p className="px-1.5 text-[10px] text-muted-foreground">
                      +{overflow} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <AppointmentDrawer
        appointment={drawerAppt}
        open={drawerAppt !== null}
        onOpenChange={(v) => {
          if (!v) setDrawerAppt(null);
        }}
        currentUserRole={currentUserRole}
      />
    </div>
  );
}
