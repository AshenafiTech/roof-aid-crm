# Fix: PDF preview not rendering on /documents/[id]/sign

## Purpose

When a telefonista clicked **Sign now** on a freshly generated document, the
in-page PDF preview (rendered by `react-pdf`) failed to display. The signed URL
itself was valid — opening it in a new tab worked — but the embedded preview
either spun forever or surfaced a PDF.js parse error.

## Root cause

Two compounding problems in the `apps/web` worker setup:

1. **Missing worker file.** `pdf-preview.tsx` pointed
   `pdfjs.GlobalWorkerOptions.workerSrc` at `/pdfjs/pdf.worker.min.mjs`, but
   nothing copied that file into `apps/web/public/pdfjs/`. The inline comment
   referenced a "postbuild" step that didn't exist. Result: 404 on the worker
   → preview hangs or fails silently.

2. **Version mismatch.** `apps/web` declares `pdfjs-dist@^4.10.38` directly,
   but `react-pdf@9.2.1` pins its own internal copy of `pdfjs-dist@4.8.69`.
   PDF.js refuses to run when the worker bundle and the API library are on
   different versions, so even copying the top-level worker (4.10.38) would
   not have fixed the preview.

The fix has to use the worker bundle that matches the `pdfjs-dist` version
`react-pdf` actually loads at runtime — i.e. the one nested under
`react-pdf`'s resolved package, not the top-level dependency.

## Changes

- **`apps/web/package.json`** — added a `postinstall` script that resolves
  `pdfjs-dist/build/pdf.worker.min.mjs` *from `react-pdf`'s package directory*
  (using `require.resolve` with `paths`) and copies it into
  `public/pdfjs/pdf.worker.min.mjs`. This guarantees the served worker matches
  whatever `react-pdf` is using, even if the top-level `pdfjs-dist` drifts.

- **`apps/web/.gitignore`** — ignore `public/pdfjs/` since it's regenerated
  on every `pnpm install`.

- **`apps/web/app/(dashboard)/documents/[id]/sign/pdf-preview.tsx`** —
  appended `?v=${pdfjs.version}` to the worker URL. The query string acts as
  a cache-buster: if the API version drifts after an upgrade, the browser
  fetches the fresh worker instead of serving a stale (mismatched) one from
  cache.

## Verification

1. `pnpm install` (or run the postinstall command manually) creates
   `apps/web/public/pdfjs/pdf.worker.min.mjs`.
2. Generate a new document → click **Sign now** → the PDF renders in the
   left-hand preview pane, ready for the signature pad below.

## Notes for later

The top-level `pdfjs-dist@^4.10.38` dependency in `apps/web/package.json` is
no longer imported anywhere in app code (only `react-pdf` consumes it,
through its pinned internal version). It can be removed in a follow-up clean
up; we kept it here to minimize the surface area of the fix.
