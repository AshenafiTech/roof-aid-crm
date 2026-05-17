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
  type TemplateKind,
} from "@/app/(dashboard)/documents/actions";

type Step = "template" | "fields" | "done";

const TEMPLATE_CARDS: Array<{
  kind: TemplateKind;
  title: string;
  description: string;
}> = [
  {
    kind: "3rd_party_auth",
    title: "3rd Party Authorization",
    description: "Lets the roofer talk to the homeowner's insurer.",
  },
  {
    kind: "acv_contract",
    title: "ACV Contract",
    description: "Actual Cash Value scope-of-work contract.",
  },
  {
    kind: "rcv_contract",
    title: "RCV Contract",
    description: "Replacement Cost Value scope-of-work contract.",
  },
];

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

  // Field state — shared across templates; the renderer only reads the
  // fields it needs.
  const [insurance, setInsurance] = useState("");
  const [claim, setClaim] = useState("");
  const [lossDate, setLossDate] = useState("");
  const [deductible, setDeductible] = useState("");
  const [totalJobCost, setTotalJobCost] = useState("");
  const [scope, setScope] = useState("");

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
  }

  function pickTemplate(k: TemplateKind) {
    setKind(k);
    setStep("fields");
  }

  function submit() {
    if (!kind) return;
    const fields: Record<string, unknown> = {};
    if (insurance) fields.insurance_company = insurance.trim();
    if (claim) fields.claim_number = claim.trim();
    if (lossDate) fields.loss_date = lossDate;
    if (deductible) fields.deductible = Number(deductible);
    if (totalJobCost) fields.total_job_cost = Number(totalJobCost);
    if (scope) fields.scope_of_work = scope.trim();

    start(async () => {
      try {
        const { id } = await createDocument({
          prospectId,
          templateKind: kind,
          fields,
        });
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
      <DialogContent className="sm:max-w-lg">
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
                <p className="font-medium">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.description}
                </p>
              </button>
            ))}
          </div>
        )}

        {step === "fields" && kind && (
          <div className="space-y-3 pt-2">
            {kind === "3rd_party_auth" && (
              <>
                <FieldGroup>
                  <Label>Insurance carrier</Label>
                  <Input
                    value={insurance}
                    onChange={(e) => setInsurance(e.target.value)}
                    placeholder="State Farm"
                  />
                </FieldGroup>
                <FieldGroup>
                  <Label>Claim #</Label>
                  <Input
                    value={claim}
                    onChange={(e) => setClaim(e.target.value)}
                    placeholder="STF-2026-001"
                  />
                </FieldGroup>
                <FieldGroup>
                  <Label>Date of loss</Label>
                  <Input
                    type="date"
                    value={lossDate}
                    onChange={(e) => setLossDate(e.target.value)}
                  />
                </FieldGroup>
              </>
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
                onClick={submit}
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
