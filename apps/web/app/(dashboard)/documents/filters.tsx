"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "generated", label: "Generated" },
  { value: "sent", label: "Sent" },
  { value: "signed", label: "Signed" },
  { value: "uploaded", label: "Uploaded" },
  { value: "failed", label: "Failed" },
];

const TYPES = [
  { value: "all", label: "All types" },
  { value: "3rd_party_auth", label: "3rd Party Auth" },
  { value: "acv_contract", label: "ACV Contract" },
  { value: "rcv_contract", label: "RCV Contract" },
  { value: "supplement", label: "Supplement" },
  { value: "upload", label: "Uploaded PDF" },
];

type SignedPreset =
  | "any"
  | "today"
  | "7d"
  | "30d"
  | "this_month"
  | "exact"
  | "custom";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(p: SignedPreset): { from?: string; to?: string } {
  const now = new Date();
  switch (p) {
    case "today": {
      const today = toIsoDate(now);
      return { from: today, to: today };
    }
    case "7d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: toIsoDate(from), to: toIsoDate(now) };
    }
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: toIsoDate(from), to: toIsoDate(now) };
    }
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIsoDate(from), to: toIsoDate(now) };
    }
    default:
      return {};
  }
}

function detectPreset(
  from: string | undefined,
  to: string | undefined,
): SignedPreset {
  if (!from && !to) return "any";
  for (const p of ["today", "7d", "30d", "this_month"] as SignedPreset[]) {
    const r = presetRange(p);
    if (r.from === from && r.to === to) return p;
  }
  // Single specific day → "exact".
  if (from && to && from === to) return "exact";
  return "custom";
}

export function DocumentFilters({
  status,
  type,
  q,
  signedFrom,
  signedTo,
}: {
  status?: string;
  type?: string;
  q?: string;
  signedFrom?: string;
  signedTo?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [text, setText] = useState(q ?? "");
  const lastApplied = useRef<string>(q ?? "");
  const initialPreset = detectPreset(signedFrom, signedTo);
  const [showCustom, setShowCustom] = useState(initialPreset === "custom");
  const [showExact, setShowExact] = useState(initialPreset === "exact");

  // Keep input in sync if the URL `q` changes from elsewhere.
  useEffect(() => {
    if ((q ?? "") !== text) setText(q ?? "");
    lastApplied.current = q ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Debounced URL sync — 300ms after the user stops typing.
  useEffect(() => {
    if (text === lastApplied.current) return;
    const h = setTimeout(() => {
      lastApplied.current = text;
      patch({ q: text.trim() || undefined });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function patch(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === "all") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    router.replace(qs ? `/documents?${qs}` : "/documents");
  }

  function onPresetChange(p: SignedPreset) {
    if (p === "any") {
      patch({ signed_from: undefined, signed_to: undefined });
      setShowCustom(false);
      setShowExact(false);
    } else if (p === "custom") {
      setShowCustom(true);
      setShowExact(false);
    } else if (p === "exact") {
      setShowExact(true);
      setShowCustom(false);
    } else {
      const r = presetRange(p);
      patch({ signed_from: r.from, signed_to: r.to });
      setShowCustom(false);
      setShowExact(false);
    }
  }

  function onExactDateChange(date: string) {
    if (!date) {
      patch({ signed_from: undefined, signed_to: undefined });
      return;
    }
    patch({ signed_from: date, signed_to: date });
  }

  const hasFilters =
    (status && status !== "all") ||
    (type && type !== "all") ||
    (q && q.length > 0) ||
    !!signedFrom ||
    !!signedTo;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by prospect name, city, address…"
          className="h-9 pl-9 pr-8"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setText("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Select
        value={status ?? "all"}
        onValueChange={(v) => patch({ status: v })}
      >
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={type ?? "all"} onValueChange={(v) => patch({ type: v })}>
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={initialPreset}
        onValueChange={(v) => onPresetChange(v as SignedPreset)}
      >
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Signed: Any time</SelectItem>
          <SelectItem value="today">Signed: Today</SelectItem>
          <SelectItem value="7d">Signed: Last 7 days</SelectItem>
          <SelectItem value="30d">Signed: Last 30 days</SelectItem>
          <SelectItem value="this_month">Signed: This month</SelectItem>
          <SelectItem value="exact">Signed: On a specific date…</SelectItem>
          <SelectItem value="custom">Signed: Custom range…</SelectItem>
        </SelectContent>
      </Select>

      {showExact && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={signedFrom ?? ""}
            onChange={(e) => onExactDateChange(e.target.value)}
            className="h-9 w-[170px]"
            aria-label="Signed on"
          />
        </div>
      )}

      {showCustom && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={signedFrom ?? ""}
            max={signedTo || undefined}
            onChange={(e) =>
              patch({ signed_from: e.target.value || undefined })
            }
            className="h-9 w-[150px]"
            aria-label="Signed from"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={signedTo ?? ""}
            min={signedFrom || undefined}
            onChange={(e) =>
              patch({ signed_to: e.target.value || undefined })
            }
            className="h-9 w-[150px]"
            aria-label="Signed to"
          />
        </div>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => {
            setText("");
            setShowCustom(false);
            setShowExact(false);
            router.replace("/documents");
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
