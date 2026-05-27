"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  ArrowRight,
  SkipForward,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  parseExcelFile,
  importExcelFile,
  type ParseResult,
  type ImportResult,
} from "./actions";

type Step = "upload" | "preview" | "importing" | "done";

export function ImportProspects() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, startParsing] = useTransition();
  const [importing, startImporting] = useTransition();

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);

    const fd = new FormData();
    fd.set("file", selected);

    startParsing(async () => {
      try {
        const result = await parseExcelFile(fd);
        setParseResult(result);
        setStep("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file");
      }
    });
  }

  function handleImport() {
    if (!file) return;
    setStep("importing");

    const fd = new FormData();
    fd.set("file", file);

    startImporting(async () => {
      try {
        const result = await importExcelFile(fd);
        setImportResult(result);
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
        setStep("preview");
      }
    });
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setParseResult(null);
    setImportResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Import Prospects</h1>
        <p className="text-sm text-muted-foreground">
          Upload an Excel (.xlsx) or CSV file to bulk-import prospects into the
          system.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Error</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6 shrink-0"
            onClick={() => setError(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {parsing ? (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            ) : (
              <Upload className="h-7 w-7 text-primary" />
            )}
          </div>
          <h3 className="text-base font-semibold">
            {parsing ? "Reading file..." : "Upload Excel File"}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Supported formats: .xlsx, .xls, .csv. Columns are auto-mapped to
            prospect fields (name, address, phone, email, etc.)
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelect}
            disabled={parsing}
          />
          <Button
            className="mt-5"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
          >
            {parsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Choose File
          </Button>

          <div className="mt-6 rounded-lg border bg-muted/30 px-4 py-3 text-left text-xs text-muted-foreground">
            <p className="mb-1.5 font-medium text-foreground">
              Expected columns:
            </p>
            <p>
              FirstName, LastName (or Name), Address, City, State, Zip, Phone,
              Mobile, Email, HomeValue, HailSize, Latitude, Longitude, DNC
            </p>
          </div>
        </Card>
      )}

      {/* ── Step 2: Preview ── */}
      {step === "preview" && parseResult && (
        <>
          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4 text-center">
              <p className="text-2xl font-semibold">{parseResult.totalRows}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {parseResult.validRows}
              </p>
              <p className="text-xs text-muted-foreground">Valid</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                {parseResult.skippedRows}
              </p>
              <p className="text-xs text-muted-foreground">Will Skip</p>
            </Card>
          </div>

          {/* File info */}
          <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file?.name}</p>
              <p className="text-xs text-muted-foreground">
                {parseResult.headers.length} columns detected
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              Change file
            </Button>
          </div>

          {/* Column mapping */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Column Mapping</h3>
            <div className="flex flex-wrap gap-2">
              {parseResult.headers.map((h) => {
                const mapped = parseResult.mapping[h];
                return (
                  <div
                    key={h}
                    className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1 text-xs"
                  >
                    <span className="text-muted-foreground">{h}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                    {mapped ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                      >
                        {mapped}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        skipped
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Preview table */}
          <Card className="overflow-hidden">
            <div className="border-b bg-muted/30 px-4 py-2.5">
              <h3 className="text-sm font-semibold">
                Preview (first {parseResult.preview.length} rows)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/20 text-left">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Address</th>
                    <th className="px-3 py-2 font-medium">City</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parseResult.preview.map((row) => (
                    <tr
                      key={row.row}
                      className={
                        row.skip
                          ? "bg-amber-50/50 text-muted-foreground dark:bg-amber-500/5"
                          : ""
                      }
                    >
                      <td className="px-3 py-2 tabular-nums">{row.row}</td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="max-w-[200px] truncate px-3 py-2">
                        {row.address ?? "—"}
                      </td>
                      <td className="px-3 py-2">{row.city ?? "—"}</td>
                      <td className="px-3 py-2">{row.state ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.phone ?? "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2">
                        {row.email ?? "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.homeValue != null
                          ? `$${row.homeValue.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.skip ? (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <SkipForward className="h-3 w-3" />
                            {row.skipReason}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Action bar */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{parseResult.validRows}</strong>{" "}
              prospects will be imported as{" "}
              <Badge
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
              >
                New Leads
              </Badge>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={parseResult.validRows === 0}>
                Import {parseResult.validRows} Prospects
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Step 3: Importing ── */}
      {step === "importing" && (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
          <h3 className="text-base font-semibold">Importing prospects...</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This may take a moment for large files. Do not close the page.
          </p>
        </Card>
      )}

      {/* ── Step 4: Done ── */}
      {step === "done" && importResult && (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold">Import Complete</h3>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border px-6 py-3 text-center">
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {importResult.imported}
              </p>
              <p className="text-xs text-muted-foreground">Imported</p>
            </div>
            <div className="rounded-lg border px-6 py-3 text-center">
              <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                {importResult.skipped}
              </p>
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="mt-4 w-full max-w-md rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-left text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-destructive">
                {importResult.errors.length} error(s):
              </p>
              <ul className="list-inside list-disc space-y-0.5">
                {importResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {importResult.errors.length > 5 && (
                  <li>...and {importResult.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={reset}>
              Import Another
            </Button>
            <Button onClick={() => router.push("/new-leads")}>
              View New Leads
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
