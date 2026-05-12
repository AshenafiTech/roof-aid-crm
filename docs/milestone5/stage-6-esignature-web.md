# Stage 6 — E-Signature Web Flow

**Goal:** A document generated in Stage 5 gets signed in the browser: scrollable PDF preview at the top, signature pad pinned at the bottom, Clear / Confirm. Confirm → Stage 4's `embed-signature` Edge Function → signed PDF downloadable, document status `signed`, signed PDF auto-emailed to the homeowner via SendGrid (M4 plumbing).

**Outcome:** Roof-Aid replaces DocuSign for single-party signing — no third-party fees, signed-PDF SHA-256 in our database for audit, $4k–$15k/month in DocuSign costs avoided.

**Estimated time:** 1.5 days

---

## 1. Why this stage matters

Stages 4 + 5 produced unsigned PDFs. Without Stage 6, those PDFs are just files — there's no way to turn them into legally meaningful artifacts inside the platform. Stage 6 is the moment Roof-Aid becomes an end-to-end deal-closing tool.

The technical core is small (canvas → PNG → Edge Function), but the UX has to feel weighty: this is the digital equivalent of putting pen to paper.

---

## 2. Database changes — none

`embed-signature` (Stage 4) does all the DB writes (`documents` row for the signed copy, `signature_metadata`, raw PNG in `signatures/` bucket). Stage 6 is pure web UI + 2 thin server actions.

---

## 3. Server actions

### 3.1 `signDocument`

```ts
// apps/web/app/actions/documents.ts (additions)

'use server';

export async function signDocument(input: {
  documentId: string;
  signaturePngBase64: string;
  signerName: string;
}): Promise<Result<{ signedDocumentId: string }>> {
  const supabase = await createServerClient();
  const headersList = headers();

  const { data, error } = await supabase.functions.invoke('embed-signature', {
    body: {
      document_id: input.documentId,
      signature_png_base64: input.signaturePngBase64,
      signer_name: input.signerName,
      device_metadata: {
        // The Edge Function overwrites IP from x-forwarded-for; we still
        // forward user-agent and device type for completeness.
        user_agent: headersList.get('user-agent') ?? undefined,
        device_type: 'web',
      },
    },
  });

  if (error) return { error: { code: 'sign_failed', message: error.message } };

  // Auto-email the signed PDF to the homeowner.
  await emailSignedDocument(input.documentId, data.signed_document.id);

  revalidatePath(`/documents/${input.documentId}/sign`);
  return { data: { signedDocumentId: data.signed_document.id } };
}
```

### 3.2 `emailSignedDocument`

A second server action (called inline from `signDocument`, but also exposed for "Resend email" buttons):

```ts
export async function emailSignedDocument(
  originalDocId: string,
  signedDocId: string
): Promise<Result<void>> {
  const supabase = await createServerClient();

  const { data: doc } = await supabase
    .from('documents')
    .select(`
      id, storage_path, template_kind,
      prospect:prospects!inner(id, name, email),
      tenant:tenants!inner(name)
    `)
    .eq('id', signedDocId)
    .single();

  if (!doc?.prospect.email) {
    return { error: { code: 'no_email', message: 'No homeowner email on file' } };
  }

  // Re-fetch the signed PDF bytes.
  const { data: blob } = await supabase.storage
    .from('documents')
    .download(doc.storage_path);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // Use the M4 SendGrid wrapper.
  await sendEmail({
    to: doc.prospect.email,
    subject: `Your signed ${templateKindLabel(doc.template_kind)} from ${doc.tenant.name}`,
    body: `Hi ${doc.prospect.name},\n\nAttached is your signed ${templateKindLabel(doc.template_kind)}. Keep this for your records.\n\nThank you,\n${doc.tenant.name}`,
    attachments: [
      {
        content: btoa(String.fromCharCode(...bytes)),
        filename: `${templateKindLabel(doc.template_kind)}-signed.pdf`,
        type: 'application/pdf',
        disposition: 'attachment',
      },
    ],
    tenant_id: doc.tenant.id,
    metadata: { kind: 'signed_document_delivery', document_id: signedDocId },
  });

  // Mark the original doc 'sent' (already done by embed-signature, but idempotent).
  await supabase.from('documents').update({ status: 'sent' }).eq('id', originalDocId);

  return { data: undefined };
}
```

---

## 4. Signing page UI

### 4.1 Route

[apps/web/app/(dashboard)/documents/[id]/sign/page.tsx](../../apps/web/app/(dashboard)/documents/[id]/sign/page.tsx) — Server Component that fetches the document, refuses (404 / redirect) if not in `generated` status, otherwise renders the client signing component.

### 4.2 Layout

Full-viewport, two-pane:

```
+------------------------------------------------+
| ← Back to Documents          [Doc title]       |  ← top bar
+------------------------------------------------+
|                                                 |
|  PDF preview (scrollable, ~70vh)                |
|                                                 |
|  [PDF.js or react-pdf rendered preview]         |
|                                                 |
+------------------------------------------------+
|  Homeowner signature                            |
|  +---------------------------------------+ Clear|
|  | (signature pad canvas, ~25vh tall)    |     |
|  +---------------------------------------+     |
|  Signer name: [____________________]           |
|                       [Cancel] [Confirm & Sign] |
+------------------------------------------------+
```

### 4.3 Components

#### `<SigningView />` (client)

```tsx
'use client';

import { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

export function SigningView({ document, prospect }: Props) {
  const padRef = useRef<SignatureCanvas>(null);
  const [signerName, setSignerName] = useState(prospect.name);
  const [submitting, setSubmitting] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  async function onConfirm() {
    if (!padRef.current || padRef.current.isEmpty()) return;
    if (!signerName.trim()) return;

    setSubmitting(true);
    try {
      const pngDataUrl = padRef.current.getTrimmedCanvas().toDataURL('image/png');
      const base64 = pngDataUrl.split(',')[1];

      const result = await signDocument({
        documentId: document.id,
        signaturePngBase64: base64,
        signerName: signerName.trim(),
      });
      if (result.error) {
        toast.error(result.error.message);
        setSubmitting(false);
        return;
      }
      // Success — redirect to a "Signed!" confirmation page.
      router.push(`/documents/${result.data.signedDocumentId}?just_signed=1`);
    } catch (e) {
      toast.error(`Sign failed: ${e}`);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <PdfPreview storagePath={document.storage_path} />
      <SignatureBlock
        padRef={padRef}
        onChange={() => setHasDrawn(!padRef.current?.isEmpty())}
        signerName={signerName}
        setSignerName={setSignerName}
        canSubmit={hasDrawn && signerName.trim().length > 0 && !submitting}
        onConfirm={onConfirm}
        onClear={() => { padRef.current?.clear(); setHasDrawn(false); }}
        submitting={submitting}
      />
    </div>
  );
}
```

#### `<PdfPreview />`

PDF rendering options:
- **PDF.js** (Mozilla) — battle-tested, but ~500 KB. Recommended.
- **react-pdf** — wraps PDF.js with React idioms. Easier API.
- **`<embed>` / `<iframe>`** — browser native, free, but inconsistent UX across browsers.

Recommend **react-pdf** for the developer ergonomics. Render all pages in a scrollable container. Add a zoom slider for desktop usability.

```tsx
import { Document as PdfDoc, Page as PdfPage, pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';   // self-hosted

function PdfPreview({ storagePath }: { storagePath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    getDocumentSignedUrl(storagePath).then(r => r.data && setUrl(r.data.url));
  }, [storagePath]);

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-100 p-4">
      {url && (
        <PdfDoc file={url} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
          {Array.from({ length: numPages }).map((_, i) => (
            <PdfPage key={i} pageNumber={i + 1} width={800} className="mb-4 shadow" />
          ))}
        </PdfDoc>
      )}
    </div>
  );
}
```

> Self-host the PDF.js worker (`/public/pdfjs/pdf.worker.min.js`) — avoids a 3rd-party CDN dependency.

#### `<SignatureBlock />`

The signature pad — `react-signature-canvas` is the best-maintained lib. Canvas-based, mouse + touch + stylus all work.

```tsx
<SignatureCanvas
  ref={padRef}
  penColor="#1F2937"            // gray-800
  canvasProps={{
    className: 'h-32 w-full rounded border bg-white',
  }}
  onEnd={onChange}              // fires when user lifts pen/mouse
/>
```

The canvas auto-resizes to its container. For high-DPI screens, the library handles `devicePixelRatio` correctly — no manual scaling.

### 4.4 "Just signed" confirmation page

After redirect to `/documents/{signedDocumentId}?just_signed=1`:

```
✓ Document signed

[Big checkmark icon]

We've emailed a copy of the signed PDF to:
  {homeowner_email}

[Download signed PDF] [Back to prospect] [Resend email]
```

The `[Resend email]` button calls `emailSignedDocument()` again — useful if the first email bounced.

---

## 5. Audit + compliance details

### 5.1 Captured metadata (already in `signature_metadata`)

```jsonc
{
  "signed_at": "2026-05-14T20:32:17Z",
  "ip": "203.0.113.42",
  "user_agent": "Mozilla/5.0 ...",
  "device_type": "web",
  "sha256": "e3b0c44298fc1c149afbf4c8996fb924...",
  "signer_name": "Jane Smith",
  "signature_image_sha256": "5d41402abc4b2a76b9719d911017c592..."
}
```

### 5.2 Audit query example

```sql
-- Find all documents signed by a homeowner whose name we have:
SELECT d.id, d.created_at, d.sha256, d.signature_metadata->>'signed_at' AS signed_at
FROM documents d
WHERE d.signature_metadata->>'signer_name' ILIKE 'Jane Smith%'
  AND d.status = 'signed'
ORDER BY d.created_at DESC;
```

### 5.3 Re-rendering a signed PDF (M7+ feature, but the data is here)

The raw PNG in `signatures/{tenant}/{doc_id}.png` + the unsigned PDF (still in storage as `parent_document_id`'s file) are enough to re-stamp with an updated template later. We do not implement re-render in M5.

---

## 6. Acceptance criteria

- [ ] Document in `status='generated'` shows a **Sign** action in the Documents list + tab
- [ ] Document in `status='signed'` does **not** show the Sign action
- [ ] `/documents/{id}/sign` for a non-`generated` doc → redirect to the document view with a toast "Already signed"
- [ ] Signing page: PDF preview renders all pages in a scrollable container
- [ ] Signature pad accepts mouse + touch input; line is smooth (anti-aliased)
- [ ] Clear button wipes the pad immediately
- [ ] Confirm button disabled until the pad has at least one stroke AND signer name is non-empty
- [ ] Confirm → loading state ~2–4s → redirect to confirmation page
- [ ] After redirect: signed PDF appears in the parent prospect's Documents tab with status `signed`
- [ ] Homeowner email contains the signed PDF as an attachment
- [ ] `documents.signature_metadata` populated with IP, UA, device, hashes
- [ ] No-email prospect: still signs OK; confirmation page shows "No email on file — download to share manually" instead of "We've emailed…"
- [ ] Re-submitting the same signature → `embed-signature` rejects with `invalid_document_state` (original is already `sent`); UI shows "Already signed"
- [ ] Mobile-web (responsive): signature pad usable on a phone in Chrome / Safari — at least 200x800 px viewport works

---

## 7. Pitfalls to avoid

- **Don't** send the raw `getDataURL()` from the un-trimmed canvas. Use `getTrimmedCanvas().toDataURL()` — strips the white margin and reduces payload by ~5–10x.
- **Don't** use a CDN-hosted PDF.js worker. Bundle / self-host. CDNs go down at the worst times.
- **Don't** allow the Confirm button to fire while submission is in flight. A double-click without disable would call `embed-signature` twice; the second call would 400, but the user sees an error briefly. Disable the button immediately on click.
- **Don't** clear the pad when the user clicks Confirm. Keep the strokes visible during the loading state — the redirect handles cleanup.
- **Don't** trust the client's `signer_name`. The server doesn't have a great way to validate this (it's a free-text field), but it should at least reject empty / whitespace-only / suspiciously long strings.
- **Don't** show the homeowner's email in the "We've emailed to" line if it's a typo'd or invalid format — the email won't deliver, and the user has no recourse. Better: server returns the email it actually sent to, after validation.
- **Don't** assume the signed PDF fits in a single email. If a tenant uses Premier RCV which is 5 pages, attachment is ~200 KB — still fine. But document the 5 MB SendGrid attachment cap for future templates.
- **Don't** let the page work without internet. The PDF preview requires the signed URL to load; if offline, render an explicit "Connection lost — try again" instead of a half-broken page.
- **Don't** auto-redirect on success without showing the confirmation page. Roofers want the moment of "done" — instant redirect feels jumpy.
- **Don't** put the signature pad inside an `<iframe>` or any element that swallows touch events on iOS.

---

## 8. What ships at end of Stage 6

- 2 server actions: `signDocument`, `emailSignedDocument`
- 1 signing page route: `/documents/[id]/sign`
- 3 client components: `SigningView`, `PdfPreview`, `SignatureBlock`
- 1 confirmation page: `?just_signed=1` view on the document page
- Self-hosted PDF.js worker in `/public/pdfjs/`
- New dep: `react-signature-canvas`, `react-pdf`, `pdfjs-dist`

Stage 7 picks up the mobile inspection flow; Stage 8 stitches the mobile signing flow to this stage's `embed-signature` Edge Function.
