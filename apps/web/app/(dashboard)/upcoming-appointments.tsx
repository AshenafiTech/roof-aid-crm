import Link from "next/link";
import { ArrowRight, Calendar, Clock, MapPin, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  APPOINTMENT_STATUS_CHIP,
  type AppointmentStatus,
} from "@/lib/constants/appointment-status";
import type { AppointmentListItem } from "@/lib/queries/appointments";

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    time: d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function formatName(
  user: { first_name: string | null; last_name: string | null } | null,
): string {
  if (!user) return "Unassigned";
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "Unknown"
  );
}

export function UpcomingAppointments({
  appointments,
}: {
  appointments: AppointmentListItem[];
}) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Upcoming Appointments</h2>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link href="/appointments">
            View all
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>

      {appointments.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Calendar className="mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No upcoming appointments.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {appointments.map((appt) => {
            const { date, time } = formatDateTime(appt.scheduled_at);
            return (
              <li
                key={appt.id}
                className="flex items-start gap-3 rounded-md border px-3 py-2.5"
              >
                {/* Date column */}
                <div className="shrink-0 text-center">
                  <p className="text-xs font-medium leading-tight">{date}</p>
                  <p className="text-[11px] text-muted-foreground">{time}</p>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  {appt.prospect ? (
                    <Link
                      href={`/prospects/${appt.prospect.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {appt.prospect.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Unknown
                    </span>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    {appt.prospect?.city && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {appt.prospect.city}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5">
                      <User className="h-3 w-3" />
                      {formatName(appt.rufero)}
                    </span>
                    {appt.duration_minutes && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {appt.duration_minutes}m
                      </span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <Badge
                  variant="outline"
                  className={`shrink-0 capitalize ${APPOINTMENT_STATUS_CHIP[appt.status as AppointmentStatus] ?? ""}`}
                >
                  {appt.status}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
