import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Pen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

import { DocumentRowActions } from "@/components/shared/document-actions";
import { ResendEmailButton } from "./resend-email";
import { PdfFrame } from "./pdf-frame";

const TYPE_LABEL: Record<string, string> = {
  "3rd_party_auth": "3rd Party Authorization",
  acv_contract: "ACV Contract",
  rcv_contract: "RCV Contract",
  supplement: "Supplement",
  upload: "Uploaded PDF",
};

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
      | { id: string; name: string; email: string | null }
      | null;
  };
  const docRes = await supabase
    .from("documents")
    .select(
      "id, type, status, storage_path, signed_storage_path, signed_at, page_count, sha256, signed_sha256, created_at, signature_metadata, prospect:prospects!prospect_id(id, name, email)",
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

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="h-8 px-2">
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
        <Card className="flex items-start gap-3 border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-900 dark:bg-emerald-950">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-emerald-900 dark:text-emerald-100">
              Document signed
            </h2>
            <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
              {prospect?.email
                ? `A copy is being emailed to ${prospect.email}.`
                : "No email on file — download the signed PDF below to share manually."}
            </p>
          </div>
        </Card>
      )}

      <Card className="space-y-4 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Type</p>
            <h1 className="text-lg font-semibold">
              {TYPE_LABEL[doc.type] ?? doc.type}
            </h1>
          </div>
          <Badge variant="outline" className="capitalize">
            {doc.status ?? "—"}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Detail label="Prospect">
            {prospect ? (
              <Link
                href={`/prospects/${prospect.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                {prospect.name}
              </Link>
            ) : (
              "(deleted)"
            )}
          </Detail>
          <Detail label="Created">
            {doc.created_at
              ? new Date(doc.created_at).toLocaleString()
              : "—"}
          </Detail>
          <Detail label="Pages">{doc.page_count ?? "—"}</Detail>
          <Detail label="Signed at">
            {doc.signed_at
              ? new Date(doc.signed_at).toLocaleString()
              : "—"}
          </Detail>
          <Detail label="Unsigned SHA-256">
            <code className="break-all text-xs">{doc.sha256 ?? "—"}</code>
          </Detail>
          <Detail label="Signed SHA-256">
            <code className="break-all text-xs">{doc.signed_sha256 ?? "—"}</code>
          </Detail>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {doc.status === "generated" && (
            <Button asChild size="sm">
              <Link href={`/documents/${doc.id}/sign`}>
                <Pen className="mr-1.5 h-4 w-4" />
                Sign now
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
      </Card>

      <PdfFrame
        unsignedUrl={unsignedUrl}
        signedUrl={signedUrl}
        defaultView={signedUrl ? "signed" : "unsigned"}
      />

      {doc.signature_metadata && (
        <Card className="space-y-2 px-5 py-4">
          <h2 className="text-sm font-medium">Signature audit</h2>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
            {JSON.stringify(doc.signature_metadata, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}
