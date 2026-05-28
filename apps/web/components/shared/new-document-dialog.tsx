"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  createDocument,
  loadTemplateForPreview,
} from "@/app/(dashboard)/documents/actions";
import type { TemplateDoc } from "@/lib/templates/sections";
import {
  TEMPLATE_DESCRIPTIONS,
  TEMPLATE_KINDS,
  TEMPLATE_TITLES,
  type TemplateKind,
} from "@/lib/templates/template-kinds";
import { DocumentPreviewEditor } from "@/components/shared/document-preview-editor";

type Step = "template" | "preview" | "done";

const TEMPLATE_CARDS: Array<{ kind: TemplateKind }> = TEMPLATE_KINDS.filter(
  (k) => k !== "supplement",
).map((k) => ({ kind: k }));

export function NewDocumentDialog({
  open,
  onOpenChange,
  prospectId,
  prospectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectId: string;
  prospectName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("template");
  const [kind, setKind] = useState<TemplateKind | null>(null);
  const [pending, start] = useTransition();
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Preview-edit state. When templateVersionId is null we're previewing
  // the built-in defaults; either way the telefonista can override per
  // prospect, and edits get logged.
  const [templateVersionId, setTemplateVersionId] = useState<string | null>(null);
  const [baselineContent, setBaselineContent] = useState<TemplateDoc>({ sections: [] });
  const [finalContent, setFinalContent] = useState<TemplateDoc>({ sections: [] });
  const [baselineValues, setBaselineValues] = useState<Record<string, string>>({});
  const [previewEditable, setPreviewEditable] = useState(false);
  const [hasCompanySignature, setHasCompanySignature] = useState(false);
  const [autoCompanySign, setAutoCompanySign] = useState(true);

  function reset() {
    setStep("template");
    setKind(null);
    setCreatedId(null);
    setTemplateVersionId(null);
    setBaselineContent({ sections: [] });
    setFinalContent({ sections: [] });
    setBaselineValues({});
    setPreviewEditable(false);
    setHasCompanySignature(false);
    setAutoCompanySign(true);
  }

  // Pick a template → load its preview and jump straight there. The old
  // "fields" step (insurance carrier, claim #, deductible, etc.) was
  // removed per owner direction: header fields come from prospect/tenant
  // data, and anything else can be edited inline in the preview before
  // generating. Pass `k` directly to avoid stale `kind` state.
  function pickTemplate(k: TemplateKind) {
    setKind(k);
    start(async () => {
      try {
        const preview = await loadTemplateForPreview({
          prospectId,
          templateKind: k,
          fields: {},
        });
        setTemplateVersionId(preview.templateVersionId);
        setBaselineContent(preview.baselineContent);
        setFinalContent(preview.baselineContent);
        setBaselineValues(preview.resolvedValues);
        setHasCompanySignature(preview.hasCompanySignature);
        setAutoCompanySign(preview.hasCompanySignature);
        setPreviewEditable(false);
        setStep("preview");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load template");
      }
    });
  }

  function generate() {
    if (!kind) return;
    start(async () => {
      try {
        const payload: Parameters<typeof createDocument>[0] = {
          prospectId,
          templateKind: kind,
          fields: {},
          finalContent: finalContent as never,
          baselineContent: baselineContent as never,
          fieldOverrides: baselineValues,
          fieldBaseline: baselineValues,
          autoCompanySign,
        };
        if (templateVersionId) payload.templateVersionId = templateVersionId;
        const { id } = await createDocument(payload);
        toast.success("Document generated");
        setCreatedId(id);
        setStep("done");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <FileText className="h-4 w-4" />
            </div>
            New Document — {prospectName}
          </DialogTitle>
          <DialogDescription>
            {step === "template" && "Pick a template to generate."}
            {step === "preview" && "Review and adjust the document. Any edits are logged for the owner. The original template is unchanged."}
            {step === "done" && "Document is ready."}
          </DialogDescription>
        </DialogHeader>

        {step === "template" && (
          <div className="grid gap-3 pt-2">
            {TEMPLATE_CARDS.map((c) => (
              <button
                key={c.kind}
                type="button"
                onClick={() => pickTemplate(c.kind)}
                className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <p className="font-medium">{TEMPLATE_TITLES[c.kind]}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {TEMPLATE_DESCRIPTIONS[c.kind]}
                </p>
              </button>
            ))}
          </div>
        )}

        {step === "preview" && kind && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                You're previewing the <strong>{TEMPLATE_TITLES[kind]}</strong> template.
                Edits here only affect this document — the template stays unchanged. Every change is logged.
              </div>
              <Button
                variant={previewEditable ? "default" : "outline"}
                size="sm"
                onClick={() => setPreviewEditable((v) => !v)}
                disabled={pending}
              >
                {previewEditable ? "Lock" : "Edit content"}
              </Button>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <DocumentPreviewEditor
                kind={kind}
                initialContent={baselineContent}
                onContentChange={setFinalContent}
                editable={previewEditable}
                resolvedValues={baselineValues}
              />
            </div>
            {hasCompanySignature && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer"
                  checked={autoCompanySign}
                  onChange={(e) => setAutoCompanySign(e.target.checked)}
                  disabled={pending}
                />
                <span>
                  Apply my saved company signature on the Representative line
                  <span className="block text-xs text-muted-foreground">
                    Uncheck to leave the document unsigned by the company. You can sign it manually from the document page later.
                  </span>
                </span>
              </label>
            )}
            <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-background/95 px-4 pt-3 pb-1 backdrop-blur">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("template")}
                disabled={pending}
              >
                Back
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setFinalContent(baselineContent)}
                disabled={pending}
              >
                Reset to template
              </Button>
              <Button
                className="flex-1"
                onClick={generate}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Save & generate"
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && createdId && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              The company signature was applied automatically. The homeowner
              will sign on mobile when the inspector arrives.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  window.location.href = `/documents/${createdId}`;
                }}
              >
                View document
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
