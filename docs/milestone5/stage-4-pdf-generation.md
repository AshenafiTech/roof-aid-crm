# Stage 4 — PDF Generation Edge Function

**Goal:** A single Edge Function (`generate-pdf`) that produces a Roof-Aid-branded PDF from one of three templates (3rd Party Authorization, ACV Contract, RCV Contract), stores it in `documents/{tenant_id}/...`, and returns the row id. A second Edge Function (`embed-signature`) takes a raw signature PNG and stamps it into a previously generated PDF, producing the *signed* version as a separate file.

**Outcome:** Every PDF on the platform is server-produced. The client never touches templates, never assembles bytes, never has the opportunity to tamper. The signed-PDF SHA-256 is recorded for audit.

**Estimated time:** 1.5 days

---

## 1. Why this stage matters

Three of M5's stages depend on this one:

- **Stage 5** consumes `generate-pdf` for the "Create document" workflow.
- **Stage 6** consumes `embed-signature` for the web e-signature flow.
- **Stage 8** consumes both for the mobile inspection-signature flow.

Done badly, every consumer pays for it. Done well, it disappears.

The Stage 4 deliverable is **just the Edge Functions + the storage layout + the metadata schema**. No UI work.

---

## 2. Pre-stage spike: pdf-lib on Deno

Before writing the function, do a 1-hour spike:

```ts
// supabase/functions/_spikes/pdf-hello/index.ts
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

Deno.serve(async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);  // Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello from Deno", { x: 50, y: 750, size: 24, font, color: rgb(0, 0, 0) });
  const bytes = await pdf.save();
  return new Response(bytes, { headers: { "Content-Type": "application/pdf" } });
});
```

Deploy, hit it, open the PDF. If it works, proceed. If it fails (Deno + pdf-lib has had historical hiccups), switch to one of:

- `@react-pdf/renderer` running in a Node-runtime Edge Function (if Supabase offers it).
- `pdfkit` directly (simpler, lower-level).

Pinning to `pdf-lib@1.17.1` because that's the last published version (as of 2025) with good Deno-on-esm.sh support.

---

## 3. Database changes

### 3.1 Migration: `0XX_m5_documents_metadata.sql`

`documents` already exists (M1). Stage 4 adds the metadata columns the signing flow needs:

```sql
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS template_kind text
    CHECK (template_kind IN ('authorization', 'acv_contract', 'rcv_contract', 'upload')),
  ADD COLUMN IF NOT EXISTS parent_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_path text NOT NULL,           -- {tenant}/documents/{prospect}/{doc}.pdf
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS page_count int,
  ADD COLUMN IF NOT EXISTS template_data jsonb,                   -- raw payload used to render
  ADD COLUMN IF NOT EXISTS signature_metadata jsonb;              -- {signed_at, ip, user_agent, device_type, sha256}

CREATE INDEX documents_prospect_idx ON documents (prospect_id, created_at DESC);
CREATE INDEX documents_parent_idx ON documents (parent_document_id);

-- Status values: generated | sent | signed | failed
ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN ('generated', 'sent', 'signed', 'failed', 'uploaded'));
```

> `signature_metadata` is null until Stage 6 / Stage 8 stamps it. Stage 4 only writes `template_data`.

### 3.2 Storage layout

```
documents/                                      ← bucket
  {tenant_id}/
    documents/
      {prospect_id}/
        {document_id}-unsigned.pdf              ← from generate-pdf
        {document_id}-signed.pdf                ← from embed-signature (new row, parent_document_id = ↑)

signatures/                                     ← bucket (new in Stage 4 pre-reqs)
  {tenant_id}/
    {document_id}.png                           ← raw signature image, kept for re-render
```

Tenant isolation enforced by Storage RLS (already in place from M1). Each Edge Function asserts `tenant_id` matches the caller's tenant before writing.

---

## 4. Edge Function — `generate-pdf`

### 4.1 Contract

```ts
// POST /functions/v1/generate-pdf
// Auth: user JWT
{
  prospect_id: string;
  template_kind: 'authorization' | 'acv_contract' | 'rcv_contract';
  fields?: {
    insurance_company?: string;
    claim_number?: string;
    loss_date?: string;            // ISO
    deductible?: number;
    // ...template-specific
  };
}

// Response
{
  document: {
    id: string;
    storage_path: string;
    sha256: string;
    page_count: number;
    status: 'generated';
  };
}
```

### 4.2 Algorithm

```ts
// supabase/functions/generate-pdf/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { renderAuthorization, renderAcv, renderRcv } from "./templates/index.ts";

Deno.serve(async (req) => {
  const { user, supabase } = await getAuthedClient(req);
  const input = await req.json();

  // 1. Load prospect + tenant context (RLS ensures cross-tenant safety).
  const { data: prospect, error: pErr } = await supabase
    .from("prospects")
    .select(`
      id, tenant_id, name, address, city, state, zip, phones, email,
      tenant:tenants!inner(id, name, logo_url, address, timezone, document_settings)
    `)
    .eq("id", input.prospect_id)
    .single();
  if (pErr) return jsonError(404, "prospect_not_found");

  // 2. Pre-create the document row so we have an id for the storage path.
  const { data: doc, error: dErr } = await supabase
    .from("documents")
    .insert({
      tenant_id: prospect.tenant_id,
      prospect_id: prospect.id,
      template_kind: input.template_kind,
      template_data: input.fields ?? {},
      status: "generated",
      storage_path: "",      // filled in step 5
      created_by: user.id,
    })
    .select()
    .single();
  if (dErr) return jsonError(500, dErr.message);

  // 3. Render PDF bytes by template.
  const renderFns = {
    authorization: renderAuthorization,
    acv_contract:  renderAcv,
    rcv_contract:  renderRcv,
  };
  let bytes: Uint8Array;
  try {
    bytes = await renderFns[input.template_kind]({
      prospect,
      tenant: prospect.tenant,
      fields: input.fields ?? {},
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    await supabase.from("documents").update({ status: "failed" }).eq("id", doc.id);
    return jsonError(500, `render_failed: ${e}`);
  }

  // 4. SHA-256 the bytes for audit.
  const sha256 = await sha256Hex(bytes);

  // 5. Upload.
  const storagePath = `${prospect.tenant_id}/documents/${prospect.id}/${doc.id}-unsigned.pdf`;
  const { error: uErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (uErr) {
    await supabase.from("documents").update({ status: "failed" }).eq("id", doc.id);
    return jsonError(500, `upload_failed: ${uErr.message}`);
  }

  // 6. Finalize row.
  const pdf = await PDFDocument.load(bytes);
  await supabase
    .from("documents")
    .update({
      storage_path: storagePath,
      sha256,
      page_count: pdf.getPageCount(),
    })
    .eq("id", doc.id);

  return Response.json({ document: { ...doc, storage_path: storagePath, sha256, page_count: pdf.getPageCount() } });
});
```

### 4.3 Template structure

Each template is a `(payload) => Uint8Array` function. They share a `drawHeader()` / `drawFooter()` helper for the orange bar + company branding.

```ts
// supabase/functions/generate-pdf/templates/_layout.ts

export async function drawHeader(page: PDFPage, payload: TemplatePayload) {
  const { tenant } = payload;
  page.drawRectangle({
    x: 0, y: page.getHeight() - 60, width: page.getWidth(), height: 60,
    color: rgb(0xE8 / 0xFF, 0x50 / 0xFF, 0x1F / 0xFF),    // #E8501F
  });
  page.drawText(tenant.name, {
    x: 40, y: page.getHeight() - 40, size: 18, color: rgb(1, 1, 1), font: payload.fontBold,
  });
  // Optional: drawImage of tenant.logo_url at top-right.
}

export function drawFooter(page: PDFPage, payload: TemplatePayload) {
  page.drawText("Electronically signed via Roof-Aid CRM", {
    x: 40, y: 30, size: 8, color: rgb(0.4, 0.4, 0.4), font: payload.font,
  });
  page.drawText(`Generated ${formatDate(payload.generated_at, payload.tenant.timezone)}`, {
    x: page.getWidth() - 200, y: 30, size: 8, color: rgb(0.4, 0.4, 0.4), font: payload.font,
  });
}

export function drawHomeownerBlock(page: PDFPage, payload: TemplatePayload, y: number) {
  const { prospect } = payload;
  drawLabel(page, "Homeowner:", 40, y);
  page.drawText(prospect.name, { x: 140, y, size: 11, font: payload.fontBold });
  drawLabel(page, "Address:", 40, y - 20);
  page.drawText(formatAddress(prospect), { x: 140, y: y - 20, size: 11, font: payload.font });
  drawLabel(page, "Phone:", 40, y - 40);
  page.drawText(prospect.phones?.[0] ?? "—", { x: 140, y: y - 40, size: 11, font: payload.font });
}

export function drawSignatureLine(page: PDFPage, payload: TemplatePayload, y: number) {
  // Coordinates here are KEY — embed-signature stamps into this exact box.
  page.drawLine({ start: { x: 60, y }, end: { x: 320, y }, color: rgb(0, 0, 0), thickness: 1 });
  page.drawText("Homeowner signature", { x: 60, y: y - 14, size: 8, font: payload.font });
  page.drawLine({ start: { x: 360, y }, end: { x: 540, y }, color: rgb(0, 0, 0), thickness: 1 });
  page.drawText("Date", { x: 360, y: y - 14, size: 8, font: payload.font });

  // Embed signature target metadata as page annotation — embed-signature reads this.
  // (pdf-lib doesn't have first-class annotation support; we use a hidden text marker.)
  page.drawText(`<<sig:home:${60},${y}>>`, { x: 0, y: 0, size: 0.001, color: rgb(1, 1, 1) });
}
```

### 4.4 Templates — content

#### 3rd Party Authorization

Single page. Body text (canned, with placeholders):

```
I, {homeowner_name}, residing at {address}, hereby authorize {company_name},
its officers, employees, and agents, to act on my behalf with respect to any
and all matters relating to a property insurance claim arising from damage
to my property. This authorization includes communication with my insurance
carrier, adjusters, and inspectors. This authorization remains in effect
until revoked in writing.

Insurance carrier: ___________________________
Claim #: ____________________________________
```

Below the body: signature line + date line.

#### ACV Contract / RCV Contract

Two pages each. Same header / footer / homeowner block. Body text differs (ACV vs RCV roofing-industry language). Signature block at the end of page 2.

> The exact body text for ACV / RCV should come from the **product owner** before implementation. Stage 4 ships with placeholder lorem-ipsum-style scaffolding; the legal text gets dropped in during pre-launch review.

### 4.5 RBAC

`generate-pdf` allowed for `telefonista, admin, owner`. Ruferos generate documents only **as a side-effect of a completed inspection** (Stage 8), through a service-role-gated path — never directly.

```ts
const role = await getUserRole(supabase, user.id);
if (!["telefonista", "admin", "owner"].includes(role)) {
  return jsonError(403, "forbidden");
}
```

---

## 5. Edge Function — `embed-signature`

### 5.1 Contract

```ts
// POST /functions/v1/embed-signature
// Auth: user JWT (web e-sign flow); or service-role with user context (mobile offline → online sync)
{
  document_id: string;       // the unsigned doc to sign
  signature_png_base64: string;
  signer_name: string;       // homeowner's name (printed below the sig)
  device_metadata: {
    ip?: string;
    user_agent?: string;
    device_type?: 'web' | 'mobile_ios' | 'mobile_android';
  };
}

// Response
{
  signed_document: {
    id: string;                 // NEW row, parent_document_id = original
    storage_path: string;
    sha256: string;
    status: 'signed';
  };
}
```

### 5.2 Algorithm

```ts
Deno.serve(async (req) => {
  const { user, supabase } = await getAuthedClient(req);
  const input = await req.json();

  // 1. Load original doc.
  const { data: original } = await supabase
    .from("documents")
    .select("*, prospect:prospects(id, tenant_id, name, email)")
    .eq("id", input.document_id)
    .single();
  if (!original || original.status === "signed") {
    return jsonError(400, "invalid_document_state");
  }

  // 2. Download original PDF bytes.
  const { data: blob } = await supabase.storage
    .from("documents")
    .download(original.storage_path);
  const pdfBytes = new Uint8Array(await blob.arrayBuffer());

  // 3. Decode signature PNG.
  const sigBytes = Uint8Array.from(atob(input.signature_png_base64), c => c.charCodeAt(0));

  // 4. Load PDF, find the <<sig:home:x,y>> marker, embed image at that anchor.
  const pdf = await PDFDocument.load(pdfBytes);
  const sigImage = await pdf.embedPng(sigBytes);
  const lastPage = pdf.getPages()[pdf.getPageCount() - 1];   // signature block is always on the last page
  const sigAnchor = findSignatureAnchor(lastPage);            // returns {x, y} from the marker text
  const sigWidth = 240;
  const sigHeight = sigImage.height * (sigWidth / sigImage.width);
  lastPage.drawImage(sigImage, {
    x: sigAnchor.x,
    y: sigAnchor.y + 2,     // 2px above the line
    width: sigWidth,
    height: Math.min(sigHeight, 56),  // cap height to keep layout
  });
  // Date next to it.
  lastPage.drawText(
    formatDate(new Date().toISOString(), original.template_data?.timezone ?? "UTC"),
    { x: sigAnchor.x + 300, y: sigAnchor.y + 4, size: 11 }
  );
  // Printed signer name beneath signature line.
  lastPage.drawText(input.signer_name, {
    x: sigAnchor.x, y: sigAnchor.y - 26, size: 9,
  });

  const signedBytes = await pdf.save();
  const sha256 = await sha256Hex(signedBytes);

  // 5. Upload signed bytes as a NEW file.
  const signedRow = await createSignedDocumentRow(supabase, original, signedBytes, sha256, {
    signer_name: input.signer_name,
    signed_at: new Date().toISOString(),
    ip: input.device_metadata.ip,
    user_agent: input.device_metadata.user_agent,
    device_type: input.device_metadata.device_type,
    sha256,
  });

  // 6. Save raw sig PNG to signatures bucket.
  await supabase.storage.from("signatures").upload(
    `${original.prospect.tenant_id}/${signedRow.id}.png`,
    sigBytes,
    { contentType: "image/png", upsert: false }
  );

  // 7. Update original to status='signed' (so it doesn't show as "unsigned" anymore).
  await supabase.from("documents").update({ status: "sent" }).eq("id", original.id);

  return Response.json({ signed_document: signedRow });
});
```

### 5.3 Tampering protection

- `embed-signature` rejects if the original PDF's SHA-256 doesn't match `documents.sha256` stored at generation time — proves the bytes weren't swapped between generate and sign.
- Signed PDF's SHA-256 is recorded in the new row's `sha256`. Used for audit comparison.
- The raw signature PNG's SHA-256 also lives in `signature_metadata.signature_image_sha256`.

---

## 6. Acceptance criteria

### `generate-pdf`
- [ ] POST with `template_kind: 'authorization'` + valid `prospect_id` → 200 with `document.id`
- [ ] The returned `storage_path` matches `{tenant_id}/documents/{prospect_id}/{doc_id}-unsigned.pdf`
- [ ] Downloading the file → a valid PDF (opens in Chrome) with orange header, tenant name, homeowner block, signature line, footer
- [ ] `documents.sha256` matches the actual file SHA-256
- [ ] Cross-tenant attempt (Tenant A user, Tenant B prospect_id) → 404 / RLS denies
- [ ] Non-allowed role (rufero) → 403
- [ ] Malformed `fields` → row still saved with empty `template_data`, render uses defaults (forgiving)
- [ ] Render failure → row marked `status='failed'`, 500 response with reason

### `embed-signature`
- [ ] POST with valid `document_id` + base64 PNG → 200 with new `signed_document`
- [ ] Original document's `status` becomes `sent`; new document's `status` is `signed`
- [ ] New document's `parent_document_id` points to the original
- [ ] Downloading the signed PDF → signature visible above the signature line, date filled in, signer name printed
- [ ] Raw PNG accessible at `signatures/{tenant_id}/{signed_doc_id}.png`
- [ ] Calling embed-signature twice on the same document → second call returns `invalid_document_state` (already signed)
- [ ] Cross-tenant attempt → RLS denies

### Storage / audit
- [ ] Both buckets verified RLS-locked: Tenant B user cannot fetch Tenant A's signed PDF or raw signature
- [ ] `signature_metadata` contains `{signed_at, ip, user_agent, device_type, sha256}`
- [ ] Re-computing SHA-256 of the signed PDF matches the stored `sha256`

---

## 7. Pitfalls to avoid

- **Don't** embed the signature on the wrong page. Always the **last** page in M5 (templates are 1–2 pages, signature is at the end). M7's template editor will need a more general approach.
- **Don't** overwrite the unsigned PDF. Always create a new file + new row. Original is the audit trail.
- **Don't** trust `device_metadata.ip` from the client. The Edge Function should read the IP from the request headers (`x-forwarded-for`) and ignore whatever the client sent.
- **Don't** embed the signature at a fixed `(60, 100)` — use the marker anchor. Templates can shift, anchor-based embedding survives template tweaks.
- **Don't** store the signature PNG embedded only in the PDF. The raw PNG is needed for re-render in M7+ (template upgrade flow). Keep both.
- **Don't** use `upsert: true` on storage uploads. PDFs are immutable artifacts; an upsert would silently corrupt the audit trail.
- **Don't** skip the SHA-256 check in `embed-signature`. If someone swaps the file in storage between generate and sign, we need to refuse.
- **Don't** load pdf-lib at the top of every request handler — keep the import top-level, the module is cached across invocations (cold-start hit only).
- **Don't** put the legal contract text in code yet. Use scaffolding; get product/legal sign-off before launch.

---

## 8. What ships at end of Stage 4

- 1 migration: `documents` columns + indexes + status check
- 1 new storage bucket: `signatures` with RLS
- 2 Edge Functions: `generate-pdf`, `embed-signature`
- 3 template renderers: `authorization`, `acv_contract`, `rcv_contract`
- Shared layout helpers: `drawHeader`, `drawFooter`, `drawHomeownerBlock`, `drawSignatureLine`, `findSignatureAnchor`
- SHA-256 + IP audit columns wired in `signature_metadata`

Stages 5 and 6 are the UI on top of this stage; Stage 8 is the mobile consumer.
