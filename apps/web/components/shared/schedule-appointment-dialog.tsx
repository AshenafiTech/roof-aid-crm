"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  checkAvailability,
  createAppointment,
  listRuferos,
  rescheduleAppointment,
  suggestRuferos,
  type CanScheduleResult,
  type RuferoSuggestion,
} from "@/app/(dashboard)/appointments/actions";
import { humanReasonFor } from "@/lib/appointments/reasons";

type Rufero = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

function ruferoLabel(r: Rufero): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unknown";
}

function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ScheduleAppointmentDialog({
  open,
  onOpenChange,
  prospectId,
  prospectName,
  prospectLocation,
  defaultRuferoId,
  rescheduleFromId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  prospectName: string;
  prospectLocation?: string;
  defaultRuferoId?: string | null;
  rescheduleFromId?: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [ruferoId, setRuferoId] = useState<string>("");
  const [ruferos, setRuferos] = useState<Rufero[]>([]);
  const [loadingRuferos, setLoadingRuferos] = useState(false);
  const [suggestions, setSuggestions] = useState<RuferoSuggestion[]>([]);
  const [availability, setAvailability] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "result"; value: CanScheduleResult }
  >({ state: "idle" });
  const [pending, start] = useTransition();

  // Load ruferos when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingRuferos(true);
    listRuferos()
      .then((rs) => {
        if (cancelled) return;
        setRuferos(rs);
        const fallback =
          defaultRuferoId && rs.some((r) => r.id === defaultRuferoId)
            ? defaultRuferoId
            : rs[0]?.id ?? "";
        setRuferoId((current) => current || fallback);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message ?? "Failed to load ruferos");
      })
      .finally(() => {
        if (!cancelled) setLoadingRuferos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, defaultRuferoId]);

  // Compute slot ISO if date+time are valid + in the future.
  const slotIso = useMemo(() => {
    if (!date) return null;
    const local = new Date(`${date}T${time}:00`);
    if (Number.isNaN(local.getTime())) return null;
    if (local.getTime() <= Date.now()) return null;
    return local.toISOString();
  }, [date, time]);

  const durationMinutes = useMemo(() => {
    return Math.max(15, Math.min(480, Number(duration) || 60));
  }, [duration]);

  // Proximity-based default rufero: when a slot is set, ask the server for
  // ruferos ordered by distance. We don't override the user's manual pick.
  const userPickedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (!slotIso) return;
    let cancelled = false;
    suggestRuferos({
      prospectId,
      scheduledAt: slotIso,
      durationMinutes,
    })
      .then((rows) => {
        if (cancelled) return;
        setSuggestions(rows);
        // Auto-select the closest available rufero if the user hasn't picked.
        if (!userPickedRef.current) {
          const firstAvailable = rows.find((r) => r.can_schedule_result.allowed);
          const pick = firstAvailable?.rufero_id ?? rows[0]?.rufero_id ?? "";
          if (pick) setRuferoId(pick);
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, slotIso, durationMinutes, prospectId]);

  // Debounced availability check whenever rufero / slot / duration change.
  useEffect(() => {
    if (!open) return;
    if (!ruferoId || !slotIso) {
      setAvailability({ state: "idle" });
      return;
    }
    setAvailability({ state: "checking" });
    const handle = setTimeout(async () => {
      try {
        const result = await checkAvailability({
          ruferoId,
          scheduledAt: slotIso,
          durationMinutes,
        });
        setAvailability({ state: "result", value: result });
      } catch {
        setAvailability({
          state: "result",
          value: { allowed: false, reason: "forbidden" },
        });
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [open, ruferoId, slotIso, durationMinutes]);

  function reset() {
    setDate("");
    setTime("10:00");
    setDuration("60");
    setNotes("");
    setRuferoId("");
    setSuggestions([]);
    setAvailability({ state: "idle" });
    userPickedRef.current = false;
  }

  function handleSchedule() {
    if (!date) {
      toast.error("Please select a date");
      return;
    }
    if (!ruferoId) {
      toast.error("Please select a rufero");
      return;
    }
    if (!slotIso) {
      toast.error("Pick a date/time in the future");
      return;
    }
    if (
      availability.state === "result" &&
      !availability.value.allowed
    ) {
      toast.error(humanReasonFor(availability.value.reason));
      return;
    }

    const local = new Date(slotIso);

    start(async () => {
      try {
        if (rescheduleFromId) {
          await rescheduleAppointment({
            oldAppointmentId: rescheduleFromId,
            ruferoId,
            newScheduledAt: slotIso,
            durationMinutes,
            notes: notes.trim() || undefined,
          });
          toast.success(
            `Rescheduled ${prospectName} to ${local.toLocaleString()}`,
          );
        } else {
          await createAppointment({
            prospectId,
            ruferoId,
            scheduledAt: slotIso,
            durationMinutes,
            notes: notes.trim() || undefined,
          });
          toast.success(
            `Scheduled for ${prospectName} on ${local.toLocaleString()}`,
          );
        }
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to schedule");
      }
    });
  }

  // Helper: enriched label for the rufero Select that shows distance +
  // availability status when we have suggestions in hand.
  function ruferoSelectLabel(r: Rufero): string {
    const hit = suggestions.find((s) => s.rufero_id === r.id);
    if (!hit) return ruferoLabel(r);
    const parts: string[] = [ruferoLabel(r)];
    if (hit.distance_miles !== null && hit.distance_miles !== undefined) {
      parts.push(`${Number(hit.distance_miles).toFixed(1)} mi`);
    }
    if (!hit.can_schedule_result.allowed) {
      parts.push(
        hit.can_schedule_result.reason === "overlap"
          ? "(busy)"
          : hit.can_schedule_result.reason === "overlap_with_block"
            ? "(blocked)"
            : hit.can_schedule_result.reason === "outside_working_hours"
              ? "(off-hours)"
              : "(unavailable)",
      );
    }
    return parts.join(" · ");
  }

  const saveDisabled =
    pending ||
    loadingRuferos ||
    !slotIso ||
    !ruferoId ||
    (availability.state === "result" && !availability.value.allowed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <CalendarPlus className="h-4 w-4" />
            </div>
            {rescheduleFromId ? "Reschedule Appointment" : "Schedule Appointment"}
          </DialogTitle>
          <DialogDescription>
            {rescheduleFromId
              ? `Pick a new slot for ${prospectName}`
              : `Schedule a visit for ${prospectName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">{prospectName}</p>
            {prospectLocation && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {prospectLocation}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="appt-date">Date</Label>
              <Input
                id="appt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={todayLocalDate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-time">Time</Label>
              <Input
                id="appt-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="appt-duration">Duration (min)</Label>
              <Input
                id="appt-duration"
                type="number"
                min={15}
                max={480}
                step={15}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Rufero</Label>
              <Select
                value={ruferoId}
                onValueChange={(v) => {
                  userPickedRef.current = true;
                  setRuferoId(v);
                }}
                disabled={loadingRuferos || ruferos.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingRuferos ? "Loading…" : "Select rufero"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {ruferos.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {ruferoSelectLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-notes">Notes</Label>
            <Textarea
              id="appt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions for the visit..."
              rows={3}
            />
          </div>

          <AvailabilityBanner availability={availability} />

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSchedule}
              disabled={saveDisabled}
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              {pending ? "Scheduling…" : "Schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityBanner({
  availability,
}: {
  availability:
    | { state: "idle" }
    | { state: "checking" }
    | { state: "result"; value: CanScheduleResult };
}) {
  if (availability.state === "idle") return null;
  if (availability.state === "checking") {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking availability…
      </div>
    );
  }
  const { value } = availability;
  if (value.allowed) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Slot available
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>{humanReasonFor(value.reason)}</span>
    </div>
  );
}
