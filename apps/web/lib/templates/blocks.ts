// Block-JSON document format used to store custom template content.
//
// Why a structured block list:
//   - The Edge Function (Deno) renders to PDF by walking a typed AST;
//     no HTML parser needs to ship to Deno.
//   - Diffs (telefonista edits) compare block-by-block deterministically.
//   - Shape is a deliberate subset of ProseMirror so we can swap in a
//     proper rich-text editor (TipTap) later without migrating data.
//
// Authoring uses a markdown-ish source the owner can type in a textarea
// or generate by importing a .docx — both convert through `parseMarkdown`.

export type InlineMark = "bold" | "italic" | "underline";

// A span may embed `\n` characters to indicate a hard line break inside
// a paragraph (rendered as a forced break, not a new paragraph).
export interface InlineSpan {
  text: string;
  marks?: InlineMark[];
}

export interface TableCell {
  spans: InlineSpan[];
  header?: boolean;
}
export interface TableRow {
  cells: TableCell[];
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "bullet"; level?: 1 | 2 | 3; spans: InlineSpan[] }
  | { type: "ordered"; level?: 1 | 2 | 3; index: number; spans: InlineSpan[] }
  | { type: "table"; rows: TableRow[] }
  | {
      type: "image";
      src: string;          // signed URL (for browser display) or empty
      storagePath?: string; // canonical Supabase storage path (durable)
      alt?: string;
      width?: number;
      height?: number;
    }
  | { type: "spacer" };

export interface RichContent {
  blocks: Block[];
}

// ---------------------------------------------------------------------------
// Normalizer: clean up mammoth's `convertToMarkdown` output so it matches
// the editor's parser expectations.
//
// Mammoth tends to:
//   - over-escape punctuation (`\.`, `\(`, `\-`, `\&`)
//   - emit `__bold__` instead of `**bold**` (we use `__underline__`)
//   - emit `\t- item` for nested bullets
//   - end lines that should be hard breaks with two trailing spaces (this
//     is standard markdown — we preserve them as `  \n`)
// ---------------------------------------------------------------------------
export function normalizeMammothMarkdown(src: string): string {
  let out = src.replace(/\r\n/g, "\n");

  // 1. Convert `__bold__` to `**bold**` BEFORE we touch other `_` escapes,
  //    because `__` is used by both mammoth (bold) and us (underline).
  //    Mammoth emits paired `__` around runs of text; rewrite them.
  out = out.replace(/__([^_\n][^_\n]*?)__/g, "**$1**");

  // 2. Strip mammoth's backslash escapes on punctuation. Markdown only
  //    requires escaping a small set of characters; over-escaping makes
  //    the editor unreadable.
  out = out.replace(/\\([\-_().!&#@:;'"%/\\+=~|<>?$,])/g, "$1");

  // 3. Collapse runs of three+ consecutive blank lines (mammoth sometimes
  //    inserts one after every short paragraph).
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

// ---------------------------------------------------------------------------
// Markdown ↔ blocks
//
// Supported markdown subset:
//   # / ## / ###       headings
//   - item / * item    bullets; indented (tab or 2+ spaces) → nested
//   blank line         paragraph break
//   **bold**           bold
//   *italic*           italic
//   __underline__      underline
//   trailing "  "      hard line break (kept inside the current paragraph)
//   {{token}}          variable placeholder (kept verbatim in span text)
// ---------------------------------------------------------------------------

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^(\s*)[-*]\s+(.*)$/;

export function parseMarkdown(src: string): RichContent {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraphBuf: string[] = [];

  function flushParagraph() {
    if (paragraphBuf.length === 0) return;
    // Hard-break aware join: lines separated by `\n` inside a paragraph
    // become forced line breaks in the rendered output. Lines with no
    // trailing hard-break marker are joined with a single space.
    const text = paragraphBuf.join("").trim();
    paragraphBuf = [];
    if (!text) return;
    blocks.push({ type: "paragraph", spans: parseInlines(text) });
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    const h = HEADING_RE.exec(trimmed);
    if (h) {
      flushParagraph();
      const level = Math.min(3, h[1].length) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, spans: parseInlines(h[2]) });
      continue;
    }

    const b = BULLET_RE.exec(raw);
    if (b) {
      flushParagraph();
      const indent = b[1];
      const level = indentLevel(indent);
      blocks.push({
        type: "bullet",
        level,
        spans: parseInlines(b[2]),
      });
      continue;
    }

    // Hard break: trailing two-spaces marks a forced break inside the
    // paragraph (markdown convention). Otherwise lines are joined with
    // a space.
    const hasHardBreak = /  $/.test(raw);
    const piece = trimmed + (hasHardBreak ? "\n" : " ");
    paragraphBuf.push(piece);
  }
  flushParagraph();

  return { blocks };
}

function indentLevel(indent: string): 1 | 2 | 3 {
  // Tab counts as one nest level; every 2 spaces counts as one nest level.
  let count = 0;
  for (const ch of indent) {
    if (ch === "\t") count += 1;
  }
  const spaces = indent.replace(/\t/g, "").length;
  count += Math.floor(spaces / 2);
  if (count >= 2) return 3;
  if (count === 1) return 2;
  return 1;
}

// Inline parser — handles **bold**, *italic*, __underline__, and embedded
// `\n` hard breaks (kept in the span text).
function parseInlines(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let i = 0;
  let buf = "";
  let bold = false;
  let italic = false;
  let underline = false;

  const flush = () => {
    if (!buf) return;
    const marks: InlineMark[] = [];
    if (bold) marks.push("bold");
    if (italic) marks.push("italic");
    if (underline) marks.push("underline");
    spans.push(marks.length ? { text: buf, marks } : { text: buf });
    buf = "";
  };

  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === "**") {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    if (two === "__") {
      flush();
      underline = !underline;
      i += 2;
      continue;
    }
    if (text[i] === "*") {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return spans;
}

// Reverse — populate the editor textarea from stored blocks.
export function blocksToMarkdown(doc: RichContent): string {
  const out: string[] = [];
  for (const b of doc.blocks) {
    if (b.type === "heading") {
      out.push("#".repeat(b.level) + " " + spansToMarkdown(b.spans));
    } else if (b.type === "paragraph") {
      // Preserve hard breaks: each `\n` inside the joined span text turns
      // into `  \n` (markdown hard break).
      const md = spansToMarkdown(b.spans).replace(/\n/g, "  \n");
      out.push(md);
    } else if (b.type === "bullet") {
      const indent = "\t".repeat(Math.max(0, (b.level ?? 1) - 1));
      out.push(indent + "- " + spansToMarkdown(b.spans));
    } else if (b.type === "spacer") {
      out.push("");
    }
    out.push("");
  }
  return out.join("\n").trim();
}

function spansToMarkdown(spans: InlineSpan[]): string {
  return spans
    .map((s) => {
      let t = s.text;
      const marks = s.marks ?? [];
      if (marks.includes("bold")) t = `**${t}**`;
      if (marks.includes("italic")) t = `*${t}*`;
      if (marks.includes("underline")) t = `__${t}__`;
      return t;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Token substitution — walks the block tree, replacing {{token}} occurrences
// with resolved values. Returns the substituted doc; the original is unmodified.
// ---------------------------------------------------------------------------

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function substituteTokens(
  doc: RichContent,
  values: Record<string, string>,
): RichContent {
  return {
    blocks: doc.blocks.map((b) => {
      if (b.type === "spacer" || b.type === "image") return b;
      if (b.type === "table") {
        return {
          ...b,
          rows: b.rows.map((r) => ({
            cells: r.cells.map((c) => ({
              ...c,
              spans: substituteSpans(c.spans, values),
            })),
          })),
        };
      }
      return { ...b, spans: substituteSpans(b.spans, values) } as Block;
    }),
  };
}

function substituteSpans(
  spans: InlineSpan[],
  values: Record<string, string>,
): InlineSpan[] {
  return spans.map((s) => ({
    ...s,
    text: s.text.replace(TOKEN_RE, (_, tok: string) => {
      const v = values[tok];
      return v != null && v !== "" ? v : `[${tok}]`;
    }),
  }));
}

// Plain-text representation of a block (for diffs + accessibility).
export function blockToPlainText(b: Block): string {
  if (b.type === "spacer") return "";
  if (b.type === "image") return `[image ${b.alt ?? ""}]`.trim();
  if (b.type === "table") {
    return b.rows
      .map((r) =>
        r.cells.map((c) => c.spans.map((s) => s.text).join("")).join(" | "),
      )
      .join("\n");
  }
  return b.spans.map((s) => s.text).join("");
}
