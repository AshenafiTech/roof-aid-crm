"use client";

import { useState } from "react";
import { Download, ExternalLink, FileWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  unsignedUrl: string | null;
  signedUrl: string | null;
  defaultView?: "unsigned" | "signed";
};

export function PdfFrame({ unsignedUrl, signedUrl, defaultView }: Props) {
  const initial: "unsigned" | "signed" =
    defaultView ?? (signedUrl ? "signed" : "unsigned");
  const [view, setView] = useState<"unsigned" | "signed">(initial);

  const url = view === "signed" ? signedUrl : unsignedUrl;
  const hasBoth = !!signedUrl && !!unsignedUrl;

  if (!url) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <FileWarning className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">PDF unavailable</p>
        <p className="text-xs text-muted-foreground">
          The file hasn&apos;t been uploaded to storage yet.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          {hasBoth ? (
            <div className="inline-flex rounded-md border bg-background p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setView("unsigned")}
                className={`rounded px-2.5 py-1 transition-colors ${
                  view === "unsigned"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Unsigned
              </button>
              <button
                type="button"
                onClick={() => setView("signed")}
                className={`rounded px-2.5 py-1 transition-colors ${
                  view === "signed"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Signed
              </button>
            </div>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">
              {view === "signed" ? "Signed copy" : "Unsigned copy"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button asChild size="sm" variant="ghost" className="h-8">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open in tab
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8">
            <a href={url} download>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </a>
          </Button>
        </div>
      </div>
      <iframe
        key={url}
        src={url}
        title={view === "signed" ? "Signed PDF" : "Unsigned PDF"}
        className="h-[720px] w-full bg-muted/10"
      />
    </Card>
  );
}
