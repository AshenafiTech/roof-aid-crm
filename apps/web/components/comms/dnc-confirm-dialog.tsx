"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Warning = "dnc" | "outside_calling_hours";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: Warning[];
  prospectName: string | null;
  onConfirm: () => void;
  busy?: boolean;
}

const WARNING_COPY: Record<Warning, { title: string; body: string }> = {
  dnc: {
    title: "On the Do Not Call list",
    body: "is flagged Do Not Call. Sending this message will be logged with your name and acknowledgement, and may carry legal exposure under TCPA.",
  },
  outside_calling_hours: {
    title: "Outside calling hours",
    body: "is being contacted outside of the configured calling hours (08:00–20:00 in the tenant's timezone).",
  },
};

export function DncConfirmDialog({
  open,
  onOpenChange,
  warnings,
  prospectName,
  onConfirm,
  busy,
}: Props) {
  const subject = prospectName ? `${prospectName}` : "This prospect";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Send anyway?
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            {warnings.map((w) => (
              <span key={w} className="block">
                <strong>{WARNING_COPY[w].title}.</strong> {subject}{" "}
                {WARNING_COPY[w].body}
              </span>
            ))}
            <span className="block pt-2 text-xs">
              By confirming, you accept responsibility for this contact. The
              override is recorded on the message log for compliance audit.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} variant="destructive">
            Send anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
