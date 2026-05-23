import { notFound } from "next/navigation";
import Link from "next/link";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { TemplateEditor } from "@/components/admin/template-editor";
import {
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_KINDS,
  TEMPLATE_TITLES,
  type TemplateKind,
} from "@/lib/templates/template-kinds";

import { loadTemplateForEdit } from "../actions";

export const metadata = { title: "Edit template — Settings" };

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind: kindParam } = await params;
  if (!TEMPLATE_KINDS.includes(kindParam as TemplateKind)) {
    notFound();
  }
  const kind = kindParam as TemplateKind;
  const state = await loadTemplateForEdit(kind);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${TEMPLATE_TITLES[kind]} template`}
        description={TEMPLATE_DESCRIPTIONS[kind]}
        action={
          <Button asChild variant="outline">
            <Link href={`/admin/settings/document-templates/${kind}/history`}>
              <History className="mr-1 h-4 w-4" /> Version history
            </Link>
          </Button>
        }
      />

      <TemplateEditor
        kind={kind}
        initialContent={state.content}
        activeVersionNo={state.activeVersionNo}
      />
    </div>
  );
}
