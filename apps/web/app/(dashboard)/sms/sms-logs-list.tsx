"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageSquare,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { SmsLogRow } from "@/lib/queries/comms";

function formatE164(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
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

function fullTimestamp(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

function statusIcon(status: string | null, direction: string) {
  if (direction === "inbound") return null;
  switch (status) {
    case "queued":
      return <Clock className="size-3 text-muted-foreground" aria-label="Queued" />;
    case "sent":
      return <Check className="size-3 text-muted-foreground" aria-label="Sent" />;
    case "delivered":
      return <CheckCheck className="size-3 text-emerald-600" aria-label="Delivered" />;
    case "delivery_unconfirmed":
      return <Check className="size-3 text-amber-600" aria-label="Delivery unconfirmed" />;
    case "failed":
      return <AlertCircle className="size-3 text-rose-600" aria-label="Failed" />;
    default:
      return null;
  }
}

function statusLabel(status: string | null): string {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}

interface Props {
  initialLogs: SmsLogRow[];
  tenantId: string;
  total: number;
  page: number;
  pageSize: number;
}

export function SmsLogsList({
  initialLogs,
  tenantId,
  total: rawTotal,
  page: rawPage,
  pageSize: rawPageSize,
}: Props) {
  const total = Number.isFinite(rawTotal) ? rawTotal : 0;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 20;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const [logs, setLogs] = useState<SmsLogRow[]>(() =>
    Array.isArray(initialLogs) ? initialLogs : [],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // If realtime fires while we're not on page 1, ignore inserts (they
  // belong on the first page anyway and would distort the current view).
  // Updates to rows currently visible are still applied.
  useEffect(() => {
    setLogs(Array.isArray(initialLogs) ? initialLogs : []);
  }, [initialLogs]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`sms-logs:${tenantId}:p${page}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sms_logs",
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string } | null;
          if (!row?.id) return;
          if (payload.eventType === "DELETE") {
            setLogs((cur) => cur.filter((l) => l.id !== row.id));
            return;
          }
          // On non-first pages, only refresh updates to rows already shown.
          if (page > 1 && payload.eventType === "INSERT") return;

          const { data } = await supabase
            .from("sms_logs")
            .select(
              "id, tenant_id, prospect_id, agent_id, direction, from_number, to_number, body, status, segments, error_code, media_urls, created_at",
            )
            .eq("id", row.id)
            .maybeSingle();
          if (!data) return;
          // Realtime rows arrive without joined prospect/agent. The
          // existing row in state may already have those — preserve
          // them when updating.
          const fresh = data as unknown as SmsLogRow;
          setLogs((cur) => {
            const exists = cur.find((l) => l.id === fresh.id);
            if (exists) {
              return cur.map((l) =>
                l.id === fresh.id
                  ? { ...fresh, prospect: l.prospect, agent: l.agent }
                  : l,
              );
            }
            // Insert on page 1: prepend, drop overflow
            return [fresh, ...cur].slice(0, pageSize);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const opened = useMemo(
    () => (Array.isArray(logs) ? logs.find((l) => l.id === openId) ?? null : null),
    [logs, openId],
  );

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(p));
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  if (total === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted/40">
          <MessageSquare className="size-5 text-muted-foreground/70" />
        </div>
        <p className="mt-3 text-sm font-medium">No messages yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sent and received messages will appear here.
        </p>
      </Card>
    );
  }

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <>
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Message history</h2>
          <Badge variant="secondary" className="text-[10px]">
            {rangeStart}–{rangeEnd} of {total}
          </Badge>
        </div>
        <ul className="divide-y">
          {logs.map((m) => {
            const outbound = m.direction === "outbound";
            const counterparty = outbound ? m.to_number : m.from_number;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(m.id)}
                  className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-muted/30 transition-colors"
                >
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
                      <span className="text-sm font-medium tabular-nums truncate">
                        {m.prospect?.name ?? formatE164(counterparty)}
                      </span>
                      {statusIcon(m.status, m.direction)}
                    </div>
                    <p className="mt-1 text-sm text-foreground/90 line-clamp-2 whitespace-pre-wrap break-words">
                      {m.body || (m.media_urls?.length ? "[media]" : "")}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{outbound ? "Outbound" : "Inbound"}</span>
                      {m.agent && (
                        <>
                          <span>·</span>
                          <span>
                            {m.agent.first_name ?? ""} {m.agent.last_name ?? ""}
                          </span>
                        </>
                      )}
                      {m.error_code && (
                        <>
                          <span>·</span>
                          <span className="text-rose-600">{m.error_code}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                    {relativeTime(m.created_at)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="h-8 gap-1"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="h-8 gap-1"
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!opened} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="sm:max-w-lg">
          {opened && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {opened.direction === "outbound" ? (
                    <ArrowUpRight className="size-4 text-emerald-600" />
                  ) : (
                    <ArrowDownLeft className="size-4 text-blue-600" />
                  )}
                  {opened.direction === "outbound" ? "Sent message" : "Received message"}
                </DialogTitle>
                <DialogDescription>
                  {fullTimestamp(opened.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <DetailRow label="From" value={formatE164(opened.from_number)} />
                <DetailRow label="To" value={formatE164(opened.to_number)} />
                {opened.prospect && (
                  <DetailRow
                    label="Prospect"
                    value={
                      <Link
                        href={`/prospects/${opened.prospect.id}`}
                        className="text-primary hover:underline"
                      >
                        {opened.prospect.name ?? "Unnamed"}
                      </Link>
                    }
                  />
                )}
                {opened.agent && (
                  <DetailRow
                    label="Agent"
                    value={`${opened.agent.first_name ?? ""} ${opened.agent.last_name ?? ""}`.trim() || "—"}
                  />
                )}
                <DetailRow
                  label="Status"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      {statusIcon(opened.status, opened.direction)}
                      <span className="capitalize">{statusLabel(opened.status)}</span>
                    </span>
                  }
                />
                {opened.segments != null && (
                  <DetailRow label="Segments" value={String(opened.segments)} />
                )}
                {opened.error_code && (
                  <DetailRow
                    label="Error"
                    value={<span className="text-rose-600">{opened.error_code}</span>}
                  />
                )}

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Message
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm whitespace-pre-wrap break-words">
                    {opened.body || (opened.media_urls?.length ? "[media only]" : "—")}
                  </div>
                </div>

                {opened.media_urls && opened.media_urls.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                      Media
                    </div>
                    <ul className="space-y-1">
                      {opened.media_urls.map((url, i) => (
                        <li key={i}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline break-all"
                          >
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 items-baseline">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
