"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  PhoneMissed,
  PhoneOff,
  Voicemail,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { CallLogRow } from "@/lib/queries/comms";

function formatE164(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

function formatDuration(s: number | null | undefined): string {
  if (s == null || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

function dispositionBadge(disposition: string | null, direction: string) {
  if (!disposition) return null;
  const map: Record<string, { label: string; cls: string; Icon: typeof Phone }> = {
    answered: { label: "Answered", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", Icon: Phone },
    no_answer: { label: "No answer", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: PhoneMissed },
    voicemail: { label: "Voicemail", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", Icon: Voicemail },
    busy: { label: "Busy", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: PhoneOff },
    failed: { label: "Failed", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400", Icon: PhoneOff },
    cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground", Icon: PhoneOff },
    not_connected: { label: "Not connected", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400", Icon: PhoneOff },
    wrong_number: { label: "Wrong number", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400", Icon: PhoneOff },
    dnc_request: { label: "DNC request", cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400", Icon: PhoneOff },
    callback_requested: { label: "Callback", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", Icon: Phone },
  };
  const m = map[disposition] ?? { label: disposition, cls: "bg-muted text-muted-foreground", Icon: Phone };
  const { Icon } = m;
  void direction;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", m.cls)}>
      <Icon className="size-3" />
      {m.label}
    </span>
  );
}

interface Props {
  initialLogs: CallLogRow[];
  tenantId: string;
  total?: number;
  page?: number;
  pageSize?: number;
}

export function CallLogsList({ initialLogs, tenantId }: Props) {
  const [logs, setLogs] = useState<CallLogRow[]>(() =>
    Array.isArray(initialLogs) ? initialLogs : [],
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`call-logs:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_logs",
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string } | null;
          if (!row?.id) return;
          // Refetch the touched row with relations to keep the list joined.
          if (payload.eventType === "DELETE") {
            setLogs((cur) => cur.filter((l) => l.id !== row.id));
            return;
          }
          const { data } = await supabase
            .from("call_logs")
            .select("*")
            .eq("id", row.id)
            .maybeSingle();
          if (!data) return;
          const fresh = data as unknown as CallLogRow;
          setLogs((cur) => {
            const existing = cur.find((l) => l.id === fresh.id);
            if (existing) {
              return cur.map((l) =>
                l.id === fresh.id
                  ? { ...fresh, prospect: l.prospect, agent: l.agent }
                  : l,
              );
            }
            return [fresh, ...cur].slice(0, 100);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId]);

  if (logs.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted/40">
          <Phone className="size-5 text-muted-foreground/70" />
        </div>
        <p className="mt-3 text-sm font-medium">No calls yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Calls will appear here as they happen.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b px-5 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Call history</h2>
        <Badge variant="secondary" className="text-[10px]">
          Last {logs.length}
        </Badge>
      </div>
      <ul className="divide-y">
        {logs.map((c) => {
          const outbound = c.direction === "outbound";
          const counterparty = outbound ? c.to_number : c.from_number;
          const when = c.started_at ?? c.created_at;
          return (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  outbound ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600",
                )}
              >
                {outbound ? <ArrowUpRight className="size-4" /> : <ArrowDownLeft className="size-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {c.prospect ? (
                    <Link
                      href={`/prospects/${c.prospect.id}`}
                      className="text-sm font-medium hover:underline truncate"
                    >
                      {c.prospect.name ?? formatE164(counterparty)}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium tabular-nums truncate">
                      {formatE164(counterparty)}
                    </span>
                  )}
                  {dispositionBadge(c.disposition, c.direction)}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{outbound ? "Outbound" : "Inbound"}</span>
                  <span>·</span>
                  <span>{formatDuration(c.duration_seconds)}</span>
                  {c.agent && (
                    <>
                      <span>·</span>
                      <span>
                        {c.agent.first_name ?? ""} {c.agent.last_name ?? ""}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-muted-foreground">{relativeTime(when)}</div>
                {c.recording_url && (
                  <a
                    href={c.recording_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline"
                  >
                    Recording
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
