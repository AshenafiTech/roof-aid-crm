"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

import { createAvailabilityBlock } from "@/app/(dashboard)/appointments/actions";

const REASONS = ["sick", "pto", "office", "personal", "other"] as const;

const REASON_LABELS: Record<(typeof REASONS)[number], string> = {
  sick: "Sick",
  pto: "PTO",
  office: "Office",
  personal: "Personal",
  other: "Other",
};

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BlockRuferoTimeDialog({
  open,
  onOpenChange,
  ruferoId,
  ruferoName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruferoId: string;
  ruferoName: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayLocalDate());
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [allDay, setAllDay] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("personal");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "weekday" | "weekly">(
    "none",
  );
  const [pending, start] = useTransition();

  function reset() {
    setDate(todayLocalDate());
    setStartTime("12:00");
    setEndTime("13:00");
    setAllDay(false);
    setReason("personal");
    setNotes("");
    setRecurrence("none");
  }

  function handleSubmit() {
    if (!date) {
      toast.error("Pick a date");
      return;
    }

    let startIso: string;
    let endIso: string;

    if (allDay) {
      const s = new Date(`${date}T00:00:00`);
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      startIso = s.toISOString();
      endIso = e.toISOString();
    } else {
      const s = new Date(`${date}T${startTime}:00`);
      const e = new Date(`${date}T${endTime}:00`);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        toast.error("Invalid time");
        return;
      }
      if (e.getTime() <= s.getTime()) {
        toast.error("End must be after start");
        return;
      }
      startIso = s.toISOString();
      endIso = e.toISOString();
    }

    const recurrenceRule =
      recurrence === "weekday"
        ? "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
        : recurrence === "weekly"
          ? `FREQ=WEEKLY;BYDAY=${weekdayCode(date)}`
          : undefined;

    start(async () => {
      try {
        await createAvailabilityBlock({
          ruferoId,
          startsAt: startIso,
          endsAt: endIso,
          allDay,
          kind: "busy",
          reason,
          notes: notes.trim() || undefined,
          recurrenceRule,
        });
        toast.success(`Blocked ${ruferoName}'s time`);
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to block time");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-700">
              <Ban className="h-4 w-4" />
            </div>
            Block {ruferoName}'s time
          </DialogTitle>
          <DialogDescription>
            Reserves the slot so no one can schedule them during this time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="block-date">Date</Label>
            <Input
              id="block-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={todayLocalDate()}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            All day
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="block-start">From</Label>
                <Input
                  id="block-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-end">To</Label>
                <Input
                  id="block-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason</Label>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    reason === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted"
                  }`}
                >
                  {REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Repeat</Label>
            <div className="flex flex-col gap-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={recurrence === "none"}
                  onChange={() => setRecurrence("none")}
                />
                Does not repeat
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={recurrence === "weekday"}
                  onChange={() => setRecurrence("weekday")}
                />
                Every weekday (Mon–Fri)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={recurrence === "weekly"}
                  onChange={() => setRecurrence("weekly")}
                />
                Weekly on{" "}
                {date
                  ? new Date(date).toLocaleDateString(undefined, {
                      weekday: "long",
                    })
                  : "this day"}
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="block-notes">Notes</Label>
            <Textarea
              id="block-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
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
              onClick={handleSubmit}
              disabled={pending}
            >
              {pending ? "Blocking…" : "Block time"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function weekdayCode(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d.getDay()];
}
