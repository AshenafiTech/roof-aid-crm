"use client";

import { useCallback, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { Block } from "@/lib/templates/blocks";
import { getDefaultSections } from "@/lib/templates/defaults";
import {
  newSection,
  type Section,
  type TemplateDoc,
} from "@/lib/templates/sections";
import { TEMPLATE_TITLES, type TemplateKind } from "@/lib/templates/template-kinds";

import { SectionContentEditor } from "./section-content-editor";
import { TemplatePreviewSurface } from "./template-preview";

import {
  saveTemplateDraft,
  publishTemplateVersion,
  revertTemplateToDefault,
} from "@/app/(dashboard)/admin/settings/document-templates/actions";

interface Props {
  kind: TemplateKind;
  initialContent: TemplateDoc;
  activeVersionNo: number | null;
  /** Live tenant company name, forwarded to the inline Preview tab so the
   *  Contractor field and inline {{contractor_name}} tokens render the
   *  current value. */
  tenantName?: string;
}

export function TemplateEditor({ kind, initialContent, activeVersionNo, tenantName }: Props) {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>(initialContent.sections);
  const [changeSummary, setChangeSummary] = useState("");
  const [pending, start] = useTransition();

  const updateSection = useCallback((id: string, patch: Partial<Section>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  const moveSection = useCallback((idx: number, dir: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const [removed] = next.splice(idx, 1);
      next.splice(target, 0, removed);
      return next;
    });
  }, []);

  const deleteSection = useCallback((id: string) => {
    if (!confirm("Delete this section? You can re-add it later.")) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addSection = useCallback(() => {
    setSections((prev) => [...prev, newSection({ title: "New section", content: [] })]);
  }, []);

  function saveDraft() {
    start(async () => {
      try {
        const { versionNo } = await saveTemplateDraft({
          kind,
          content: { sections } as never,
          changeSummary: changeSummary.trim() || undefined,
        });
        toast.success(`Saved as draft v${versionNo}`);
        setChangeSummary("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  function publish() {
    start(async () => {
      try {
        const { versionId, versionNo } = await saveTemplateDraft({
          kind,
          content: { sections } as never,
          changeSummary: changeSummary.trim() || undefined,
        });
        await publishTemplateVersion({ kind, versionId });
        toast.success(`Published ${TEMPLATE_TITLES[kind]} v${versionNo}`);
        setChangeSummary("");
        router.push(`/admin/settings/document-templates/${kind}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Publish failed");
      }
    });
  }

  function handleRevert() {
    if (!confirm("Revert to the built-in default template? Your section edits will be lost.")) {
      return;
    }
    start(async () => {
      try {
        await revertTemplateToDefault({ kind });
        toast.success("Reverted to default");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Revert failed");
      }
    });
  }

  function handleLoadDefaults() {
    if (
      !confirm(
        "Replace the current draft with the built-in default content? Unsaved edits will be lost. You'll still need to Save + publish to make it active.",
      )
    ) {
      return;
    }
    setSections(getDefaultSections(kind));
    toast.success("Loaded built-in defaults — preview, then Save + publish");
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="edit" className="space-y-4">
        <TabsList>
          <TabsTrigger value="edit">
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Edit
          </TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        {/* forceMount keeps both panels alive so switching tabs doesn't
            tear down TipTap editors and lose focus / cursor state. We hide
            the inactive panel via data-[state=inactive]:hidden. */}
        <TabsContent
          value="edit"
          forceMount
          className="space-y-4 data-[state=inactive]:hidden"
        >
          <FixedHeaderHint />

          <div className="space-y-3">
            {sections.map((sec, idx) => (
              <SectionCard
                key={sec.id}
                kind={kind}
                section={sec}
                number={idx + 1}
                isFirst={idx === 0}
                isLast={idx === sections.length - 1}
                onTitleChange={(title) => updateSection(sec.id, { title })}
                onContentChange={(content) => updateSection(sec.id, { content })}
                onMoveUp={() => moveSection(idx, -1)}
                onMoveDown={() => moveSection(idx, 1)}
                onDelete={() => deleteSection(sec.id)}
              />
            ))}
          </div>

          <Button variant="outline" onClick={addSection} className="w-full">
            <Plus className="mr-1 h-4 w-4" /> Add section
          </Button>

          <FixedFooterHint />
        </TabsContent>

        <TabsContent
          value="preview"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <TemplatePreviewSurface kind={kind} sections={sections} tenantName={tenantName} />
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <Label htmlFor="change-summary" className="text-xs">
          Change summary (shown in version history)
        </Label>
        <Input
          id="change-summary"
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          placeholder="e.g. Updated section 3 wording for new state requirement"
          maxLength={280}
        />
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 text-sm shadow-sm backdrop-blur sm:mx-0 sm:rounded-md sm:border">
        <div className="text-muted-foreground">
          {activeVersionNo != null ? (
            <>
              Active:{" "}
              <span className="font-medium text-foreground">Custom v{activeVersionNo}</span>.
              Saving creates a new draft; publish to make it active.
            </>
          ) : (
            <>Active: built-in default. Saving creates v1 as a draft.</>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadDefaults}
            disabled={pending}
            title="Replace the current draft with the latest built-in defaults"
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Load defaults
          </Button>
          {activeVersionNo != null && (
            <Button variant="ghost" size="sm" onClick={handleRevert} disabled={pending}>
              Revert to default
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={saveDraft} disabled={pending}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save draft
          </Button>
          <Button size="sm" onClick={publish} disabled={pending}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save + publish
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionCard — one card per section in the list.
// ---------------------------------------------------------------------------
function SectionCard(props: {
  kind: TemplateKind;
  section: Section;
  number: number;
  isFirst: boolean;
  isLast: boolean;
  onTitleChange: (title: string) => void;
  onContentChange: (content: Block[]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const {
    kind,
    section,
    number,
    isFirst,
    isLast,
    onTitleChange,
    onContentChange,
    onMoveUp,
    onMoveDown,
    onDelete,
  } = props;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">
            {number}
          </span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Section {number}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Move up"
            disabled={isFirst}
            onClick={onMoveUp}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Move down"
            disabled={isLast}
            onClick={onMoveDown}
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Delete section"
            onClick={onDelete}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor={`title-${section.id}`} className="text-xs">
            Section title
          </Label>
          <Textarea
            id={`title-${section.id}`}
            value={section.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Title (e.g. Purpose of Agreement)"
            rows={Math.max(1, section.title.split("\n").length)}
            className="resize-y text-base font-semibold"
          />
          <p className="text-[11px] text-muted-foreground">
            Numbering ({number}.) is added automatically. Press Enter for a multi-line title.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Section content</Label>
          <SectionContentEditor
            kind={kind}
            initialContent={section.content}
            onChange={onContentChange}
          />
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Static reminders that the top + bottom of the PDF are system-rendered.
// ---------------------------------------------------------------------------
function FixedHeaderHint() {
  return (
    <Card className="border-dashed bg-muted/30 px-4 py-3 text-sm">
      <p className="font-medium">Fixed header</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        The document title and metadata block (Claim number, Date of loss,
        Date, Homeowner, Property Address, Contractor) are rendered
        automatically from the prospect + telefonista fields. You can&apos;t
        edit them here.
      </p>
    </Card>
  );
}

function FixedFooterHint() {
  return (
    <Card className="border-dashed bg-muted/30 px-4 py-3 text-sm">
      <p className="font-medium">Fixed signature block</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Every generated document ends with the standard signature lines
        (Homeowner, Co-Homeowner, Contractor / Roof AID Representative).
        This stays consistent across templates and isn&apos;t editable.
      </p>
    </Card>
  );
}
