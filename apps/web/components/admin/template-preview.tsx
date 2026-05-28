"use client";

// Live, page-styled rendering of a template document. Used both as the
// inline view on the detail page and as the "Preview" tab inside the
// editor. The template author can switch between Edit and Preview and
// the preview reflects in-memory state instantly.
//
// The layout / typography intentionally mirrors the real PDF output:
//   - Sans-serif body, bold sans-serif title and section headings
//   - Diagonal tiled text watermark on every page
//   - Inline "Label: ____ Date: ___" signature rows
//
// Merge fields stay as visual placeholders (the template doesn't know
// the prospect yet) — header rows show dashed fillable lines, inline
// {{tokens}} render as dashed chips with the human label.

import { Fragment, createContext, useContext, useMemo } from "react";

import type { Block, InlineSpan } from "@/lib/templates/blocks";
import type { Section } from "@/lib/templates/sections";
import {
  TEMPLATE_TITLES,
  type TemplateKind,
} from "@/lib/templates/template-kinds";
import { tokensFor } from "@/lib/templates/tokens";

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

const TokenLabelsContext = createContext<Record<string, string>>({});

const DOCUMENT_TITLES: Record<TemplateKind, string> = {
  "3rd_party_auth":
    "Third-Party Authorization & Contractor Communication Agreement",
  acv_contract: "ACV Contract",
  rcv_contract: "RCV Contract",
  supplement: "Supplement Document",
};

interface SurfaceProps {
  kind: TemplateKind;
  sections: Section[];
  /** When true, caps height and scrolls internally (for dialogs). */
  scrollable?: boolean;
  /** Live tenant company name. When provided, fills the Contractor
   *  header row and substitutes inline {{contractor_name}} tokens so the
   *  preview matches what the customer will see. */
  tenantName?: string;
}

// Tokens whose values are known at template-design time and should be
// rendered verbatim instead of as placeholder chips.
interface ResolvedTokens {
  contractor_name?: string;
}

const ResolvedTokensContext = createContext<ResolvedTokens>({});

export function TemplatePreviewSurface({
  kind,
  sections,
  scrollable = false,
  tenantName,
}: SurfaceProps) {
  const tokenLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tokensFor(kind)) map[t.token] = t.label;
    return map;
  }, [kind]);

  const resolvedTokens = useMemo<ResolvedTokens>(
    () => ({ contractor_name: tenantName?.trim() || undefined }),
    [tenantName],
  );

  return (
    <TokenLabelsContext.Provider value={tokenLabels}>
      <ResolvedTokensContext.Provider value={resolvedTokens}>
        <div
          className={
            "rounded border bg-white text-black shadow-inner" +
            (scrollable ? " max-h-[70vh] overflow-y-auto" : "")
          }
        >
          <div className="relative mx-auto max-w-[700px] px-10 py-12 font-sans text-[13px] leading-relaxed">
            <Watermark />
            <div className="relative z-10 space-y-5">
              <FixedHeader
                title={DOCUMENT_TITLES[kind] ?? TEMPLATE_TITLES[kind]}
                contractorName={resolvedTokens.contractor_name}
              />
              {sections.length === 0 ? (
                <p className="italic text-gray-500">
                  No sections yet. Add a section to see it here.
                </p>
              ) : (
                sections.map((s, idx) => (
                  <SectionView
                    key={s.id}
                    number={idx + 1}
                    title={s.title}
                    blocks={s.content}
                  />
                ))
              )}
              <SignatureBlock tenantName={resolvedTokens.contractor_name} />
            </div>
          </div>
        </div>
      </ResolvedTokensContext.Provider>
    </TokenLabelsContext.Provider>
  );
}

// Diagonal tiled wordmark + tagline, intentionally low-contrast so it
// reads as a watermark instead of content. Mirrors the look in the
// reference document the owner provided.
function Watermark() {
  const cells = Array.from({ length: 9 });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
    >
      <div className="absolute inset-[-25%] -rotate-[24deg]">
        <div className="grid grid-cols-3 gap-x-16 gap-y-24">
          {cells.map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center text-gray-300/70"
            >
              <span className="text-2xl font-bold tracking-wider">ROOF AID</span>
              <span className="text-[10px] uppercase tracking-[0.2em]">
                AI Driven, Built by Roofers.
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em]">
                Maximum Revenue.
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FixedHeader({
  title,
  contractorName,
}: {
  title: string;
  contractorName?: string;
}) {
  return (
    <div className="space-y-3 border-b border-gray-400 pb-4">
      <h1 className="text-center text-[15px] font-bold leading-snug">
        {title}
      </h1>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[12px]">
        <MetaRow label="Claim number" />
        <MetaRow label="Date of loss" />
        <MetaRow label="Date" />
        <MetaRow label="Homeowner(s)" />
        <MetaRow label="Property Address" fullWidth />
        <MetaRow label="Contractor" value={contractorName} fullWidth />
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value?: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={
        "flex items-baseline gap-2" + (fullWidth ? " col-span-2" : "")
      }
    >
      <span className="font-bold whitespace-nowrap">{label}:</span>
      {value ? (
        <span className="font-medium">{value}</span>
      ) : (
        <span className="inline-block min-w-[120px] flex-1 translate-y-1 border-b border-dashed border-gray-400" />
      )}
    </div>
  );
}

function SectionView({
  number,
  title,
  blocks,
}: {
  number: number;
  title: string;
  blocks: Block[];
}) {
  const titleLines = title.split("\n");
  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-bold">
        {number}.{" "}
        {titleLines.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            <InlineWithTokens text={line} />
          </Fragment>
        ))}
      </h2>
      <div className="space-y-2">
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </div>
    </section>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "spacer") return <div className="h-3" />;
  if (block.type === "image") {
    return (
      <div className="italic text-gray-500">
        [image{block.alt ? `: ${block.alt}` : ""}]
      </div>
    );
  }
  if (block.type === "heading") {
    const size =
      block.level === 1
        ? "text-[14px]"
        : block.level === 2
          ? "text-[13px] italic"
          : "text-[12px] italic";
    return (
      <div className={`${size} font-semibold`}>
        <Spans spans={block.spans} />
      </div>
    );
  }
  if (block.type === "paragraph") {
    return (
      <p>
        <Spans spans={block.spans} />
      </p>
    );
  }
  if (block.type === "bullet") {
    const indent = ((block.level ?? 1) - 1) * 1.25;
    return (
      <div style={{ marginLeft: `${indent}rem` }} className="pl-4 -indent-4">
        -{" "}
        <Spans spans={block.spans} />
      </div>
    );
  }
  if (block.type === "ordered") {
    const indent = ((block.level ?? 1) - 1) * 1.25;
    return (
      <div style={{ marginLeft: `${indent}rem` }} className="pl-6 -indent-6">
        {block.index}.{" "}
        <Spans spans={block.spans} />
      </div>
    );
  }
  if (block.type === "table") {
    return (
      <table className="w-full border-collapse border border-gray-400 text-[12px]">
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {row.cells.map((cell, ci) => {
                const Tag = cell.header ? "th" : "td";
                return (
                  <Tag
                    key={ci}
                    className={`border border-gray-400 px-2 py-1 align-top ${cell.header ? "bg-gray-100 font-semibold" : ""}`}
                  >
                    <Spans spans={cell.spans} />
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

function Spans({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((s, i) => {
        const marks = s.marks ?? [];
        const className = [
          marks.includes("bold") && "font-semibold",
          marks.includes("italic") && "italic",
          marks.includes("underline") && "underline",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <span key={i} className={className || undefined}>
            <InlineWithTokens text={s.text} />
          </span>
        );
      })}
    </>
  );
}

function InlineWithTokens({ text }: { text: string }) {
  const labels = useContext(TokenLabelsContext);
  const resolved = useContext(ResolvedTokensContext);
  const nodes: React.ReactNode[] = [];

  let cursor = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(renderTextWithBreaks(text.slice(cursor, match.index), `t-${cursor}`));
    }
    const token = match[1].toLowerCase();
    // Tokens whose live value is known at design time (e.g. the tenant
    // company name) render as plain text. Everything else stays as a
    // dashed placeholder chip because the value depends on the prospect.
    const resolvedValue = (resolved as Record<string, string | undefined>)[token];
    if (resolvedValue) {
      nodes.push(
        <span key={`tok-${match.index}`}>{resolvedValue}</span>,
      );
    } else {
      nodes.push(
        <TokenPlaceholder key={`tok-${match.index}`} label={labels[token] ?? token} />,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    nodes.push(renderTextWithBreaks(text.slice(cursor), `t-${cursor}`));
  }
  return <>{nodes}</>;
}

function renderTextWithBreaks(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split("\n");
  return parts.map((p, idx) => (
    <Fragment key={`${keyPrefix}-${idx}`}>
      {idx > 0 && <br />}
      {p}
    </Fragment>
  ));
}

function TokenPlaceholder({ label }: { label: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded border border-dashed border-gray-400 bg-gray-50 px-1.5 py-0 align-baseline text-[11px] font-medium text-gray-500">
      {label}
    </span>
  );
}

// Signature block mirrors the reference document: numbered "Signatures"
// heading, then for each signer a "<role> Signature: ____ Date: ____"
// row followed by a "Printed Name: ___" row.
function SignatureBlock({ tenantName }: { tenantName?: string }) {
  const repLabel = tenantName
    ? `${tenantName} Representative Signature`
    : "Contractor Representative Signature";
  return (
    <section className="space-y-4 border-t border-gray-400 pt-5 text-[12px]">
      <h2 className="text-[15px] font-bold">7. Signatures</h2>
      <SignerRow label="Homeowner Signature" />
      <PrintedNameRow />
      <SignerRow label="Co-Homeowner Signature (if applicable)" />
      <PrintedNameRow />
      <SignerRow label="Contractor Acceptance" />
      <SignerRow label={repLabel} />
      <PrintedNameRow />
    </section>
  );
}

function SignerRow({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-4">
      <span className="font-bold whitespace-nowrap">{label}:</span>
      <span className="flex-1 border-b border-gray-500" />
      <span className="font-bold whitespace-nowrap">Date:</span>
      <span className="w-24 border-b border-gray-500" />
    </div>
  );
}

function PrintedNameRow() {
  return (
    <div className="flex items-end gap-4">
      <span className="font-bold whitespace-nowrap">Printed Name:</span>
      <span className="flex-1 border-b border-gray-500" />
    </div>
  );
}
