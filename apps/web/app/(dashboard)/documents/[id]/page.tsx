import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Mail,
  MapPin,
  Pen,
  Phone,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

import { DocumentRowActions } from "@/components/shared/document-actions";
import { DocumentAuditSection } from "@/components/documents/document-audit-section";
import { ResendEmailButton } from "./resend-email";
import { PdfFrame } from "./pdf-frame";

const TYPE_LABEL: Record<string, string> = {
  "3rd_party_auth": "3rd Party Authorization",
  acv_contract: "ACV Contract",
  rcv_contract: "RCV Contract",
  supplement: "Supplement",
  upload: "Uploaded PDF",
};

const STATUS_LABEL: Record<string, string> = {
  generated: "Generated",
  awaiting_homeowner_signature: "Awaiting homeowner",
  signed: "Signed",
};

function formatShort(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ just_signed?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();

  type DocRow = {
    id: string;
    type: string;
    status: string | null;
    storage_path: string | null;
    signed_storage_path: string | null;
    signed_at: string | null;
    page_count: number | null;
    sha256: string | null;
    signed_sha256: string | null;
    created_at: string | null;
    signature_metadata: Record<string, unknown> | null;
    prospect:
      | {
          id: string;
          name: string;
          email: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          phones: string[] | null;
        }
      | null;
  };
  const docRes = await supabase
    .from("documents")
    .select(
      "id, type, status, storage_path, signed_storage_path, signed_at, page_count, sha256, signed_sha256, created_at, signature_metadata, prospect:prospects!prospect_id(id, name, email, address, city, state, zip, phones)",
    )
    .eq("id", id)
    .maybeSingle();
  const doc = docRes.data as unknown as DocRow | null;

  if (!doc) notFound();
  const prospect = doc.prospect;
  const justSigned = sp.just_signed === "1";

  async function signFor(path: string | null) {
    if (!path) return null;
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }
  const [unsignedUrl, signedUrl] = await Promise.all([
    signFor(doc.storage_path),
    signFor(doc.signed_storage_path),
  ]);

  const statusLabel = doc.status ? (STATUS_LABEL[doc.status] ?? doc.status) : "—";
  const createdShort = formatShort(doc.created_at);
  const signedShort = formatShort(doc.signed_at);
  const propAddress = prospect
    ? [prospect.address, prospect.city, prospect.state, prospect.zip]
        .filter(Boolean)
        .join(", ")
    : "";
  const primaryPhone = prospect?.phones?.[0] ?? null;

  return (
    <div className="space-y-4">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground"
      >
        <Link
          href={
            prospect
              ? `/prospects/${prospect.id}?tab=documents`
              : "/documents"
          }
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Link>
      </Button>

      {justSigned && (
        <Card className="flex items-start gap-3 border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <div className="text-sm">
            <p className="font-semibold text-emerald-900 dark:text-emerald-100">
              Document signed
            </p>
            <p className="text-emerald-800 dark:text-emerald-200">
              {prospect?.email
                ? `A copy is being emailed to ${prospect.email}.`
                : "No email on file — download the signed PDF below to share manually."}
            </p>
          </div>
        </Card>
      )}

      {/* Header card — title + status + customer info + actions */}
      <Card className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {TYPE_LABEL[doc.type] ?? doc.type}
              </h1>
              <Badge variant="outline">{statusLabel}</Badge>
              {doc.status === "awaiting_homeowner_signature" && (
                <span className="text-xs text-muted-foreground">
                  — homeowner signs on the mobile app
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {createdShort && <>Created {createdShort}</>}
              {signedShort && <> · Signed {signedShort}</>}
              {doc.page_count != null && (
                <>
                  {" · "}
                  {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {doc.status === "generated" &&
              ["owner", "admin", "super_admin"].includes(user.role) && (
                <Button asChild size="sm">
                  <Link href={`/documents/${doc.id}/sign`}>
                    <Pen className="mr-1.5 h-4 w-4" />
                    Sign as company
                  </Link>
                </Button>
              )}
            {doc.status === "signed" && prospect?.email && (
              <ResendEmailButton signedDocId={doc.id} email={prospect.email} />
            )}
            <DocumentRowActions
              document={{
                id: doc.id,
                status: doc.status,
                storage_path: doc.storage_path,
                signed_storage_path: doc.signed_storage_path,
              }}
              currentUserRole={user.role}
            />
          </div>
        </div>

        {/* Customer info block — pulled from the prospect record */}
        {prospect ? (
          <div className="grid gap-2 rounded-md border bg-muted/30 px-4 py-3 text-sm sm:grid-cols-2">
            <CustomerField label="Homeowner">
              <Link
                href={`/prospects/${prospect.id}`}
                className="font-medium text-foreground hover:underline"
              >
                {prospect.name}
              </Link>
            </CustomerField>
            <CustomerField label="Property address" icon={MapPin}>
              {propAddress || "—"}
            </CustomerField>
            <CustomerField label="Phone" icon={Phone}>
              {primaryPhone ? (
                <a
                  href={`tel:${primaryPhone}`}
                  className="hover:underline"
                >
                  {primaryPhone}
                </a>
              ) : (
                "—"
              )}
            </CustomerField>
            <CustomerField label="Email" icon={Mail}>
              {prospect.email ? (
                <a
                  href={`mailto:${prospect.email}`}
                  className="truncate hover:underline"
                >
                  {prospect.email}
                </a>
              ) : (
                "—"
              )}
            </CustomerField>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Prospect deleted.</p>
        )}
      </Card>

      {/* PDF — focal point of the page */}
      <PdfFrame
        unsignedUrl={unsignedUrl}
        signedUrl={signedUrl}
        defaultView={signedUrl ? "signed" : "unsigned"}
      />

      {/* Verification hashes — collapsed by default; for audit checks only */}
      <details className="group rounded-md border bg-muted/20 px-4 py-2 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          File integrity (SHA-256)
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Unsigned</dt>
          <dd>
            <code className="break-all">{doc.sha256 ?? "—"}</code>
          </dd>
          <dt className="text-muted-foreground">Signed</dt>
          <dd>
            <code className="break-all">{doc.signed_sha256 ?? "—"}</code>
          </dd>
        </dl>
      </details>

      <DocumentAuditSection documentId={doc.id} />

      {doc.signature_metadata && (
        <details className="group rounded-md border bg-muted/20 px-4 py-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            Signature metadata (raw)
          </summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-background p-3 text-xs">
            {JSON.stringify(doc.signature_metadata, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function CustomerField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <div className="mt-0.5 truncate">{children}</div>
    </div>
  );
}
