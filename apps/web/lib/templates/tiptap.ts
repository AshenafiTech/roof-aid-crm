// Converters between TipTap/ProseMirror JSON and our persisted block-JSON
// format. We use ProseMirror JSON in the editor (where TipTap natively
// understands it) and our flat block list for storage + PDF rendering
// (so the Deno function doesn't need to know ProseMirror semantics).

import type {
  Block,
  InlineMark,
  InlineSpan,
  TableCell,
  TableRow,
  RichContent,
} from "@/lib/templates/blocks";

// ProseMirror JSON has the shape:
//   { type: 'doc', content: [ ... ] }
//   { type: 'paragraph', content: [...inline nodes] }
//   { type: 'heading', attrs: { level: 1|2|3 }, content: [...] }
//   { type: 'bulletList', content: [ {type: 'listItem', content: [...]} ] }
//   { type: 'orderedList', content: [ {type: 'listItem', content: [...]} ] }
//   { type: 'table', content: [ {type: 'tableRow', content: [ {type: 'tableCell'|'tableHeader', content: [...]} ] } ] }
//   { type: 'image', attrs: { src, alt, width, height } }
//   { type: 'text', text: '...', marks?: [ {type: 'bold'|'italic'|'underline'} ] }
//   { type: 'mention', attrs: { id: 'insurance_company' } }
//   { type: 'hardBreak' }

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

// ---------- blocks → ProseMirror JSON (loading into TipTap) ----------------

export function blocksToTipTap(doc: RichContent): PMNode {
  // Group consecutive bullets/orderdens into bulletList/orderedList nodes.
  const content: PMNode[] = [];
  let i = 0;
  while (i < doc.blocks.length) {
    const b = doc.blocks[i];
    if (b.type === "bullet") {
      const items: PMNode[] = [];
      while (i < doc.blocks.length && doc.blocks[i].type === "bullet") {
        const cur = doc.blocks[i] as Extract<Block, { type: "bullet" }>;
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: spansToTipTap(cur.spans) }],
        });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }
    if (b.type === "ordered") {
      const items: PMNode[] = [];
      while (i < doc.blocks.length && doc.blocks[i].type === "ordered") {
        const cur = doc.blocks[i] as Extract<Block, { type: "ordered" }>;
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: spansToTipTap(cur.spans) }],
        });
        i++;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }
    if (b.type === "heading") {
      content.push({
        type: "heading",
        attrs: { level: b.level },
        content: spansToTipTap(b.spans),
      });
    } else if (b.type === "paragraph") {
      content.push({ type: "paragraph", content: spansToTipTap(b.spans) });
    } else if (b.type === "spacer") {
      content.push({ type: "paragraph" });
    } else if (b.type === "image") {
      content.push({
        type: "image",
        attrs: {
          src: b.src,
          alt: b.alt ?? null,
          width: b.width ?? null,
          height: b.height ?? null,
          "data-storage-path": b.storagePath ?? null,
        },
      });
    } else if (b.type === "table") {
      content.push({
        type: "table",
        content: b.rows.map((r) => ({
          type: "tableRow",
          content: r.cells.map((c) => ({
            type: c.header ? "tableHeader" : "tableCell",
            content: [{ type: "paragraph", content: spansToTipTap(c.spans) }],
          })),
        })),
      });
    }
    i++;
  }
  return { type: "doc", content };
}

function spansToTipTap(spans: InlineSpan[]): PMNode[] {
  const out: PMNode[] = [];
  const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
  for (const span of spans) {
    const marks = (span.marks ?? []).map((m) => ({ type: m }));
    // Split on tokens and emit a `mention` node in place of each
    // {{token}} so the editor can render it as a chip.
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    TOKEN_RE.lastIndex = 0;
    const text = span.text;
    while ((match = TOKEN_RE.exec(text)) !== null) {
      const before = text.slice(lastIndex, match.index);
      pushTextRun(out, before, marks);
      out.push({
        type: "mention",
        attrs: { id: match[1] },
      });
      lastIndex = match.index + match[0].length;
    }
    const tail = text.slice(lastIndex);
    pushTextRun(out, tail, marks);
  }
  return out;
}

function pushTextRun(
  out: PMNode[],
  text: string,
  marks: Array<{ type: string }>,
) {
  if (!text) return;
  const parts = text.split("\n");
  parts.forEach((p, idx) => {
    if (p) out.push({ type: "text", text: p, marks: marks.length ? marks : undefined });
    if (idx < parts.length - 1) out.push({ type: "hardBreak" });
  });
}

// ---------- ProseMirror JSON → blocks (saving from TipTap) -----------------

export function tipTapToBlocks(doc: PMNode): RichContent {
  const blocks: Block[] = [];
  if (!doc.content) return { blocks };
  for (const node of doc.content) {
    walkTop(node, blocks);
  }
  return { blocks };
}

function walkTop(node: PMNode, blocks: Block[], listLevel = 1) {
  if (node.type === "paragraph") {
    const spans = inlineToSpans(node.content ?? []);
    if (spans.length === 1 && spans[0].text === "") {
      // Empty paragraph → spacer
      blocks.push({ type: "spacer" });
      return;
    }
    blocks.push({ type: "paragraph", spans });
    return;
  }
  if (node.type === "heading") {
    const level = clampLevel(node.attrs?.level);
    blocks.push({
      type: "heading",
      level,
      spans: inlineToSpans(node.content ?? []),
    });
    return;
  }
  if (node.type === "bulletList") {
    for (const item of node.content ?? []) {
      walkListItem(item, blocks, listLevel, "bullet");
    }
    return;
  }
  if (node.type === "orderedList") {
    let i = 1;
    for (const item of node.content ?? []) {
      walkListItem(item, blocks, listLevel, "ordered", i);
      i += 1;
    }
    return;
  }
  if (node.type === "image") {
    const a = node.attrs ?? {};
    const sp = a["data-storage-path"];
    blocks.push({
      type: "image",
      src: String(a.src ?? ""),
      storagePath: sp ? String(sp) : undefined,
      alt: a.alt ? String(a.alt) : undefined,
      width: typeof a.width === "number" ? a.width : undefined,
      height: typeof a.height === "number" ? a.height : undefined,
    });
    return;
  }
  if (node.type === "table") {
    const rows: TableRow[] = [];
    for (const tr of node.content ?? []) {
      if (tr.type !== "tableRow") continue;
      const cells: TableCell[] = [];
      for (const td of tr.content ?? []) {
        const header = td.type === "tableHeader";
        // Cell content is a list of block nodes; flatten the inline runs
        // from each paragraph it contains.
        const cellSpans: InlineSpan[] = [];
        for (const child of td.content ?? []) {
          if (child.type === "paragraph") {
            if (cellSpans.length > 0) cellSpans.push({ text: "\n" });
            for (const s of inlineToSpans(child.content ?? [])) cellSpans.push(s);
          }
        }
        cells.push({ spans: cellSpans, header });
      }
      rows.push({ cells });
    }
    blocks.push({ type: "table", rows });
    return;
  }
  // Ignore unsupported node types silently (e.g. codeBlock, blockquote)
}

function walkListItem(
  item: PMNode,
  blocks: Block[],
  level: number,
  kind: "bullet" | "ordered",
  orderedIndex = 1,
) {
  const lvl = (Math.min(3, Math.max(1, level)) as 1 | 2 | 3);
  // A list item is paragraph(s) followed optionally by nested lists.
  for (const child of item.content ?? []) {
    if (child.type === "paragraph") {
      const spans = inlineToSpans(child.content ?? []);
      if (kind === "bullet") {
        blocks.push({ type: "bullet", level: lvl, spans });
      } else {
        blocks.push({ type: "ordered", level: lvl, index: orderedIndex, spans });
      }
    } else if (child.type === "bulletList") {
      for (const sub of child.content ?? []) {
        walkListItem(sub, blocks, level + 1, "bullet");
      }
    } else if (child.type === "orderedList") {
      let i = 1;
      for (const sub of child.content ?? []) {
        walkListItem(sub, blocks, level + 1, "ordered", i);
        i += 1;
      }
    }
  }
}

function clampLevel(v: unknown): 1 | 2 | 3 {
  const n = typeof v === "number" ? v : Number(v ?? 1);
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function inlineToSpans(content: PMNode[]): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let curText = "";
  let curMarks: InlineMark[] = [];

  function flush() {
    if (!curText) return;
    spans.push(curMarks.length ? { text: curText, marks: [...curMarks] } : { text: curText });
    curText = "";
  }

  for (const n of content) {
    if (n.type === "text") {
      const marks: InlineMark[] = [];
      for (const m of n.marks ?? []) {
        if (m.type === "bold" || m.type === "italic" || m.type === "underline") {
          marks.push(m.type as InlineMark);
        }
      }
      // If marks differ from current, flush.
      if (marks.join("|") !== curMarks.join("|")) {
        flush();
        curMarks = marks;
      }
      curText += n.text ?? "";
      continue;
    }
    if (n.type === "hardBreak") {
      curText += "\n";
      continue;
    }
    if (n.type === "mention") {
      flush();
      const id = String(n.attrs?.id ?? "");
      if (id) {
        spans.push({ text: `{{${id}}}` });
      }
      continue;
    }
    // Unknown inline node — skip
  }
  flush();
  return spans;
}
