import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

import { SigningView } from "./signing-view";

export const metadata = {
  title: "Sign document — Roof-Aid CRM",
};

export default async function SignDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Web is company-sign only — the homeowner signs from the mobile
  // app once the doc is at status='awaiting_homeowner_signature'.
  if (!["owner", "admin", "super_admin"].includes(user.role)) {
    redirect(`/documents/${id}`);
  }

  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, type, status, storage_path, prospect:prospects!prospect_id(id, name, email)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!doc) notFound();
  if (!doc.storage_path) {
    redirect(`/documents/${id}`);
  }
  // The company sign only makes sense once, on a freshly-generated
  // doc. After that, the homeowner takes over on mobile.
  if (doc.status !== "generated") {
    redirect(`/documents/${id}`);
  }

  const prospect = doc.prospect as unknown as {
    id: string;
    name: string;
    email: string | null;
  } | null;

  // Pre-fetch the signed URL on the server — never bind via getDocumentSignedUrl
  // from the client to keep the pattern auditable.
  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60 * 60);

  const defaultCompanySigner =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;

  return (
    <SigningView
      documentId={doc.id}
      pdfUrl={signed?.signedUrl ?? null}
      prospectName={prospect?.name ?? "Homeowner"}
      backHref={prospect ? `/prospects/${prospect.id}?tab=documents` : "/documents"}
      defaultSignerName={defaultCompanySigner}
    />
  );
}
