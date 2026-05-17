"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowRightCircle,
  Ban,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCcw,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  APPOINTMENT_STATUS_CHIP,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
} from "@/lib/constants/appointment-status";
import type { UserRole } from "@/lib/types/auth";
import type { AppointmentListItem } from "@/lib/queries/appointments";

import {
  getAppointmentStatusHistory,
  transitionAppointment,
} from "@/app/(dashboard)/appointments/actions";

import { ScheduleAppointmentDialog } from "./schedule-appointment-dialog";
import { BlockRuferoTimeDialog } from "./block-rufero-time-dialog";

type HistoryRow = Awaited<ReturnType<typeof getAppointmentStatusHistory>>[number];

type Capabilities = {
  confirm: boolean;
  cancel: boolean;
  complete: boolean;
  noShow: boolean;
  reschedule: boolean;
  blockTime: boolean;
};

// Transition matrix mirroring the SQL transition_appointment RPC.
function capabilities(
  status: AppointmentStatus,
  role: UserRole,
): Capabilities {
  const adminish =
    role === "admin" || role === "owner" || role === "super_admin";
  const telefonistaOrUp = adminish || role === "telefonista";
  const ruferoOrUp = adminish || role === "rufero";
  const isPending = status === "pending";
  const isConfirmed = status === "confirmed";

  return {
    confirm: isPending && telefonistaOrUp,
    cancel: (isPending || isConfirmed) && telefonistaOrUp,
    complete: isConfirmed && ruferoOrUp,
    noShow: isConfirmed && ruferoOrUp,
    reschedule: (isPending || isConfirmed) && telefonistaOrUp,
    blockTime: adminish,
  };
}

function formatWhen(iso: string, durationMinutes: number | null): string {
  const start = new Date(iso);
  const end = new Date(
    start.getTime() + (durationMinutes ?? 60) * 60 * 1000,
  );
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const sT = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const eT = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${sT} – ${eT}`;
}

function fullName(
  u: { first_name: string | null; last_name: string | null } | null | undefined,
): string {
  if (!u) return "—";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown";
}

export function AppointmentDrawer({
  appointment,
  open,
  onOpenChange,
  currentUserRole,
}: {
  appointment: AppointmentListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reasonOpen, setReasonOpen] = useState<
    null | "cancelled" | "no_show"
  >(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => {
    if (!open || !appointment) return;
    let cancelled = false;
    setLoadingHistory(true);
    getAppointmentStatusHistory(appointment.id)
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, appointment?.id]);

  if (!appointment) return null;

  const status = appointment.status as AppointmentStatus;
  const caps = capabilities(status, currentUserRole);

  function runTransition(
    to: "confirmed" | "completed",
  ) {
    start(async () => {
      try {
        await transitionAppointment({
          appointmentId: appointment!.id,
          to,
        });
        toast.success(`Marked ${APPOINTMENT_STATUS_LABELS[to]}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  function submitWithReason() {
    if (!reasonOpen) return;
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    const to = reasonOpen;
    start(async () => {
      try {
        await transitionAppointment({
          appointmentId: appointment!.id,
          to,
          reason: reason.trim(),
        });
        toast.success(`Marked ${APPOINTMENT_STATUS_LABELS[to]}`);
        setReason("");
        setReasonOpen(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  const prospectAddress = [
    appointment.prospect?.address,
    appointment.prospect?.city,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="text-base">
                  {appointment.prospect?.name ?? "Unknown prospect"}
                </SheetTitle>
                <SheetDescription className="mt-0.5 text-xs">
                  Created {new Date(appointment.created_at).toLocaleString()}
                </SheetDescription>
              </div>
              <Badge
                variant="outline"
                className={`${APPOINTMENT_STATUS_CHIP[status]} h-6 shrink-0`}
              >
                {APPOINTMENT_STATUS_LABELS[status]}
              </Badge>
            </div>
          </SheetHeader>

          <div className="space-y-5 px-5 py-4">
            {reasonOpen && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  Reason for{" "}
                  {reasonOpen === "cancelled" ? "cancellation" : "no-show"}
                </div>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={
                    reasonOpen === "cancelled"
                      ? "e.g. Homeowner requested"
                      : "e.g. Nobody answered the door"
                  }
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setReasonOpen(null);
                      setReason("");
                    }}
                    disabled={pending}
                  >
                    Back
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={submitWithReason}
                    disabled={pending || !reason.trim()}
                  >
                    {pending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            )}

            <Section icon={<Clock className="h-4 w-4" />} label="When">
              <p className="text-sm font-medium">
                {formatWhen(
                  appointment.scheduled_at,
                  appointment.duration_minutes,
                )}
              </p>
              {appointment.cancellation_reason && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Reason: {appointment.cancellation_reason}
                </p>
              )}
            </Section>

            {prospectAddress && (
              <Section
                icon={<MapPin className="h-4 w-4" />}
                label="Where"
              >
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    prospectAddress,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  {prospectAddress}
                </a>
              </Section>
            )}

            <Section icon={<UserIcon className="h-4 w-4" />} label="Rufero">
              <p className="text-sm">{fullName(appointment.rufero)}</p>
            </Section>

            {appointment.prospect && (
              <Section
                icon={<ArrowRightCircle className="h-4 w-4" />}
                label="Prospect"
              >
                <Link
                  href={`/prospects/${appointment.prospect.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Open prospect →
                </Link>
              </Section>
            )}

            {appointment.notes && (
              <Section
                icon={<CalendarIcon className="h-4 w-4" />}
                label="Notes"
              >
                <p className="whitespace-pre-wrap text-sm">{appointment.notes}</p>
              </Section>
            )}

            <Separator />

            {/* Actions */}
            {!reasonOpen && (
              <div className="grid grid-cols-2 gap-2">
                {caps.confirm && (
                  <Button
                    size="sm"
                    onClick={() => runTransition("confirmed")}
                    disabled={pending}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Confirm
                  </Button>
                )}
                {caps.complete && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => runTransition("completed")}
                    disabled={pending}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Mark complete
                  </Button>
                )}
                {caps.reschedule && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRescheduleOpen(true)}
                    disabled={pending}
                  >
                    <RefreshCcw className="mr-1.5 h-4 w-4" />
                    Reschedule
                  </Button>
                )}
                {caps.noShow && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    onClick={() => setReasonOpen("no_show")}
                    disabled={pending}
                  >
                    <Ban className="mr-1.5 h-4 w-4" />
                    No-show
                  </Button>
                )}
                {caps.cancel && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setReasonOpen("cancelled")}
                    disabled={pending}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    Cancel
                  </Button>
                )}
                {caps.blockTime && appointment.rufero && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="col-span-2"
                    onClick={() => setBlockOpen(true)}
                    disabled={pending}
                  >
                    Block this rufero's time
                  </Button>
                )}
              </div>
            )}

            <Separator />

            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                History
              </div>
              {loadingHistory ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No status changes yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-md border bg-muted/20 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span>
                          <span className="text-muted-foreground">
                            {h.from_status ?? "—"}
                          </span>
                          {" → "}
                          <span className="font-medium">{h.to_status}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        by {fullName(h.actor)}
                        {h.reason ? ` · ${h.reason}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reschedule dialog — uses the prospect-aware Stage 1 scheduler. */}
      {appointment.prospect && (
        <ScheduleAppointmentDialog
          open={rescheduleOpen}
          onOpenChange={(v) => {
            setRescheduleOpen(v);
            if (!v) onOpenChange(false);
          }}
          prospectId={appointment.prospect.id}
          prospectName={appointment.prospect.name}
          prospectLocation={prospectAddress || undefined}
          defaultRuferoId={appointment.rufero?.id ?? null}
          rescheduleFromId={appointment.id}
        />
      )}

      {/* Admin: block rufero time. */}
      {appointment.rufero && (
        <BlockRuferoTimeDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          ruferoId={appointment.rufero.id}
          ruferoName={fullName(appointment.rufero)}
        />
      )}
    </>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
