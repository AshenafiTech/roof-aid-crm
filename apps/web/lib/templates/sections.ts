// Section-based template model.
//
// Each customizable template is a list of named sections. The header
// (title + metadata block: claim #, date of loss, date, homeowner,
// property address, contractor) and the footer (signature block) are
// system-rendered and NOT part of the persisted data — owners can only
// edit the sections in between.
//
// Section.title is a plain string with `\n` allowed for multi-line
// titles like "Authorization to Communicate with\nInsurance Carrier".
// Section.content holds the existing rich Block[] used for paragraphs,
// bullets, ordered lists, tables, and images.

import type { Block } from "@/lib/templates/blocks";

export interface Section {
  id: string;           // stable client-generated id (for reorder/edit diffing)
  title: string;        // multi-line string allowed
  content: Block[];     // body content
}

export interface TemplateDoc {
  sections: Section[];
}

export function newSection(partial: Partial<Section> = {}): Section {
  return {
    id:
      partial.id ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Math.random().toString(36).slice(2)}`),
    title: partial.title ?? "",
    content: partial.content ?? [],
  };
}

// ---------------------------------------------------------------------------
// Read-side normalizer: accept both the new shape and legacy {blocks: [...]}
// payloads (from the pre-section editor). When we see legacy data, treat
// the whole document as ONE section the owner can split later.
// ---------------------------------------------------------------------------
export function normalizeTemplateDoc(raw: unknown): TemplateDoc {
  if (!raw || typeof raw !== "object") return { sections: [] };

  const maybeSections = (raw as Partial<TemplateDoc>).sections;
  if (Array.isArray(maybeSections)) {
    return {
      sections: maybeSections.map((s) => normalizeSection(s)),
    };
  }

  const maybeBlocks = (raw as { blocks?: Block[] }).blocks;
  if (Array.isArray(maybeBlocks)) {
    return {
      sections: [newSection({ title: "", content: maybeBlocks })],
    };
  }

  return { sections: [] };
}

function normalizeSection(raw: unknown): Section {
  if (!raw || typeof raw !== "object") return newSection();
  const r = raw as Partial<Section>;
  return newSection({
    id: typeof r.id === "string" ? r.id : undefined,
    title: typeof r.title === "string" ? r.title : "",
    content: Array.isArray(r.content) ? (r.content as Block[]) : [],
  });
}
