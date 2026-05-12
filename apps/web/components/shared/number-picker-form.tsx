"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  POPULAR_METROS,
  metroForNpa,
  siblingsForNpa,
} from "@/lib/telnyx/npa-metros";
import type { AvailableNumber } from "@/lib/telnyx/types";

export function formatE164(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

type SearchResult = { ok: true; numbers: AvailableNumber[] } | { ok: false; error: string };
type PurchaseResult = { ok: true; e164: string; phone_number_id: string } | { ok: false; error: string };

export interface NumberPickerFormProps {
  searchAction: (input: { areaCode: string }) => Promise<SearchResult>;
  purchaseAction: (input: { e164: string; label: string }) => Promise<PurchaseResult>;
  submitLabel?: string;
  defaultLabelValue?: string;
  successToast?: (e164: string) => string;
  onSuccess?: (e164: string) => void;
}

export function NumberPickerForm({
  searchAction,
  purchaseAction,
  submitLabel = "Buy number",
  defaultLabelValue = "Main",
  successToast,
  onSuccess,
}: NumberPickerFormProps) {
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState(defaultLabelValue);
  const [searched, setSearched] = useState(false);

  const [searching, startSearch] = useTransition();
  const [purchasing, startPurchase] = useTransition();

  // Clear the result set and return to the initial state so the user can
  // try a different area code (with the Popular Markets chips visible again).
  const resetSearch = () => {
    setAreaCode("");
    setResults([]);
    setSelected(null);
    setSearched(false);
  };

  // Hint shown next to the input as the user types (e.g. "479 — NW Arkansas").
  const metroHint = useMemo(
    () => (areaCode.length === 3 ? metroForNpa(areaCode) : null),
    [areaCode],
  );

  // When a search returns 0 results, show sibling NPAs for the same metro.
  const siblings = useMemo(
    () => (searched && results.length === 0 ? siblingsForNpa(areaCode) : []),
    [searched, results.length, areaCode],
  );

  const runSearch = (npa: string) => {
    if (!/^\d{3}$/.test(npa)) {
      toast.error("Area code must be 3 digits");
      return;
    }
    setAreaCode(npa);
    setResults([]);
    setSelected(null);
    startSearch(async () => {
      const res = await searchAction({ areaCode: npa });
      if (!res.ok) {
        toast.error(res.error);
        setResults([]);
        setSearched(true);
        return;
      }
      setResults(res.numbers);
      setSelected(res.numbers[0]?.e164 ?? null);
      setSearched(true);
      if (res.numbers.length === 0) {
        const m = metroForNpa(npa);
        toast.message("No numbers available right now", {
          description: m
            ? `Try a sibling area code: ${siblingsForNpa(npa).join(", ") || "none on file"}`
            : "Try a different area code.",
        });
      }
    });
  };

  const handleSearch = () => runSearch(areaCode);

  const handlePurchase = () => {
    if (!selected) return;
    startPurchase(async () => {
      const res = await purchaseAction({ e164: selected, label: labelValue });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        successToast?.(res.e164) ??
          `Number ${formatE164(res.e164)} added.`,
      );
      onSuccess?.(res.e164);
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="area-code">Area code</Label>
            <Input
              id="area-code"
              inputMode="numeric"
              maxLength={3}
              placeholder="479"
              value={areaCode}
              onChange={(e) =>
                setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={searching || areaCode.length !== 3}
          >
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Search
          </Button>
        </div>

        {metroHint && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            <span className="tabular-nums">{areaCode}</span>
            {" — "}
            <span>
              {metroHint.label}, {metroHint.state}
            </span>
            {metroHint.npas.length > 1 && (
              <span className="text-muted-foreground/70">
                {" "}
                · also {metroHint.npas.filter((n) => n !== areaCode).join(", ")}
              </span>
            )}
          </p>
        )}
      </div>

      {!searched && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Popular markets
          </p>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_METROS.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => runSearch(m.npas[0])}
                disabled={searching}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
              >
                {m.label}
                <span className="ml-1.5 tabular-nums text-muted-foreground/70">
                  {m.npas[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {searched && results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-muted-foreground">
              {results.length} numbers available
            </div>
            <button
              type="button"
              onClick={resetSearch}
              className="text-xs font-medium text-primary hover:underline"
            >
              ← Try another area code
            </button>
          </div>
          <div className="rounded-lg border divide-y max-h-80 overflow-y-auto">
            {results.map((n) => (
              <label
                key={n.e164}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition-colors"
              >
                <input
                  type="radio"
                  name="number"
                  value={n.e164}
                  checked={selected === n.e164}
                  onChange={() => setSelected(n.e164)}
                  className="size-4"
                />
                <div className="flex-1">
                  <div className="font-medium tabular-nums">{formatE164(n.e164)}</div>
                  <div className="text-xs text-muted-foreground">
                    {[n.city, n.region].filter(Boolean).join(", ") || "United States"}
                    {" · "}
                    {n.capabilities.join(" / ").toUpperCase()}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <Label htmlFor="label">Label this number</Label>
            <Input
              id="label"
              placeholder="Main"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value.slice(0, 50))}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">
              Shown next to the number in settings — e.g.{" "}
              &ldquo;Main&rdquo;, &ldquo;Bentonville office&rdquo;.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handlePurchase}
              disabled={purchasing || !selected || labelValue.trim().length === 0}
            >
              {purchasing ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        </div>
      )}

      {searched && results.length === 0 && (
        <div className="space-y-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            No numbers available in {areaCode} right now.
          </p>
          <button
            type="button"
            onClick={resetSearch}
            className="text-xs font-medium text-primary hover:underline"
          >
            ← Try another area code
          </button>
          {siblings.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Try a sibling area code in the same metro:
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {siblings.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => runSearch(s)}
                    disabled={searching}
                    className="rounded-full border border-border bg-background px-3 py-1 text-xs tabular-nums hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Try a different area code (e.g. 512, 415, 832).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
