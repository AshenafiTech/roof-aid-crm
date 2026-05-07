"use client";

import { Card } from "@/components/ui/card";
import { SmsComposer, type SmsTemplate } from "@/components/comms/sms-composer";
import {
  SmsThread,
  type SmsMessage,
} from "@/components/comms/sms-thread";

interface Props {
  prospectId: string;
  prospectName: string | null;
  hasPhone: boolean;
  isDnc: boolean;
  initialMessages: SmsMessage[];
  templates: SmsTemplate[];
}

export function SmsTab({
  prospectId,
  prospectName,
  hasPhone,
  isDnc,
  initialMessages,
  templates,
}: Props) {
  return (
    <Card className="p-4 space-y-3">
      <SmsThread prospectId={prospectId} initialMessages={initialMessages} />
      <SmsComposer
        prospectId={prospectId}
        prospectName={prospectName}
        hasPhone={hasPhone}
        isDnc={isDnc}
        templates={templates}
      />
    </Card>
  );
}
