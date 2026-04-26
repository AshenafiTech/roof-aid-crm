"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, MapPin } from "lucide-react";
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
  createAppointment,
  listRuferos,
} from "@/app/(dashboard)/appointments/actions";

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  prospectName: string;
  prospectLocation?: string;
  defaultRuferoId?: string | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [ruferoId, setRuferoId] = useState<string>("");
  const [ruferos, setRuferos] = useState<Rufero[]>([]);
  const [loadingRuferos, setLoadingRuferos] = useState(false);
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

  function reset() {
    setDate("");
    setTime("10:00");
    setDuration("60");
    setNotes("");
    setRuferoId("");
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
    const local = new Date(`${date}T${time}:00`);
    if (Number.isNaN(local.getTime())) {
      toast.error("Invalid date/time");
      return;
    }
    if (local.getTime() <= Date.now()) {
      toast.error("Appointment must be in the future");
      return;
    }
    const durationMinutes = Math.max(15, Math.min(480, Number(duration) || 60));

    start(async () => {
      try {
        await createAppointment({
          prospectId,
          ruferoId,
          scheduledAt: local.toISOString(),
          durationMinutes,
          notes: notes.trim() || undefined,
        });
        toast.success(
          `Scheduled for ${prospectName} on ${local.toLocaleString()}`,
        );
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to schedule");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <CalendarPlus className="h-4 w-4" />
            </div>
            Schedule Appointment
          </DialogTitle>
          <DialogDescription>
            Schedule a visit for {prospectName}
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
                onValueChange={setRuferoId}
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
                      {ruferoLabel(r)}
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
              disabled={pending || loadingRuferos}
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
