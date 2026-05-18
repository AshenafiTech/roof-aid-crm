// Canonical default sections per template kind. Used when the tenant
// has not yet published a custom version, so the editor opens
// pre-populated and the Edge Function can render even with no
// active_version_id set.

import type { Block, InlineSpan } from "@/lib/templates/blocks";
import { newSection, type Section, type TemplateDoc } from "@/lib/templates/sections";
import type { TemplateKind } from "@/lib/templates/template-kinds";

// Small helpers for declaring blocks tersely.
const p = (text: string): Block => ({
  type: "paragraph",
  spans: spansOf(text),
});
const b = (text: string, level: 1 | 2 | 3 = 1): Block => ({
  type: "bullet",
  level,
  spans: spansOf(text),
});
const para = (...spans: InlineSpan[]): Block => ({ type: "paragraph", spans });
const bold = (text: string): InlineSpan => ({ text, marks: ["bold"] });
const plain = (text: string): InlineSpan => ({ text });

function spansOf(text: string): InlineSpan[] {
  return [{ text }];
}

// Stable IDs so re-saving the same defaults doesn't churn the audit log.
function s(id: string, title: string, content: Block[]): Section {
  return newSection({ id: `default-${id}`, title, content });
}

// ---------------------------------------------------------------------------
// 3rd Party Authorization — UPPA-compliant
// ---------------------------------------------------------------------------
function thirdPartyAuth(): Section[] {
  return [
    s("3pa-purpose", "Purpose of Agreement", [
      p(
        "Homeowner authorizes {{contractor_name}} to inspect, document, photograph, and evaluate the property solely for the purpose of preparing a construction estimate and determining the scope of repairs required due to the reported loss.",
      ),
      para(bold("Not an Insurance Adjusting Agreement")),
      p(
        "{{contractor_name}} is not a public adjuster and does not provide services that constitute the interpretation of insurance policy coverage, negotiation of claim settlements, or representation of the Homeowner in an adjusting capacity.",
      ),
    ]),
    s("3pa-comm", "Authorization to Communicate with Insurance Carrier", [
      p(
        "The Homeowner authorizes {{contractor_name}} to communicate with the insurance company ONLY regarding:",
      ),
      b("Construction scope of work"),
      b("Contractor pricing"),
      b("Required materials and labor"),
      b("Building code–required items"),
      b("Documentation of damages"),
      p(
        "{{contractor_name}} may submit contractor documentation, photos, measurements, estimates, and requests for review of omitted construction items (“supplement requests”). All insurance coverage decisions remain exclusively between the Homeowner and the insurance carrier.",
      ),
    ]),
    s("3pa-scope", "Contractor Scope & Pricing", [
      p(
        "In the event the insurance carrier approves the claim, this Agreement becomes a construction contract. {{contractor_name}} will perform repairs for the approved insurance scope amount, plus deductible and any non-covered items elected by the Homeowner.",
      ),
    ]),
    s("3pa-cancel", "Cancellation", [
      p(
        "If the Homeowner cancels after {{contractor_name}} has performed inspection, documentation, or construction-related services, Homeowner agrees to compensate {{contractor_name}} for the reasonable value of those services. This is NOT a fee for claim adjusting and does not relate to coverage or settlement negotiation.",
      ),
    ]),
    s("3pa-funds", "Release of Insurance Funds", [
      p(
        "Homeowner agrees to provide {{contractor_name}} with all applicable insurance proceeds for the work {{contractor_name}} performs. Insurance checks payable to the Homeowner and Contractor must be endorsed and released upon receipt.",
      ),
    ]),
    s("3pa-uppa", "UPPA Compliance Notice", [
      p("{{contractor_name}} is not a public insurance adjuster. {{contractor_name}} does not:"),
      b("Interpret or explain insurance policy coverage"),
      b("Negotiate insurance settlements"),
      b("Act on behalf of the Homeowner in adjusting a claim"),
      p(
        "{{contractor_name}}’s role is strictly limited to construction services and providing documentation necessary for the insurer to evaluate required repairs.",
      ),
      para(
        plain("If the Homeowner "),
        bold("terminates this Agreement after {{contractor_name}} has received the initial ACV payment"),
        plain(" or otherwise cancels the work:"),
      ),
      b(
        "The Homeowner agrees to compensate {{contractor_name}} for all work performed up to termination, including inspections, photographs, documentation, estimates, and communication/negotiation with the insurance company.",
      ),
      para(bold("Compensation Amount:"), plain(" The greater of:")),
      b("Flat fee of $4,000, or", 2),
      b("25% of total approved insurance claim (RCV + Supplements).", 2),
      para(
        plain("Payment is due immediately upon termination. This fee is "),
        bold("not a penalty"),
        plain(", but a fair estimate of services rendered."),
      ),
    ]),
  ];
}

// ---------------------------------------------------------------------------
// ACV / RCV contracts
// ---------------------------------------------------------------------------
function valuationContract(label: "Actual Cash Value (ACV)" | "Replacement Cost Value (RCV)"): Section[] {
  return [
    s("vc-intro", "Scope of Agreement", [
      p(
        `This agreement is entered into by {{homeowner_name}} (“Homeowner”) for roofing work to be performed at {{property_address}}. The scope and pricing of the work are determined by the ${label} methodology used by the homeowner’s insurance carrier.`,
      ),
    ]),
    s("vc-fields", "Claim Details", [
      para(bold("Insurance carrier: "), plain("{{insurance_company}}")),
      para(bold("Claim #: "), plain("{{claim_number}}")),
      para(bold("Deductible: "), plain("{{deductible}}")),
      para(bold("Total job cost: "), plain("{{total_job_cost}}")),
    ]),
    s("vc-scope", "Scope of Work", [p("{{scope_of_work}}")]),
    s("vc-funds", "Release of Insurance Funds", [
      p(
        "The Homeowner agrees that the contractor may receive payment directly from the insurance carrier where permitted, and assigns the insurance proceeds for the covered scope to the contractor in accordance with applicable law.",
      ),
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Supplement
// ---------------------------------------------------------------------------
function supplement(): Section[] {
  return [
    s("sup-intro", "Supplement Overview", [
      p(
        "This supplement is attached to the homeowner contract dated {{today}}. Detailed line items are enumerated below.",
      ),
    ]),
    s("sup-items", "Line Items", [p("Add line items here.")]),
  ];
}

export function getDefaultSections(kind: TemplateKind): Section[] {
  switch (kind) {
    case "3rd_party_auth":
      return thirdPartyAuth();
    case "acv_contract":
      return valuationContract("Actual Cash Value (ACV)");
    case "rcv_contract":
      return valuationContract("Replacement Cost Value (RCV)");
    case "supplement":
      return supplement();
  }
}

export function getDefaultDoc(kind: TemplateKind): TemplateDoc {
  return { sections: getDefaultSections(kind) };
}
