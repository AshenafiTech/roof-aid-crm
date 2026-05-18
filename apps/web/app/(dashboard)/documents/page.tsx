import { PageHeader } from "@/components/shared/page-header";

import { getCurrentUser } from "@/lib/auth/current-user";
import { listDocuments } from "@/lib/queries/documents";

import { DocumentFilters } from "./filters";
import { DocumentTable } from "./document-table";
import { UploadDocumentButton } from "./upload-button";

export const metadata = {
  title: "Documents — Roof-Aid CRM",
};

type DocsSearchParams = {
  prospect?: string;
  status?: string;
  type?: string;
  q?: string;
  signed_from?: string;
  signed_to?: string;
  page?: string;
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<DocsSearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const pageNum = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const { documents, total, pageSize } = await listDocuments({
    prospectId: params.prospect,
    status: params.status,
    type: params.type,
    q: params.q,
    signedFrom: params.signed_from,
    signedTo: params.signed_to,
    page: pageNum,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Documents"
          description={`${total} document${total === 1 ? "" : "s"} across all prospects.`}
        />
        <UploadDocumentButton />
      </div>

      <DocumentFilters
        status={params.status}
        type={params.type}
        q={params.q}
        signedFrom={params.signed_from}
        signedTo={params.signed_to}
      />

      <DocumentTable
        documents={documents}
        total={total}
        currentPage={pageNum}
        pageSize={pageSize}
        currentUserRole={user.role}
      />
    </div>
  );
}
