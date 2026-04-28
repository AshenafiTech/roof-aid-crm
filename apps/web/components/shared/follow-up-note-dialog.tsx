"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function FollowUpNoteDialog({
  open,
  onOpenChange,
  prospectName,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectName: string;
  pending?: boolean;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  function handleSave() {
    const trimmed = note.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  const canSave = note.trim().length > 0 && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Clock className="h-4 w-4" />
            </div>
            Mark as Follow Up
          </DialogTitle>
          <DialogDescription>
            Add a note about why {prospectName} needs follow-up — this is saved
            on the prospect&apos;s notes timeline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="follow-up-note">Follow-up note</Label>
            <Textarea
              id="follow-up-note"
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Called twice, no answer — try again next week"
              rows={4}
              maxLength={5000}
              disabled={pending}
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
              onClick={handleSave}
              disabled={!canSave}
            >
              {pending ? "Saving…" : "Save & change status"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
