import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, History, Pencil, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { TemplateEditor } from "@/components/admin/template-editor";
import { TemplatePreviewSurface } from "@/components/admin/template-preview";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
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
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { kind: kindParam } = await params;
  const { edit } = await searchParams;
  if (!TEMPLATE_KINDS.includes(kindParam as TemplateKind)) {
    notFound();
  }
  const kind = kindParam as TemplateKind;
  const [state, tenantName] = await Promise.all([
    loadTemplateForEdit(kind),
    getCurrentTenantName(),
  ]);
  const isEditing = edit === "1";
  const hasCustom = state.activeVersionNo != null;

  const primaryActionLabel = hasCustom ? "Edit template" : "Customize this template";
  const PrimaryActionIcon = hasCustom ? Pencil : Sparkles;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/settings/document-templates"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Document templates
      </Link>

      <PageHeader
        title={`${TEMPLATE_TITLES[kind]} template`}
        description={TEMPLATE_DESCRIPTIONS[kind]}
        action={
          <div className="flex gap-2">
            {!isEditing && (
              <Button asChild size="sm">
                <Link href={`/admin/settings/document-templates/${kind}?edit=1`}>
                  <PrimaryActionIcon className="mr-1 h-4 w-4" />
                  {primaryActionLabel}
                </Link>
              </Button>
            )}
            {isEditing && (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/admin/settings/document-templates/${kind}`}>
                  Cancel
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/settings/document-templates/${kind}/history`}>
                <History className="mr-1 h-4 w-4" /> Version history
              </Link>
            </Button>
          </div>
        }
      />

      {isEditing ? (
        <TemplateEditor
          kind={kind}
          initialContent={state.content}
          activeVersionNo={state.activeVersionNo}
          tenantName={tenantName}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {hasCustom ? (
              <>
                Showing{" "}
                <span className="font-medium text-foreground">
                  Custom v{state.activeVersionNo}
                </span>{" "}
                (active).
              </>
            ) : (
              <>
                Showing the{" "}
                <span className="font-medium text-foreground">
                  built-in default
                </span>{" "}
                — used when generating documents until you publish a custom
                version.
              </>
            )}{" "}
            Prospect-specific fields (homeowner, address, claim) are blank
            here — they&apos;re filled in when the document is generated.
            Contractor reflects your company name from signup.
          </p>
          <TemplatePreviewSurface
            kind={kind}
            sections={state.content.sections}
            tenantName={tenantName}
          />
        </div>
      )}
    </div>
  );
}

// Read the tenant's company name (the value captured at signup as
// `tenants.name`). Renames propagate to every render of this page.
async function getCurrentTenantName(): Promise<string | undefined> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", user.tenantId)
    .single();
  return data?.name?.trim() || undefined;
}
