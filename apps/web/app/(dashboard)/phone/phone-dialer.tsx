"use client";

import { useState } from "react";
import { Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PhoneDialer() {
  const [number, setNumber] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Dialer</h2>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="microphone">Microphone</Label>
            <Select defaultValue="default">
              <SelectTrigger id="microphone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="voice-level">Voice Level</Label>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full w-1/3 bg-primary rounded-full" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="phone-number">Number</Label>
            <Input
              id="phone-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>
          <Button className="w-full" size="lg">
            <Phone className="mr-2 h-4 w-4" /> Call
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Call Log</h2>
        <p className="text-sm text-muted-foreground">
          Call history will appear here. Integration with Telnyx coming in M4.
        </p>
      </Card>
    </div>
  );
}
