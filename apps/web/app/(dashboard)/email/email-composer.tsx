"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

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
import {
  disconnectGmail,
  sendEmailAction,
  type GmailConnection,
} from "@/lib/email/actions";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "Connection request expired. Please try again.",
  token_exchange_failed: "Google rejected the authorization. Please try again.",
  no_refresh_token: "Google did not return a refresh token. Try again.",
  userinfo_failed: "Could not fetch your Google email. Try again.",
  missing_send_scope:
    "You must grant the Gmail send permission to use this feature.",
  role_not_allowed: "Only telefonista and owner users can connect Gmail.",
  db_upsert_failed: "Could not save your Gmail connection. Try again.",
  access_denied: "You declined the Google permission request.",
};

export function EmailComposer({
  initialConnection,
  initialFlash,
}: {
  initialConnection: GmailConnection;
  initialFlash: { connected: boolean; error: string | null };
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, startSend] = useTransition();
  const [isDisconnecting, startDisconnect] = useTransition();

  useEffect(() => {
    if (initialFlash.connected) {
      toast.success("Gmail connected.");
    } else if (initialFlash.error) {
      toast.error(
        OAUTH_ERROR_MESSAGES[initialFlash.error] ?? "Could not connect Gmail.",
      );
    }
    if (initialFlash.connected || initialFlash.error) {
      // Strip the flash params from the URL.
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail_connected");
      url.searchParams.delete("gmail_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [initialFlash]);

  function handleConnect() {
    window.location.href = "/api/google/oauth/start";
  }

  function handleDisconnect() {
    startDisconnect(async () => {
      const res = await disconnectGmail();
      if (res.ok) {
        setConnection({ connected: false, email: null });
        toast.success("Gmail disconnected.");
      }
    });
  }

  function handleSend() {
    if (!connection.connected) {
      toast.error("Connect your Gmail account first.");
      return;
    }
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.error("Please fill in to, subject, and message.");
      return;
    }
    startSend(async () => {
      const res = await sendEmailAction({ to, subject, body });
      if (res.ok) {
        toast.success(`Sent from ${res.from}`);
        setSubject("");
        setBody("");
      } else {
        toast.error(res.error);
        if (res.needsConnect) {
          setConnection({ connected: false, email: null });
        }
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-muted-foreground" />
          {connection.connected ? (
            <div className="text-sm">
              <p className="font-medium">Gmail connected</p>
              <p className="text-muted-foreground">
                Sending as {connection.email}
              </p>
            </div>
          ) : (
            <div className="text-sm">
              <p className="font-medium">Gmail not connected</p>
              <p className="text-muted-foreground">
                Connect your Google account to send email from it.
              </p>
            </div>
          )}
        </div>
        {connection.connected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect}>
            Connect Gmail
          </Button>
        )}
      </Card>

      <Card className="p-6 space-y-4">
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
          <Button
            className="w-full"
            onClick={handleSend}
            disabled={isSending || !connection.connected}
          >
            {isSending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
