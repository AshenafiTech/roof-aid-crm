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
  await getCurrentUser();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, type, status, storage_path, prospect:prospects!prospect_id(id, name, email)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!doc) notFound();
  if (doc.status === "signed") {
    redirect(`/documents/${id}`);
  }
  if (!doc.storage_path) {
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

  return (
    <SigningView
      documentId={doc.id}
      pdfUrl={signed?.signedUrl ?? null}
      prospectName={prospect?.name ?? "Homeowner"}
      prospectEmail={prospect?.email ?? null}
      backHref={prospect ? `/prospects/${prospect.id}?tab=documents` : "/documents"}
    />
  );
}
