// Diff utilities for the audit log. Compare a baseline (template +
// substituted tokens, before any telefonista edit) to the final state
// the telefonista submits, and emit a compact change list.

import { blockToPlainText, type Block, type RichContent } from "@/lib/templates/blocks";
import type { Section, TemplateDoc } from "@/lib/templates/sections";

export interface FieldChange {
  token: string;
  before: string;
  after: string;
}

export interface BodyChange {
  index: number;
  kind: "added" | "removed" | "modified";
  before: string | null;
  after: string | null;
}

export interface SectionChange {
  // Index within the sections array (numbered the same way the user sees).
  index: number;
  kind: "added" | "removed" | "modified" | "moved";
  /** Title before edit (null when added). */
  titleBefore: string | null;
  /** Title after edit (null when removed). */
  titleAfter: string | null;
  /** Body changes inside this section, when modified. */
  body: BodyChange[];
}

export function diffFields(
  baseline: Record<string, string>,
  finalValues: Record<string, string>,
): FieldChange[] {
  const out: FieldChange[] = [];
  const keys = new Set([...Object.keys(baseline), ...Object.keys(finalValues)]);
  for (const k of keys) {
    const a = baseline[k] ?? "";
    const b = finalValues[k] ?? "";
    if (a !== b) out.push({ token: k, before: a, after: b });
  }
  return out;
}

export function diffBlocks(
  baseline: RichContent,
  finalDoc: RichContent,
): BodyChange[] {
  return diffBlockLists(baseline.blocks, finalDoc.blocks);
}

function diffBlockLists(a: Block[], b: Block[]): BodyChange[] {
  const changes: BodyChange[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const ai = a[i];
    const bi = b[i];
    if (!ai && bi) {
      changes.push({ index: i, kind: "added", before: null, after: blockToPlainText(bi) });
    } else if (ai && !bi) {
      changes.push({ index: i, kind: "removed", before: blockToPlainText(ai), after: null });
    } else if (ai && bi) {
      const at = blockToPlainText(ai);
      const bt = blockToPlainText(bi);
      if (ai.type !== bi.type || at !== bt) {
        changes.push({ index: i, kind: "modified", before: at, after: bt });
      }
    }
  }
  return changes;
}

export function diffSections(
  baseline: TemplateDoc,
  finalDoc: TemplateDoc,
): SectionChange[] {
  const out: SectionChange[] = [];

  // Try to match sections by id first (resilient to reordering); fall
  // back to positional matching for legacy/missing ids.
  const baseById = new Map<string, { idx: number; sec: Section }>();
  baseline.sections.forEach((sec, idx) => {
    if (sec.id) baseById.set(sec.id, { idx, sec });
  });

  const seenBase = new Set<number>();

  finalDoc.sections.forEach((finalSec, finalIdx) => {
    const matched = finalSec.id ? baseById.get(finalSec.id) : undefined;
    if (matched) {
      seenBase.add(matched.idx);
      const titleChanged = matched.sec.title !== finalSec.title;
      const bodyChanges = diffBlockLists(matched.sec.content, finalSec.content);
      const moved = matched.idx !== finalIdx;
      if (titleChanged || bodyChanges.length > 0 || moved) {
        out.push({
          index: finalIdx,
          kind: moved && !titleChanged && bodyChanges.length === 0 ? "moved" : "modified",
          titleBefore: matched.sec.title,
          titleAfter: finalSec.title,
          body: bodyChanges,
        });
      }
    } else {
      out.push({
        index: finalIdx,
        kind: "added",
        titleBefore: null,
        titleAfter: finalSec.title,
        body: [],
      });
    }
  });

  baseline.sections.forEach((sec, idx) => {
    if (seenBase.has(idx)) return;
    if (!sec.id) return; // best-effort
    out.push({
      index: idx,
      kind: "removed",
      titleBefore: sec.title,
      titleAfter: null,
      body: [],
    });
  });

  return out;
}
