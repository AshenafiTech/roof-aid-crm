"use client";

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

import { NotesDialog } from "./notes-dialog";

function comingSoon(label: string, milestone: string) {
  toast(`${label} ships in ${milestone}`);
}

export function ProspectRowActions({
  prospectId,
  prospectName,
  doNotCall,
}: {
  prospectId: string;
  prospectName: string;
  doNotCall: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Call"
        disabled={doNotCall}
        onClick={() => comingSoon("Call", "M4")}
      >
        <Phone className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="SMS"
        disabled={doNotCall}
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
        onClick={() => comingSoon("Appointments", "M5")}
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
    </div>
  );
}
