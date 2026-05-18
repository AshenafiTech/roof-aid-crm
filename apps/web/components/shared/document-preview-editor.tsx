"use client";

// Section-based preview for the telefonista flow. Shows the fixed
// header banner, all sections as cards (auto-numbered), and a
// signature footer note. The body of each section is editable when
// `editable=true` via the same small SectionContentEditor the owner
// uses. The section title is editable too.

import { useState, useEffect } from "react";

import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import type { Block } from "@/lib/templates/blocks";
import type { Section, TemplateDoc } from "@/lib/templates/sections";
import {
  TEMPLATE_TITLES,
  type TemplateKind,
} from "@/lib/templates/template-kinds";

import { SectionContentEditor } from "@/components/admin/section-content-editor";

interface Props {
  kind: TemplateKind;
  initialContent: TemplateDoc;
  onContentChange: (doc: TemplateDoc) => void;
  editable: boolean;
  resolvedValues: Record<string, string>;
}

export function DocumentPreviewEditor({
  kind,
  initialContent,
  onContentChange,
  editable,
  resolvedValues,
}: Props) {
  const [sections, setSections] = useState<Section[]>(initialContent.sections);

  // Reset when baseline changes (e.g. telefonista picks a different
  // template via the dialog back-button).
  useEffect(() => {
    setSections(initialContent.sections);
  }, [initialContent]);

  // Propagate state changes up.
  useEffect(() => {
    onContentChange({ sections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  function updateSection(id: string, patch: Partial<Section>) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  return (
    <div className="space-y-3">
      <FixedHeaderPreview kind={kind} resolvedValues={resolvedValues} />

      {sections.map((sec, idx) => (
        <Card key={sec.id} className="overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
              {idx + 1}
            </span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Section {idx + 1}
            </span>
          </div>
          <div className="space-y-3 p-4">
            {editable ? (
              <div className="space-y-1.5">
                <Label htmlFor={`sec-title-${sec.id}`} className="text-xs">
                  Title
                </Label>
                <Textarea
                  id={`sec-title-${sec.id}`}
                  value={sec.title}
                  rows={Math.max(1, sec.title.split("\n").length)}
                  onChange={(e) => updateSection(sec.id, { title: e.target.value })}
                  className="resize-y text-base font-semibold"
                />
              </div>
            ) : (
              <h3 className="text-base font-semibold leading-snug whitespace-pre-line">
                {sec.title || "(untitled section)"}
              </h3>
            )}
            <SectionContentEditor
              kind={kind}
              initialContent={sec.content}
              onChange={(content: Block[]) =>
                updateSection(sec.id, { content })
              }
              editable={editable}
            />
          </div>
        </Card>
      ))}

      <FixedFooterPreview />
    </div>
  );
}

function FixedHeaderPreview({
  kind,
  resolvedValues,
}: {
  kind: TemplateKind;
  resolvedValues: Record<string, string>;
}) {
  return (
    <Card className="bg-white text-zinc-900 dark:bg-zinc-50 dark:text-zinc-900">
      <div className="space-y-2 px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Fixed header
        </p>
        <h2 className="text-lg font-bold leading-tight">
          {TEMPLATE_TITLES[kind]}
        </h2>
        <dl className="grid gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="font-semibold">Claim number:</dt>
          <dd>{resolvedValues.claim_number || "—"}</dd>
          <dt className="font-semibold">Date of loss:</dt>
          <dd>{resolvedValues.loss_date || "—"}</dd>
          <dt className="font-semibold">Date:</dt>
          <dd>{resolvedValues.today || "—"}</dd>
          <dt className="font-semibold">Homeowner(s):</dt>
          <dd>{resolvedValues.homeowner_name || "—"}</dd>
          <dt className="font-semibold">Property Address:</dt>
          <dd>{resolvedValues.property_address || "—"}</dd>
          <dt className="font-semibold">Contractor:</dt>
          <dd>{resolvedValues.contractor_name || "—"}</dd>
        </dl>
      </div>
    </Card>
  );
}

function FixedFooterPreview() {
  return (
    <Card className="border-dashed bg-muted/30 px-4 py-3 text-sm">
      <p className="font-medium">Signature block (fixed)</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Homeowner, Co-Homeowner, and Contractor / Roof AID Representative
        signature lines are appended automatically at the bottom of the
        last page. The homeowner signs digitally in the next step.
      </p>
    </Card>
  );
}
