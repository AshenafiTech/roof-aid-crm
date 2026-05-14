"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPOINTMENT_STATUS_CHIP,
  type AppointmentStatus,
} from "@/lib/constants/appointment-status";
import type { AppointmentListItem } from "@/lib/queries/appointments";

import { assignAppointmentRufero } from "./actions";
import type { RuferoOption } from "./appointment-filters";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatName(
  user: { first_name: string | null; last_name: string | null } | null,
): string {
  if (!user) return "—";
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || "Unknown";
}

function ruferoLabel(r: RuferoOption): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unknown";
}

function RuferoCell({
  appointment,
  ruferos,
}: {
  appointment: AppointmentListItem;
  ruferos: RuferoOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = appointment.rufero?.id ?? "";

  function onChange(next: string) {
    if (next === appointment.rufero?.id) return;

    start(async () => {
      try {
        await assignAppointmentRufero({
          appointmentId: appointment.id,
          ruferoId: next,
        });
        const r = ruferos.find((x) => x.id === next);
        toast.success(`Assigned to ${r ? ruferoLabel(r) : "rufero"}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to assign");
      }
    });
  }

  return (
    <Select value={current} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-full text-xs">
        <SelectValue placeholder="Assign rufero" />
      </SelectTrigger>
      <SelectContent>
        {ruferos.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {ruferoLabel(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AppointmentTable({
  appointments,
  total,
  currentPage,
  pageSize,
  ruferos,
  canAssign,
}: {
  appointments: AppointmentListItem[];
  total: number;
  currentPage: number;
  pageSize: number;
  ruferos: RuferoOption[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const totalPages = Math.ceil(total / pageSize);

  function goToPage(p: number) {
    const next = new URLSearchParams(sp);
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    start(() =>
      router.push(qs ? `/appointments?${qs}` : "/appointments"),
    );
  }

  if (appointments.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Calendar className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-sm font-semibold">No Appointments</h3>
        <p className="mt-1.5 max-w-[240px] text-xs text-muted-foreground">
          No appointments match the current filters. Appointments are created
          from prospect detail pages.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Table header */}
      <div className="hidden grid-cols-[1fr_140px_180px_120px_100px] items-center gap-3 px-4 text-xs font-medium text-muted-foreground lg:grid">
        <span>Prospect</span>
        <span>Date & Time</span>
        <span>Rufero</span>
        <span>Duration</span>
        <span>Status</span>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {appointments.map((appt) => (
          <Card key={appt.id} className="px-4 py-3">
            <div className="grid items-center gap-3 lg:grid-cols-[1fr_140px_180px_120px_100px]">
              {/* Prospect */}
              <div className="min-w-0">
                {appt.prospect ? (
                  <Link
                    href={`/prospects/${appt.prospect.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {appt.prospect.name}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Unknown prospect
                  </span>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  {appt.prospect?.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {appt.prospect.city}
                    </span>
                  )}
                  {appt.prospect?.phones?.[0] && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {appt.prospect.phones[0]}
                    </span>
                  )}
                </div>
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-2 text-sm lg:flex-col lg:items-start lg:gap-0">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground lg:hidden" />
                  {formatDate(appt.scheduled_at)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(appt.scheduled_at)}
                </span>
              </div>

              {/* Rufero */}
              <div className="min-w-0">
                {canAssign ? (
                  <RuferoCell appointment={appt} ruferos={ruferos} />
                ) : (
                  <div className="flex items-center gap-1 text-sm">
                    <User className="h-3 w-3 text-muted-foreground lg:hidden" />
                    <span className="truncate">{formatName(appt.rufero)}</span>
                  </div>
                )}
              </div>

              {/* Duration */}
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="h-3 w-3 lg:hidden" />
                {appt.duration_minutes ? `${appt.duration_minutes} min` : "—"}
              </div>

              {/* Status */}
              <Badge
                variant="outline"
                className={`w-fit capitalize ${APPOINTMENT_STATUS_CHIP[appt.status as AppointmentStatus] ?? ""}`}
              >
                {appt.status}
              </Badge>
            </div>

            {appt.notes && (
              <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                {appt.notes}
              </p>
            )}
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} ({total} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={currentPage <= 1 || pending}
              onClick={() => goToPage(currentPage - 1)}
            >
              <ChevronLeft className="mr-1 h-3 w-3" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={currentPage >= totalPages || pending}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
