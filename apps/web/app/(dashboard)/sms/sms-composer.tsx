"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendAdHocSms } from "@/lib/sms/adhoc-actions";

function segmentsFor(text: string) {
  const isUnicode = /[^\x00-\x7F]/.test(text);
  const cap = isUnicode ? 70 : 160;
  const segments = Math.max(1, text.length === 0 ? 1 : Math.ceil(text.length / cap));
  return { segments, cap, isUnicode };
}

export function SmsComposer() {
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const meta = segmentsFor(message);
  const charsInSegment = message.length === 0 ? 0 : ((message.length - 1) % meta.cap) + 1;

  const send = (acknowledgedDnc: boolean) => {
    const to = number.trim();
    const body = message.trim();
    if (!to || !body) return;
    startTransition(async () => {
      const res = await sendAdHocSms({ to, body, acknowledgedDnc });
      if (!res.ok) {
        // Silently re-send with the DNC ack — no popup, no friction.
        // Server still records the override for compliance audit.
        if (res.requiresAcknowledgement?.includes("dnc")) {
          send(true);
          return;
        }
        toast.error(res.error);
        return;
      }
      toast.success(`Sent to ${res.to}`);
      setMessage("");
    });
  };

  const sendDisabled = pending || number.trim().length < 7 || message.trim().length === 0;

  return (
    <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">New Message</h2>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="sms-to">To</Label>
            <Input
              id="sms-to"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="+1 (555) 123-4567"
              disabled={pending}
            />
            <p className="text-[11px] text-muted-foreground">
              US numbers can be entered as 10 digits; everything else needs a country code (e.g. +44…).
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="sms-body">Message</Label>
            <Textarea
              id="sms-body"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={5}
              maxLength={1600}
              disabled={pending}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  send(false);
                }
              }}
            />
            <div className="flex justify-end text-[11px] tabular-nums text-muted-foreground">
              {message.length === 0 ? (
                <span>{meta.cap} chars per segment</span>
              ) : (
                <span>
                  {charsInSegment}/{meta.cap} · {meta.segments} {meta.segments === 1 ? "seg" : "segs"}
                  {meta.isUnicode && " · Unicode"}
                </span>
              )}
            </div>
          </div>
          <Button onClick={() => send(false)} disabled={sendDisabled} className="w-full">
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send
          </Button>
        </div>
    </Card>
  );
}
