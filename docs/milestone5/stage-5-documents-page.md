# Stage 5 — Document Workflow + Documents Page

**Goal:** A "New Document" workflow on every prospect — pick a template, fill the field form, click Generate, watch the row appear with a downloadable PDF. A `/documents` index page grouped by prospect, with upload, download (signed URL), and admin-only delete. The Documents tab on the prospect detail page renders the same data, filtered to that prospect.

**Outcome:** Telefonistas can produce a 3rd Party Authorization in 15 seconds from a prospect's profile, hand the link to a rufero, and forget about it. Admins can audit every doc ever generated for any prospect.

**Estimated time:** 1.5 days

---

## 1. Why this stage matters

Stage 4 built the engine. Stage 5 builds the dashboard. Without this stage:

- The only way to test Stage 4 is `curl` — not viable for the team or the demo.
- Stage 6 (e-signature) has nowhere to **open from**. The signing page needs a list of unsigned documents to land in.
- Mobile (Stage 8) needs a server-side "create document for this signed inspection" path, which the Stage 5 server action provides.

---

## 2. Database — no schema changes

Everything Stage 5 needs landed in Stage 4. This stage is UI + server actions only.

---

## 3. Server actions

### 3.1 `createDocument`

```ts
// apps/web/app/actions/documents.ts

'use server';

export async function createDocument(input: {
  prospectId: string;
  templateKind: 'authorization' | 'acv_contract' | 'rcv_contract';
  fields?: Record<string, string | number>;
}): Promise<Result<{ documentId: string }>> {
  const supabase = await createServerClient();

  // Server actions call the Edge Function with the user's JWT — RLS still applies.
  const { data, error } = await supabase.functions.invoke('generate-pdf', {
    body: {
      prospect_id: input.prospectId,
      template_kind: input.templateKind,
      fields: input.fields ?? {},
    },
  });

  if (error) return { error: { code: 'generate_failed', message: error.message } };

  revalidatePath(`/prospects/${input.prospectId}`);
  revalidatePath('/documents');
  return { data: { documentId: data.document.id } };
}
```

### 3.2 `uploadDocument`

Uploading a pre-existing PDF (e.g., a signed paper contract scanned by the office). The row gets `template_kind = 'upload'` and `status = 'uploaded'`. No PDF generation — just direct file upload + row.

```ts
export async function uploadDocument(input: {
  prospectId: string;
  file: File;             // FormData payload, not a raw bytes blob
  displayName: string;
}): Promise<Result<{ documentId: string }>> {
  if (input.file.size > 25 * 1024 * 1024) {
    return { error: { code: 'too_large', message: 'Files must be under 25 MB' } };
  }
  if (input.file.type !== 'application/pdf') {
    return { error: { code: 'not_pdf', message: 'PDFs only' } };
  }
  // ...
}
```

### 3.3 `getDocumentSignedUrl`

```ts
export async function getDocumentSignedUrl(documentId: string): Promise<Result<{ url: string }>> {
  const supabase = await createServerClient();
  const { data: doc, error } = await supabase
    .from('documents')
    .select('storage_path, tenant_id')
    .eq('id', documentId)
    .single();
  if (error || !doc) return { error: { code: 'not_found' } };

  const { data: signed, error: sErr } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 60 * 60);   // 1-hour
  if (sErr) return { error: { code: 'signed_url_failed', message: sErr.message } };

  return { data: { url: signed.signedUrl } };
}
```

> The 1-hour TTL is short enough to limit harm if a URL leaks, long enough to let a homeowner click an emailed link comfortably. Renewing is cheap (just call the action again).

### 3.4 `deleteDocument` (admin / owner only)

```ts
export async function deleteDocument(documentId: string): Promise<Result<void>> {
  const role = await getUserRole();
  if (!['admin', 'owner'].includes(role)) {
    return { error: { code: 'forbidden' } };
  }

  // Soft-delete the row, hard-delete the file. The row stays for audit.
  // (We never lose the metadata; we lose the binary.)
  // ...
}
```

> Hard-deleting the PDF file is irreversible. Show a strong confirm modal ("Type DELETE to confirm"). Document the trade-off: file gone, audit row stays.

---

## 4. Web — Documents page (`/documents`)

### 4.1 Route

[apps/web/app/(dashboard)/documents/page.tsx](../../apps/web/app/(dashboard)/documents/page.tsx) — Server Component for initial fetch.

URL params:
- `?prospect=<id>` — filter to one prospect
- `?status=generated|sent|signed|all` (default: all)
- `?type=authorization|acv_contract|rcv_contract|upload|all` (default: all)
- `?q=<text>` — fuzzy search by prospect name

### 4.2 Layout

- Page header: "Documents" + count + **Upload PDF** button (right-aligned)
- Filter bar: prospect dropdown, status select, type select, search input
- Table (DataTable, reused from M2's shared component):
  - Prospect name (link)
  - Template type (badge)
  - Status badge (color: generated = gray, sent = blue, signed = green, failed = red, uploaded = neutral)
  - Created at (relative + tooltip with absolute)
  - Created by (avatar + name)
  - Page count
  - Actions: Download · View signed (if status=signed and has child) · Sign (if status=generated, role-gated) · Delete (admin only)

### 4.3 Grouping

When `?prospect=` is set, render a single section. Otherwise, the table is flat by default but offers a "Group by prospect" toggle (URL: `?group=prospect`) — sectioned headers per prospect, sorted by latest activity.

### 4.4 Empty state

"No documents yet. Generate one from a prospect's profile." with a link to `/prospects`.

---

## 5. Web — prospect detail "Documents" tab

The existing prospect-detail page already has tab placeholders from M2. Stage 5 wires up the Documents tab:

```tsx
// apps/web/app/(dashboard)/prospects/[id]/(tabs)/documents/page.tsx

export default async function DocumentsTab({ params }) {
  const supabase = await createServerClient();
  const { data: documents } = await supabase
    .from('documents')
    .select('*, created_by_user:users!created_by(first_name, last_name, avatar_url)')
    .eq('prospect_id', params.id)
    .order('created_at', { ascending: false });

  return (
    <div>
      <SectionHeader title="Documents" action={<NewDocumentButton prospectId={params.id} />} />
      <DocumentList documents={documents} prospectId={params.id} />
    </div>
  );
}
```

`<NewDocumentButton />` opens a modal with template picker → field form → submit.

### 5.1 New Document modal

Two-step:

1. **Template picker** — three big cards (Authorization / ACV / RCV) with one-line descriptions. Click to advance.
2. **Field form** — template-specific. For Authorization: insurance carrier (text), claim number (text). For ACV / RCV: deductible, total job cost, scope of work (multiline). All optional — the template renders placeholders if missing.

Submit calls `createDocument()`. On success, the modal stays open showing a "Document created — download or sign now" view with two buttons (Download / Sign). The list below auto-refreshes via `revalidatePath`.

---

## 6. Mobile — read-only access

M5 doesn't ship a full mobile Documents page. Stage 8's offline inspection flow auto-creates a contract on completion (without UI for picking templates — uses tenant default). But ruferos *can* view existing documents on a prospect's mobile detail page.

The mobile feature already has a Documents tab placeholder from M3. Stage 5 wires it up to the same query the web uses, with download via signed URL.

Tap a document row → opens the PDF in the device's PDF viewer (intent on Android, `UIDocumentInteractionController` on iOS). M6 brings the in-app PDF viewer.

---

## 7. Acceptance criteria

### Web
- [ ] `/documents` lists all docs across all prospects (admin/owner/telefonista)
- [ ] Filter by prospect / status / type all work and persist in URL
- [ ] Group-by-prospect toggle works
- [ ] **New Document** modal: pick template → fill form → submit → row appears within 5 seconds
- [ ] Download → opens the PDF in a new tab via 1-hour signed URL
- [ ] Signed URL expires after 1 hour (test by waiting + clicking again)
- [ ] Upload PDF: enforces 25 MB cap, PDF MIME only
- [ ] Delete: only visible to admin/owner; confirm modal blocks until "DELETE" typed; file removed from Storage, row marked deleted
- [ ] Prospect detail → Documents tab → identical list filtered to this prospect

### Mobile
- [ ] Rufero opens an assigned prospect → Documents tab → sees same docs as web (filtered)
- [ ] Tap a document → opens in device's PDF viewer

### Cross-cutting
- [ ] RLS: tenant B user querying `/documents?prospect=<tenant-A-prospect>` → 0 rows
- [ ] Direct storage URL guess (without signed URL) → 403
- [ ] After delete, the storage URL returns 404 (file actually removed)
- [ ] Activities log records the create / upload / delete actions

---

## 8. Pitfalls to avoid

- **Don't** call `generate-pdf` from the client. Server actions only — keeps the JWT server-side and lets us add audit logging in one place.
- **Don't** expose long-lived signed URLs. 1-hour is the contract; if someone needs to share a doc, they re-fetch the URL.
- **Don't** show the **Sign** action on every row. Only `status='generated'` documents are signable. Hide otherwise.
- **Don't** hard-delete the row when an admin deletes a document. Keep the audit. Only remove the binary.
- **Don't** allow `.pdf` extension as the only file-type check on upload. Sniff MIME (`application/pdf`) and the first 4 bytes (`%PDF`) to reject mislabeled uploads.
- **Don't** preview the PDF in an `<iframe>` of the signed URL on the prospect detail page — it works in Chrome but breaks in Safari and on mobile. Use `<embed>` or PDF.js for cross-browser preview, or just keep download-only in M5.
- **Don't** let the "Group by prospect" toggle re-fetch from the server. The page is paginated; toggle should operate on the already-fetched rows only.
- **Don't** forget the loading state on the New Document modal. PDF generation can take 3–5 seconds; a spinner + disabled button is mandatory.

---

## 9. What ships at end of Stage 5

- 4 server actions: `createDocument`, `uploadDocument`, `getDocumentSignedUrl`, `deleteDocument`
- 1 page: `/documents` with filters, group-by toggle, search
- 1 prospect tab: Documents (wired to the same data)
- 1 modal: New Document (template picker + field form)
- 1 mobile tab: Documents (read + download only)
- Reused DataTable + StatusBadge from M2

Stage 6 picks up the **Sign** action on `status='generated'` rows and the full e-signature canvas.
