"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  PencilLine,
  RefreshCw,
  Send,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  disconnectGmail,
  getEmailAction,
  listEmailsAction,
  sendEmailAction,
  type GmailConnection,
} from "@/lib/email/actions";
import type {
  GmailMessageDetail,
  GmailMessageSummary,
} from "@/lib/email/gmail";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "Connection request expired. Please try again.",
  token_exchange_failed: "Google rejected the authorization. Please try again.",
  no_refresh_token: "Google did not return a refresh token. Try again.",
  userinfo_failed: "Could not fetch your Google email. Try again.",
  missing_send_scope:
    "You must grant the Gmail send permission to use this feature.",
  missing_readonly_scope:
    "You must grant the Gmail read permission to view inbox.",
  role_not_allowed: "Only telefonista and owner users can connect Gmail.",
  db_upsert_failed: "Could not save your Gmail connection. Try again.",
  access_denied: "You declined the Google permission request.",
};

type InitialInbox = {
  messages: GmailMessageSummary[];
  nextPageToken: string | null;
} | null;

export function EmailWorkspace({
  initialConnection,
  initialFlash,
  initialInbox,
  initialUnread,
}: {
  initialConnection: GmailConnection;
  initialFlash: { connected: boolean; error: string | null };
  initialInbox: InitialInbox;
  initialUnread: number;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [tab, setTab] = useState<"compose" | "inbox" | "sent">("compose");
  const [unreadCount, setUnreadCount] = useState(initialUnread);
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
        setUnreadCount(0);
        toast.success("Gmail disconnected.");
      }
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <Card className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-muted-foreground" />
          {connection.connected ? (
            <div className="text-sm">
              <p className="font-medium">Gmail connected</p>
              <p className="text-muted-foreground">
                Reading & sending as {connection.email}
              </p>
            </div>
          ) : (
            <div className="text-sm">
              <p className="font-medium">Gmail not connected</p>
              <p className="text-muted-foreground">
                Each user connects their own Gmail account.
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

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="compose">
            <PencilLine className="h-4 w-4" />
            Compose
          </TabsTrigger>
          <TabsTrigger value="inbox">
            <Inbox className="h-4 w-4" />
            Inbox
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1 text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent">
            <Send className="h-4 w-4" />
            Sent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="mt-4">
          <ComposeTab
            connected={connection.connected}
            onNeedsConnect={() =>
              setConnection({ connected: false, email: null })
            }
          />
        </TabsContent>
        <TabsContent value="inbox" className="mt-4">
          <MailboxTab
            folder="INBOX"
            connected={connection.connected}
            initial={initialInbox}
            currentUnreadCount={unreadCount}
            onUnreadCountChange={setUnreadCount}
            onNeedsConnect={() =>
              setConnection({ connected: false, email: null })
            }
          />
        </TabsContent>
        <TabsContent value="sent" className="mt-4">
          <MailboxTab
            folder="SENT"
            connected={connection.connected}
            initial={null}
            onNeedsConnect={() =>
              setConnection({ connected: false, email: null })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComposeTab({
  connected,
  onNeedsConnect,
}: {
  connected: boolean;
  onNeedsConnect: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, startSend] = useTransition();

  function handleSend() {
    if (!connected) {
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
        if (res.needsConnect) onNeedsConnect();
      }
    });
  }

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">Compose Email</h2>
      <div className="space-y-3">
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
            rows={10}
          />
        </div>
        <Button
          className="w-full"
          onClick={handleSend}
          disabled={isSending || !connected}
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
  );
}

function MailboxTab({
  folder,
  connected,
  initial,
  currentUnreadCount = 0,
  onUnreadCountChange,
  onNeedsConnect,
}: {
  folder: "INBOX" | "SENT";
  connected: boolean;
  initial: InitialInbox;
  currentUnreadCount?: number;
  onUnreadCountChange?: (count: number) => void;
  onNeedsConnect: () => void;
}) {
  const [messages, setMessages] = useState<GmailMessageSummary[]>(
    initial?.messages ?? [],
  );
  const [pageStack, setPageStack] = useState<(string | null)[]>([null]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(
    initial?.nextPageToken ?? null,
  );
  const [loaded, setLoaded] = useState(initial !== null);
  const [isLoading, startLoad] = useTransition();
  const [selected, setSelected] = useState<GmailMessageDetail | null>(null);
  const [isOpening, startOpen] = useTransition();

  function loadPage(pageToken: string | null) {
    if (!connected) return;
    startLoad(async () => {
      const res = await listEmailsAction({ folder, pageToken });
      if (res.ok) {
        setMessages(res.data.messages);
        setNextPageToken(res.data.nextPageToken);
        setLoaded(true);
        if (folder === "INBOX" && onUnreadCountChange) {
          onUnreadCountChange(res.unreadCount);
        }
      } else {
        toast.error(res.error);
        if (res.needsConnect) onNeedsConnect();
      }
    });
  }

  useEffect(() => {
    if (connected && !loaded && initial === null) {
      loadPage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  function handleRefresh() {
    setPageStack([null]);
    loadPage(null);
  }

  function handleNext() {
    if (!nextPageToken) return;
    setPageStack((s) => [...s, nextPageToken]);
    loadPage(nextPageToken);
  }

  function handlePrev() {
    if (pageStack.length <= 1) return;
    const newStack = pageStack.slice(0, -1);
    setPageStack(newStack);
    loadPage(newStack[newStack.length - 1]);
  }

  function handleOpen(message: GmailMessageSummary) {
    const wasUnread = folder === "INBOX" && message.unread;
    startOpen(async () => {
      const res = await getEmailAction({
        messageId: message.id,
        markRead: wasUnread,
      });
      if (res.ok) {
        setSelected(res.data);
        if (wasUnread) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === message.id ? { ...m, unread: false } : m,
            ),
          );
          onUnreadCountChange?.(Math.max(0, currentUnreadCount - 1));
        }
      } else {
        toast.error(res.error);
        if (res.needsConnect) onNeedsConnect();
      }
    });
  }

  if (!connected) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Connect your Gmail account to view your {folder === "INBOX" ? "inbox" : "sent"}.
        </p>
      </Card>
    );
  }

  if (selected) {
    return (
      <EmailViewer
        message={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <p className="text-sm font-medium">
          {folder === "INBOX" ? "Inbox" : "Sent"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw
            className={cn("h-4 w-4", isLoading && "animate-spin")}
          />
        </Button>
      </div>

      {isLoading && messages.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : messages.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No messages.
        </div>
      ) : (
        <ul className="divide-y">
          {messages.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => handleOpen(m)}
                disabled={isOpening}
                className={cn(
                  "w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50",
                  m.unread && "bg-primary/5",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={cn(
                      "truncate text-sm",
                      m.unread ? "font-semibold" : "font-medium",
                    )}
                  >
                    {folder === "INBOX"
                      ? m.fromName ?? m.fromEmail
                      : m.to || "(no recipient)"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelative(m.date)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      m.unread && "font-medium",
                    )}
                  >
                    {m.subject}
                  </span>
                  {m.hasAttachments && (
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {m.snippet}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between border-t px-4 py-2">
        <p className="text-xs text-muted-foreground">
          Page {pageStack.length}
        </p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={pageStack.length <= 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={!nextPageToken || isLoading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EmailViewer({
  message,
  onBack,
}: {
  message: GmailMessageDetail;
  onBack: () => void;
}) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        {message.hasAttachments && (
          <Badge variant="outline">
            <Paperclip className="h-3 w-3" />
            Has attachments
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{message.subject}</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">
            {message.fromName ?? message.fromEmail}
          </span>
          {message.fromName && (
            <span className="text-muted-foreground">
              &lt;{message.fromEmail}&gt;
            </span>
          )}
          <span className="text-muted-foreground">
            {format(new Date(message.date), "PPp")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">To: {message.to}</p>
      </div>
      <div className="border-t pt-4">
        {message.bodyHtml ? (
          <iframe
            title="Email body"
            sandbox=""
            srcDoc={message.bodyHtml}
            className="h-[600px] w-full rounded border bg-white"
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {message.bodyText}
          </pre>
        )}
      </div>
    </Card>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 1) {
      return formatDistanceToNow(d, { addSuffix: true });
    }
    if (diffDays < 7) {
      return format(d, "EEE p");
    }
    return format(d, "MMM d");
  } catch {
    return "";
  }
}
