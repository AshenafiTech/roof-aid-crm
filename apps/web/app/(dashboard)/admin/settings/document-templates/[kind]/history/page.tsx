import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import {
  TEMPLATE_KINDS,
  TEMPLATE_TITLES,
  type TemplateKind,
} from "@/lib/templates/template-kinds";

import { listVersions } from "../../actions";

export const metadata = { title: "Template history — Settings" };

export default async function TemplateHistoryPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind: kindParam } = await params;
  if (!TEMPLATE_KINDS.includes(kindParam as TemplateKind)) {
    notFound();
  }
  const kind = kindParam as TemplateKind;
  const versions = await listVersions(kind);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${TEMPLATE_TITLES[kind]} — Version history`}
        description="Every save creates a new immutable version. Telefonista edits at generation time live on the document itself, not here."
        action={
          <Button asChild variant="outline">
            <Link href={`/admin/settings/document-templates/${kind}`}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to editor
            </Link>
          </Button>
        }
      />

      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No saved versions yet. Edit the template and save to create v1.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">v{v.versionNo}</span>
                    {v.isActive && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
                        Active
                      </span>
                    )}
                    {v.publishedAt == null && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                        Draft
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {v.source === "docx_import" ? "DOCX import" : "Editor"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString()} · by{" "}
                    {v.createdByName ?? "unknown"}
                  </div>
                  {v.changeSummary && (
                    <p className="text-sm">{v.changeSummary}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
