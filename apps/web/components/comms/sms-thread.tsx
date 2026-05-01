"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  MessageSquare,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface SmsMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: "queued" | "sent" | "delivered" | "failed" | "received";
  from_number: string | null;
  to_number: string | null;
  segments: number | null;
  error_code: string | null;
  agent_id: string | null;
  created_at: string;
}

export interface SmsThreadProps {
  prospectId: string;
  initialMessages: SmsMessage[];
  emptyHint?: string;
}

function isToday(d: Date) {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
function isYesterday(d: Date) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return (
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate()
  );
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function StatusIcon({
  status,
  error,
}: {
  status: SmsMessage["status"];
  error: string | null;
}) {
  switch (status) {
    case "queued":
      return <Clock className="size-3" aria-label="queued" />;
    case "sent":
      return <Check className="size-3" aria-label="sent" />;
    case "delivered":
      return <CheckCheck className="size-3 text-blue-500" aria-label="delivered" />;
    case "failed":
      return (
        <span title={error ?? "failed"}>
          <AlertCircle className="size-3 text-destructive" aria-label="failed" />
        </span>
      );
    default:
      return null;
  }
}

export function SmsThread({
  prospectId,
  initialMessages,
  emptyHint,
}: SmsThreadProps) {
  const [messages, setMessages] = useState<Map<string, SmsMessage>>(
    () => new Map(initialMessages.map((m) => [m.id, m])),
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`sms:${prospectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sms_logs",
          filter: `prospect_id=eq.${prospectId}`,
        },
        (payload) => {
          const row = payload.new as Partial<SmsMessage> | undefined;
          if (!row?.id) return;
          setMessages((prev) => {
            const next = new Map(prev);
            const existing = next.get(row.id!);
            next.set(row.id!, { ...(existing ?? ({} as SmsMessage)), ...row } as SmsMessage);
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [prospectId]);

  const sorted = useMemo(
    () =>
      Array.from(messages.values()).sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [messages],
  );

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sorted.length]);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col h-[400px] items-center justify-center rounded-xl border border-dashed bg-muted/10 gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted/40">
          <MessageSquare className="size-6 text-muted-foreground/70" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">No messages yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {emptyHint ?? "Send the first one below to start the conversation."}
          </p>
        </div>
      </div>
    );
  }

  // Render with day dividers
  const items: Array<
    | { kind: "divider"; key: string; label: string }
    | { kind: "message"; key: string; message: SmsMessage }
  > = [];
  let lastKey: string | null = null;
  for (const m of sorted) {
    const key = dayKey(m.created_at);
    if (key !== lastKey) {
      items.push({
        kind: "divider",
        key: `divider-${key}`,
        label: dayLabel(m.created_at),
      });
      lastKey = key;
    }
    items.push({ kind: "message", key: m.id, message: m });
  }

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-1 overflow-y-auto rounded-xl border bg-gradient-to-b from-muted/10 to-muted/30 p-4 max-h-[60vh] min-h-[400px]"
    >
      {items.map((it) =>
        it.kind === "divider" ? (
          <DayDivider key={it.key} label={it.label} />
        ) : (
          <Bubble key={it.key} message={it.message} />
        ),
      )}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-3 px-1">
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function Bubble({ message }: { message: SmsMessage }) {
  const isOutbound = message.direction === "outbound";
  return (
    <div
      className={cn(
        "flex flex-col gap-1 mb-1.5",
        isOutbound ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm",
          isOutbound
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-background border rounded-bl-md",
        )}
      >
        {message.body}
      </div>
      <div
        className={cn(
          "flex items-center gap-1.5 text-[11px] text-muted-foreground px-2",
          isOutbound ? "flex-row-reverse" : "",
        )}
      >
        <span className="tabular-nums">{formatTime(message.created_at)}</span>
        {isOutbound && (
          <>
            <span>·</span>
            <StatusIcon status={message.status} error={message.error_code} />
          </>
        )}
      </div>
    </div>
  );
}
