"use client";

import { useState, useTransition } from "react";
import { Loader2, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSoftphoneStore } from "@/lib/stores/softphone-store";
import {
  DncConfirmDialog,
  type Warning as ComplianceWarning,
} from "@/components/comms/dnc-confirm-dialog";
import { REMOTE_AUDIO_ID } from "@/components/comms/softphone";

import { canCallProspect } from "@/lib/calls/actions";

interface CallButtonProps {
  prospectId: string;
  prospectName: string | null;
  prospectPhone: string | null;
  isDnc: boolean;
}

export function CallButton({
  prospectId,
  prospectName,
  prospectPhone,
  isDnc,
}: CallButtonProps) {
  const { status, client, callerNumber, activeCall, setOutgoingContext } =
    useSoftphoneStore();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<ComplianceWarning[]>(
    [],
  );

  const noPhone = !prospectPhone;
  const softphoneNotReady = status !== "ready";
  const inAnotherCall = !!activeCall && status !== "ready";

  const dial = (acknowledged: ComplianceWarning[]) => {
    if (!client || !prospectPhone) return;
    if (!callerNumber) {
      toast.error(
        "No active number to call from. Set up a primary number in Settings → Phone Numbers.",
      );
      return;
    }
    try {
      client.newCall({
        destinationNumber: prospectPhone,
        callerNumber,
        audio: true,
        video: false,
        remoteElement: REMOTE_AUDIO_ID,
        // SIP custom headers ride through to webhooks → useful when we
        // wire call.* event handlers in v0.2 to attribute call_logs.
        customHeaders: [
          { name: "X-RoofAid-Prospect-Id", value: prospectId },
          ...(acknowledged.length > 0
            ? [
                {
                  name: "X-RoofAid-Acknowledged-Warnings",
                  value: acknowledged.join(","),
                },
              ]
            : []),
        ],
      });
      setOutgoingContext({
        prospectId,
        prospectName,
        destinationNumber: prospectPhone,
      });
      setConfirmOpen(false);
      setPendingWarnings([]);
    } catch (err) {
      console.error("[CallButton] dial failed", err);
      toast.error(
        err instanceof Error ? err.message : "Could not start the call",
      );
    }
  };

  const handleClick = () => {
    if (!prospectPhone) return;
    startTransition(async () => {
      // Check `can_call()` server-side — DNC + outside calling hours come
      // back as advisory warnings (per memory note); other reasons hard-block.
      const verdict = await canCallProspect({ prospectId });
      if (!verdict.ok) {
        toast.error(verdict.error);
        return;
      }
      if (verdict.warnings.length > 0) {
        setPendingWarnings(verdict.warnings);
        setConfirmOpen(true);
        return;
      }
      dial([]);
    });
  };

  const handleConfirm = () => dial(pendingWarnings);

  const disabled =
    pending ||
    noPhone ||
    softphoneNotReady ||
    inAnotherCall ||
    !client;

  const tooltip = noPhone
    ? "No phone number on file"
    : softphoneNotReady
      ? "Softphone not ready"
      : inAnotherCall
        ? "Already on a call"
        : isDnc
          ? "On Do Not Call — confirm before dialing"
          : "Call";

  return (
    <>
      <Button
        size="sm"
        variant={isDnc ? "outline" : "default"}
        onClick={handleClick}
        disabled={disabled}
        title={tooltip}
        className={
          isDnc
            ? "gap-1.5 border-amber-500/40 text-amber-700 hover:bg-amber-50 dark:text-amber-400"
            : "gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        }
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : status === "in_call" ? (
          <PhoneOff className="size-4" />
        ) : (
          <Phone className="size-4 fill-current" />
        )}
        Call
      </Button>

      <DncConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        warnings={pendingWarnings}
        prospectName={prospectName}
        onConfirm={handleConfirm}
        busy={pending}
      />
    </>
  );
}
