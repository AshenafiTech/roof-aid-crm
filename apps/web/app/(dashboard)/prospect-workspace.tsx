"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MapPin, Search } from "lucide-react";

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
import type { ProspectListItem } from "@/lib/queries/prospects";

import { ProspectListCard } from "./prospect-list-card";

const ALL = "__all__";

export function ProspectWorkspace({
  rows,
  total,
  cities,
  pageSize,
}: {
  rows: ProspectListItem[];
  total: number;
  cities: string[];
  pageSize: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const city = sp.get("city") ?? "";
  const status = sp.get("status") ?? "";
  const q = sp.get("q") ?? "";

  const showing = rows.length;
  const hasMore = showing < total;
  const hasResults = rows.length > 0;

  function push(next: URLSearchParams) {
    next.delete("load");
    const qs = next.toString();
    start(() => router.push(qs ? `/?${qs}` : "/"));
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

  function queryDatabase() {
    start(() => router.refresh());
  }

  function loadMore() {
    const params = new URLSearchParams(sp);
    params.set("load", String(showing + pageSize));
    const qs = params.toString();
    start(() => router.push(qs ? `/?${qs}` : "/"));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <Select
          value={city || ALL}
          onValueChange={(v) => setParam("city", v === ALL ? undefined : v)}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
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

        <Select
          value={status || ALL}
          onValueChange={(v) => setParam("status", v === ALL ? undefined : v)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
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

        <form
          onSubmit={onSearchSubmit}
          className="flex min-w-[180px] flex-1 items-center gap-2"
        >
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name, address, phone..."
            className="h-8 text-xs"
          />
        </form>

        <Button
          type="button"
          size="sm"
          className="ml-auto h-8 shrink-0 text-xs"
          onClick={queryDatabase}
          disabled={pending}
        >
          {pending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          Query Database
        </Button>
      </div>

      {/* Main split: prospect list + map */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel — prospect list */}
        <div className="flex w-full shrink-0 flex-col overflow-hidden border-r sm:w-[340px] lg:w-[400px]">
          <div className="border-b bg-muted/30 px-4 py-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {hasResults
                ? `${showing} de ${total} prospects`
                : "Ready to search."}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {hasResults ? (
              <div className="divide-y">
                {rows.map((row) => (
                  <ProspectListCard key={row.id} prospect={row} />
                ))}
                {hasMore && (
                  <div className="flex justify-center py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={loadMore}
                      disabled={pending}
                    >
                      {pending && (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      )}
                      Load {pageSize} More
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-sm font-semibold">Start Your Search</h3>
                <p className="mt-1.5 max-w-[220px] text-xs text-muted-foreground">
                  Select city and status above, or search by name to find
                  prospects.
                </p>
                <Button
                  className="mt-3 h-8 text-xs"
                  size="sm"
                  onClick={queryDatabase}
                  disabled={pending}
                >
                  Query Database
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — Google Map */}
        <div className="relative hidden flex-1 bg-muted/10 sm:flex">
          <iframe
            title="Prospect Map"
            className="absolute inset-0 h-full w-full"
            src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d200000!2d-97.3!3d37.7!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus!4v1700000000000"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          {!hasResults && (
            <div className="absolute right-3 top-3 rounded-md bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
              <MapPin className="mr-1 inline h-3 w-3" />
              Awaiting search results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
