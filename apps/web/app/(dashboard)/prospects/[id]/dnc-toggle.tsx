"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { toggleDoNotCall } from "./actions";
import type { ProspectWithAssignee } from "./types";

export function DncToggle({ prospect }: { prospect: ProspectWithAssignee }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState(prospect.do_not_call_reason ?? "");
  const isDnc = prospect.do_not_call ?? false;

  function onToggle() {
    const newValue = !isDnc;
    start(async () => {
      try {
        await toggleDoNotCall({
          id: prospect.id,
          doNotCall: newValue,
          reason: newValue ? reason.trim() : undefined,
        });
        toast.success(
          newValue
            ? "Marked as Do Not Call"
            : "Do Not Call flag removed",
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update DNC status",
        );
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            {isDnc ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            )}
            <h3 className="text-sm font-semibold">
              {isDnc ? "Do Not Call — Active" : "Contact Allowed"}
            </h3>
          </div>

          {isDnc && prospect.do_not_call_at && (
            <p className="text-xs text-muted-foreground">
              Flagged on{" "}
              {new Date(prospect.do_not_call_at).toLocaleDateString()}
              {prospect.do_not_call_reason &&
                ` — ${prospect.do_not_call_reason}`}
            </p>
          )}

          {!isDnc && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="dnc-reason" className="text-xs">
                Reason (optional)
              </Label>
              <Input
                id="dnc-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Customer requested, National DNC list"
                maxLength={500}
                className="max-w-sm"
              />
            </div>
          )}
        </div>

        <Button
          variant={isDnc ? "outline" : "destructive"}
          size="sm"
          onClick={onToggle}
          disabled={pending}
        >
          {pending
            ? "Updating..."
            : isDnc
              ? "Remove DNC Flag"
              : "Mark Do Not Call"}
        </Button>
      </div>
    </Card>
  );
}
