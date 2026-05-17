"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  searchProspects,
  uploadDocument,
  type ProspectSearchHit,
} from "./actions";

type ProspectOption = {
  id: string;
  name: string;
};

export function UploadDocumentButton({
  defaultProspectId,
  defaultProspectName,
}: {
  prospects?: ProspectOption[];
  defaultProspectId?: string;
  defaultProspectName?: string;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [prospectId, setProspectId] = useState(defaultProspectId ?? "");
  const [prospectLabel, setProspectLabel] = useState(
    defaultProspectName ?? "",
  );

  // Typeahead state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProspectSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (!open || prospectId) return;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const { results } = await searchProspects({ query });
        setResults(results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, prospectId]);

  // Close results when clicking outside
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!searchBoxRef.current) return;
      if (!searchBoxRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function selectProspect(p: ProspectSearchHit) {
    setProspectId(p.id);
    setProspectLabel(p.name);
    setQuery("");
    setShowResults(false);
  }

  function clearProspect() {
    setProspectId(defaultProspectId ?? "");
    setProspectLabel(defaultProspectName ?? "");
    setQuery("");
  }

  function reset() {
    setFile(null);
    setDisplayName("");
    setProspectId(defaultProspectId ?? "");
    setProspectLabel(defaultProspectName ?? "");
    setQuery("");
    setResults([]);
  }

  function submit() {
    if (!file) {
      toast.error("Pick a PDF");
      return;
    }
    if (!prospectId) {
      toast.error("Select a prospect");
      return;
    }
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("prospectId", prospectId);
        fd.set("displayName", displayName);
        await uploadDocument(fd);
        toast.success("Uploaded");
        reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" size="sm">
        <Upload className="mr-2 h-4 w-4" />
        Upload PDF
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload PDF</DialogTitle>
            <DialogDescription>
              Attach an existing PDF (e.g., a signed paper contract) to a prospect.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!defaultProspectId && (
              <div className="space-y-1.5">
                <Label htmlFor="prospect-search">Prospect</Label>
                {prospectId && prospectLabel ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="flex-1 truncate text-sm">
                      {prospectLabel}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={clearProspect}
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="sr-only">Clear</span>
                    </Button>
                  </div>
                ) : (
                  <div ref={searchBoxRef} className="relative">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="prospect-search"
                        autoComplete="off"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setShowResults(true)}
                        placeholder="Search by name, city, or address"
                        className="pl-9"
                      />
                      {searching && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {showResults && (
                      <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                        {results.length === 0 ? (
                          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {searching
                              ? "Searching…"
                              : query
                              ? "No prospects match"
                              : "Start typing to search"}
                          </p>
                        ) : (
                          results.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectProspect(p);
                              }}
                              className="flex w-full flex-col items-start rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                            >
                              <span className="truncate text-sm font-medium">
                                {p.name}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {[p.address, p.city]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Signed contract"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file">PDF file</Label>
              <Input
                id="file"
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !file}>
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
