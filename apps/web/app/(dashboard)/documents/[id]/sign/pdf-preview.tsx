"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// pdf.worker.min.mjs lives in pdfjs-dist's dist folder; we copy it to /public
// during postbuild OR fall back to the version-pinned ESM module URL. The
// `react-pdf` README recommends self-hosting, which we do via /public/pdfjs.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

export function PdfPreview({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    function onResize() {
      setWidth(Math.min(900, Math.max(320, window.innerWidth - 64)));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Probe the URL once at mount so we can surface HTTP-level issues
  // (404, CORS, expired token) separately from PDF-parse errors.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(url, { method: "GET" });
        console.log("[PdfPreview] HEAD-ish probe", {
          url,
          status: res.status,
          contentType: res.headers.get("content-type"),
          contentLength: res.headers.get("content-length"),
        });
        if (!alive) return;
        if (!res.ok) {
          setLoadError(`Storage returned HTTP ${res.status}`);
        }
      } catch (err) {
        console.error("[PdfPreview] fetch probe failed", err);
        if (alive)
          setLoadError(
            err instanceof Error ? `Network: ${err.message}` : "Network error",
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <div className="mx-auto max-w-[900px]">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => {
          console.log("[PdfPreview] Document loaded", { numPages });
          setLoadError(null);
          setNumPages(numPages);
        }}
        onLoadError={(err) => {
          console.error("[PdfPreview] Document load error", err);
          setLoadError(err?.message || "Unknown PDF load error");
        }}
        onSourceError={(err) => {
          console.error("[PdfPreview] Document source error", err);
          setLoadError(err?.message || "Unknown PDF source error");
        }}
        loading={
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        }
        error={
          <div className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-red-600">
            <p className="font-medium">Couldn&apos;t load PDF.</p>
            {loadError && (
              <p className="break-all text-xs opacity-80">{loadError}</p>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline"
            >
              Try opening the file directly
            </a>
          </div>
        }
      >
        {Array.from({ length: numPages ?? 0 }).map((_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            width={width}
            className="mb-4 overflow-hidden rounded border bg-white shadow-sm"
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        ))}
      </Document>
    </div>
  );
}
