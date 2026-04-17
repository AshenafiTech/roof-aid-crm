"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function EmailComposer() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <Card className="max-w-2xl p-6 space-y-4">
      <h2 className="text-lg font-semibold">Compose Email</h2>
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <Label>Template</Label>
          <Select defaultValue="manual">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="followup">Project follow-up</SelectItem>
              <SelectItem value="intro">Introduction</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email-to">To</Label>
          <Input
            id="email-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="customer@email.com"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email-subject">Subject</Label>
          <Input
            id="email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Project follow-up"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email-body">Message</Label>
          <Textarea
            id="email-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your message..."
            rows={8}
          />
        </div>
        <Button className="w-full">
          <Send className="mr-2 h-4 w-4" /> Send
        </Button>
      </div>
    </Card>
  );
}
