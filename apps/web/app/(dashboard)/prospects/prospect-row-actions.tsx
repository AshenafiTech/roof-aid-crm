"use client";

import { useState } from "react";
import {
  CalendarPlus,
  Mail,
  MessageSquare,
  Navigation,
  Phone,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScheduleAppointmentDialog } from "@/components/shared/schedule-appointment-dialog";

import { NotesDialog } from "./notes-dialog";

function comingSoon(label: string, milestone: string) {
  toast(`${label} ships in ${milestone}`);
}

export function ProspectRowActions({
  prospectId,
  prospectName,
  doNotCall,
  assignedTo,
  prospectLocation,
}: {
  prospectId: string;
  prospectName: string;
  doNotCall: boolean;
  assignedTo?: string | null;
  prospectLocation?: string;
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label={doNotCall ? "Call (DNC Flagged)" : "Call"}
        title={doNotCall ? "DNC Flagged — call with caution" : "Call"}
        onClick={() => comingSoon("Call", "M4")}
      >
        <Phone className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label={doNotCall ? "SMS (DNC Flagged)" : "SMS"}
        title={doNotCall ? "DNC Flagged — message with caution" : "SMS"}
        onClick={() => comingSoon("SMS", "M4")}
      >
        <MessageSquare className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Email"
        onClick={() => comingSoon("Email", "M4")}
      >
        <Mail className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Schedule appointment"
        onClick={() => setScheduleOpen(true)}
      >
        <CalendarPlus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Navigate"
        onClick={() => comingSoon("Navigation", "M5")}
      >
        <Navigation className="h-4 w-4" />
      </Button>
      <NotesDialog
        prospectId={prospectId}
        prospectName={prospectName}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Add note"
          >
            <StickyNote className="h-4 w-4" />
          </Button>
        }
      />
      <ScheduleAppointmentDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        prospectId={prospectId}
        prospectName={prospectName}
        prospectLocation={prospectLocation}
        defaultRuferoId={assignedTo ?? null}
      />
    </div>
  );
}
