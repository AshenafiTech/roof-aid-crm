"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
  type ProspectStatus,
} from "@/lib/constants/prospect-status";

const ALL = "__all__";

export function Filters({ cities }: { cities: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const city = sp.get("city") ?? "";
  const status = sp.get("status") ?? "";
  const q = sp.get("q") ?? "";

  function push(next: URLSearchParams) {
    next.delete("page");
    const qs = next.toString();
    start(() => router.push(qs ? `/prospects?${qs}` : "/prospects"));
  }

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setParam("q", (form.get("q") as string)?.trim() || undefined);
  }

  const hasAny = city || status || q;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          City
        </label>
        <Select
          value={city || ALL}
          onValueChange={(v) => setParam("city", v === ALL ? undefined : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Status
        </label>
        <Select
          value={status || ALL}
          onValueChange={(v) => setParam("status", v === ALL ? undefined : v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {PROSPECT_STATUSES.map((s: ProspectStatus) => (
              <SelectItem key={s} value={s}>
                {PROSPECT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form onSubmit={onSearchSubmit} className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          Search
        </label>
        <div className="flex gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Name contains..."
            className="w-[220px]"
          />
          <Button type="submit" variant="secondary" disabled={pending}>
            Search
          </Button>
        </div>
      </form>

      <div className="flex items-end gap-2 sm:ml-auto">
        {hasAny && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => push(new URLSearchParams())}
            disabled={pending}
          >
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => start(() => router.refresh())}
          disabled={pending}
        >
          <RefreshCw className="mr-1 h-4 w-4" /> Query Database
        </Button>
      </div>
    </div>
  );
}
