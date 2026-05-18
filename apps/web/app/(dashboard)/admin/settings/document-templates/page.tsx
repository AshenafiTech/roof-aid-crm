import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_TITLES,
} from "@/lib/templates/template-kinds";

import { listTemplates } from "./actions";

export const metadata = { title: "Document templates — Settings" };

export default async function DocumentTemplatesPage() {
  const rows = await listTemplates();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document templates"
        description="Customize the legal copy your team uses when generating prospect documents. Telefonista edits on a single document never change the template here."
      />

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <Link
            key={r.kind}
            href={`/admin/settings/document-templates/${r.kind}`}
          >
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="rounded-md bg-muted p-2">
                  <FileText className="size-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{TEMPLATE_TITLES[r.kind]}</span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (r.activeVersionNo != null
                          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                          : "bg-muted text-muted-foreground")
                      }
                    >
                      {r.activeVersionNo != null
                        ? `Custom v${r.activeVersionNo}`
                        : "Using default"}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {TEMPLATE_DESCRIPTIONS[r.kind]}
                  </CardDescription>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
