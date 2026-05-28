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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

type Step = "template" | "fields" | "preview" | "done";

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

  // Field state.
  const [insurance, setInsurance] = useState("");
  const [claim, setClaim] = useState("");
  const [lossDate, setLossDate] = useState("");
  const [deductible, setDeductible] = useState("");
  const [totalJobCost, setTotalJobCost] = useState("");
  const [scope, setScope] = useState("");

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
    setInsurance("");
    setClaim("");
    setLossDate("");
    setDeductible("");
    setTotalJobCost("");
    setScope("");
    setTemplateVersionId(null);
    setBaselineContent({ sections: [] });
    setFinalContent({ sections: [] });
    setBaselineValues({});
    setPreviewEditable(false);
    setHasCompanySignature(false);
    setAutoCompanySign(true);
  }

  function pickTemplate(k: TemplateKind) {
    setKind(k);
    setStep("fields");
  }

  function buildFields(): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    if (insurance) fields.insurance_company = insurance.trim();
    if (claim) fields.claim_number = claim.trim();
    if (lossDate) fields.loss_date = lossDate;
    if (deductible) fields.deductible = Number(deductible);
    if (totalJobCost) fields.total_job_cost = Number(totalJobCost);
    if (scope) fields.scope_of_work = scope.trim();
    return fields;
  }

  function goPreview() {
    if (!kind) return;
    start(async () => {
      try {
        const preview = await loadTemplateForPreview({
          prospectId,
          templateKind: kind,
          fields: buildFields(),
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
        const baseFields = buildFields();
        const payload: Parameters<typeof createDocument>[0] = {
          prospectId,
          templateKind: kind,
          fields: baseFields,
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-700">
              <FileText className="h-4 w-4" />
            </div>
            New Document — {prospectName}
          </DialogTitle>
          <DialogDescription>
            {step === "template" && "Pick a template to generate."}
            {step === "fields" && "Fill in the details — all fields optional."}
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

        {step === "fields" && kind && (
          <div className="space-y-3 pt-2">
            {kind === "3rd_party_auth" && (
              <div className="rounded-md border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
                No fields to enter. Homeowner, property address, and
                contractor are pulled from the prospect and your company
                profile. Claim number, date, and date of loss stay blank
                so they can be filled in on-site or by mobile after
                inspection.
              </div>
            )}

            {(kind === "acv_contract" || kind === "rcv_contract") && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup>
                    <Label>Insurance carrier</Label>
                    <Input
                      value={insurance}
                      onChange={(e) => setInsurance(e.target.value)}
                    />
                  </FieldGroup>
                  <FieldGroup>
                    <Label>Claim #</Label>
                    <Input
                      value={claim}
                      onChange={(e) => setClaim(e.target.value)}
                    />
                  </FieldGroup>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup>
                    <Label>Deductible ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={deductible}
                      onChange={(e) => setDeductible(e.target.value)}
                    />
                  </FieldGroup>
                  <FieldGroup>
                    <Label>Total job cost ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={totalJobCost}
                      onChange={(e) => setTotalJobCost(e.target.value)}
                    />
                  </FieldGroup>
                </div>
                <FieldGroup>
                  <Label>Scope of work</Label>
                  <Textarea
                    rows={4}
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    placeholder="Tear-off + replacement, gutter repair, …"
                  />
                </FieldGroup>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("template")}
                disabled={pending}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={goPreview}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Continue →"
                )}
              </Button>
            </div>
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("fields")}
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
                  "Generate document"
                )}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && createdId && (
          <div className="space-y-3 pt-2">
            <p className="text-sm">Document generated successfully.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Close
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  window.location.href = `/documents/${createdId}/sign`;
                }}
              >
                Sign now →
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}
