"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SmsComposer() {
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
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
            />
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
            />
          </div>
          <Button className="w-full">
            <Send className="mr-2 h-4 w-4" /> Send
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <p className="text-sm text-muted-foreground">
          SMS conversations will appear here. Integration with Telnyx coming in M4.
        </p>
      </Card>
    </div>
  );
}
