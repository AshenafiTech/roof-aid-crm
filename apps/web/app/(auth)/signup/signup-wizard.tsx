"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createAccount,
  saveCompanyProfile,
  type SelectedPlan,
} from "./actions";

// ────────────────────────────────────────────────────────────────────────────
// Wizard state shape
// ────────────────────────────────────────────────────────────────────────────

type FormState = {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  state: string;
  password: string;
  plan: SelectedPlan | null;

  agreeData: boolean;
  agreeSupp: boolean;
  agreeTerms: boolean;

  address: string;
  licenseNumber: string;
  website: string;
};

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  state: "",
  password: "",
  plan: "free",
  agreeData: false,
  agreeSupp: false,
  agreeTerms: false,
  address: "",
  licenseNumber: "",
  website: "",
};

const STATES = [
  "Texas", "Oklahoma", "Kansas", "Colorado", "Missouri", "Nebraska",
  "Illinois", "Indiana", "Ohio", "Pennsylvania", "Florida", "Georgia",
  "North Carolina", "Tennessee", "Other",
];

const STEPS = [
  { n: 1, title: "Create Account", sub: "Plan + basic info" },
  { n: 2, title: "Agreements", sub: "Data, supplement terms, T&C" },
  { n: 3, title: "Company Profile", sub: "Business info" },
  { n: 4, title: "You're Ready", sub: "Access your dashboard" },
];

// ────────────────────────────────────────────────────────────────────────────
// Plan definitions
// ────────────────────────────────────────────────────────────────────────────

type PlanCard = {
  id: SelectedPlan;
  badge: string;
  name: string;
  priceDisplay: string;
  priceSuffix: string;
  features: string[];
  note?: string;
  isFree?: boolean;
};

const PLANS_PRIMARY: PlanCard[] = [
  {
    id: "free",
    badge: "Free",
    name: "Try Everything",
    priceDisplay: "$0",
    priceSuffix: "/forever",
    features: [
      "Full CRM pipeline",
      "Bring your own leads",
      "AI supplement engine",
      "All features unlocked (beta)",
    ],
    note: "Best for: trying Roof-Aid risk-free.",
    isFree: true,
  },
  {
    id: "tier-1",
    badge: "Tier 1",
    name: "CRM Core",
    priceDisplay: "$149",
    priceSuffix: "/mo",
    features: [
      "500 calling minutes/mo",
      "500 SMS/mo",
      "Full CRM pipeline",
      "AI supplement engine",
    ],
    note: "Best for: roofers with their own leads",
  },
  {
    id: "tier-2",
    badge: "Tier 2",
    name: "CRM + More Volume",
    priceDisplay: "$249",
    priceSuffix: "/mo",
    features: [
      "1,500 calling minutes/mo",
      "1,500 SMS/mo",
      "Full CRM pipeline",
      "AI supplement engine",
    ],
    note: "Best for: growing companies, more outbound",
  },
];

const PLANS_TIER_3: PlanCard[] = [
  {
    id: "tier-3a",
    badge: "Tier 3A",
    name: "+ Telefonista",
    priceDisplay: "$899",
    priceSuffix: "/mo",
    features: [
      "Dedicated human caller",
      "2,500 minutes/mo",
      "English + Spanish",
    ],
  },
  {
    id: "tier-3b",
    badge: "Tier 3B",
    name: "+ AI Caller 24/7",
    priceDisplay: "$1,299",
    priceSuffix: "/mo",
    features: [
      "AI caller — never stops",
      "1,500 AI voice min/mo",
      "Books inspections auto",
    ],
  },
  {
    id: "tier-3c",
    badge: "Tier 3C",
    name: "Telefonista + AI",
    priceDisplay: "$1,699",
    priceSuffix: "/mo",
    features: [
      "Human days, AI nights",
      "Full 24/7 coverage",
      "Maximum reach",
    ],
  },
];

const TIER_3_IDS: SelectedPlan[] = ["tier-3a", "tier-3b", "tier-3c"];

// ────────────────────────────────────────────────────────────────────────────

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [step1Err, setStep1Err] = useState<string | null>(null);
  const [step2Err, setStep2Err] = useState<string | null>(null);
  const [step3Err, setStep3Err] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep1(): boolean {
    setStep1Err(null);
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.companyName.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      !form.state
    ) {
      setStep1Err("All fields are required.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setStep1Err("Please enter a valid email address.");
      return false;
    }
    if (form.password.length < 8) {
      setStep1Err("Password must be at least 8 characters.");
      return false;
    }
    if (!form.plan) {
      setStep1Err("Please select a plan to continue.");
      return false;
    }
    return true;
  }

  function gotoStep(n: number) {
    setStep(n);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }

  function next1() {
    if (validateStep1()) gotoStep(2);
  }

  function submitAgreements() {
    if (!form.agreeData || !form.agreeSupp || !form.agreeTerms) {
      setStep2Err("All three agreements must be accepted.");
      return;
    }
    setStep2Err(null);
    startTransition(async () => {
      const result = await createAccount({
        firstName: form.firstName,
        lastName: form.lastName,
        companyName: form.companyName,
        email: form.email,
        phone: form.phone,
        state: form.state,
        password: form.password,
        plan: form.plan!,
        agreements: {
          dataOwnership: form.agreeData,
          supplement: form.agreeSupp,
          terms: form.agreeTerms,
        },
      });
      if (!result.ok) {
        setStep2Err(result.error);
        return;
      }
      gotoStep(3);
    });
  }

  function submitProfile() {
    setStep3Err(null);
    startTransition(async () => {
      const result = await saveCompanyProfile({
        address: form.address,
        licenseNumber: form.licenseNumber,
        website: form.website,
      });
      if (!result.ok) {
        setStep3Err(result.error);
        return;
      }
      gotoStep(4);
    });
  }

  return (
    <div className="ra-signup">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap"
        rel="stylesheet"
      />

      <div className="shell">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <Link href="/" className="sb-logo">
            <div className="sb-logo-mark">RA</div>
            <div className="sb-logo-name">
              ROOF-<span>AID</span>
            </div>
          </Link>

          <div className="sb-steps">
            {STEPS.map((s) => {
              const cls =
                s.n === step ? "active" : s.n < step ? "done" : "";
              return (
                <div key={s.n} className={`sb-step ${cls}`}>
                  <div className="sb-num">
                    <span>{s.n}</span>
                  </div>
                  <div>
                    <div className="sb-title">{s.title}</div>
                    <div className="sb-sub">{s.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sb-footer">
            <p>
              Questions?{" "}
              <a href="mailto:roofaidsales@gmail.com">roofaidsales@gmail.com</a>
              <br />
              (479) 321-9094
            </p>
            <p style={{ marginTop: 10 }}>
              Already have an account?{" "}
              <Link href="/login">Sign in</Link>
            </p>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main">
          {step === 1 && (
            <Step1
              form={form}
              update={update}
              err={step1Err}
              onNext={next1}
            />
          )}
          {step === 2 && (
            <Step2
              form={form}
              update={update}
              err={step2Err}
              pending={pending}
              onBack={() => gotoStep(1)}
              onNext={submitAgreements}
            />
          )}
          {step === 3 && (
            <Step3
              form={form}
              update={update}
              err={step3Err}
              pending={pending}
              onNext={submitProfile}
              onSkip={() => gotoStep(4)}
            />
          )}
          {step === 4 && (
            <Step4
              firstName={form.firstName}
              planLabel={form.plan ?? "free"}
              onGo={() => router.push("/dashboard")}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Steps
// ────────────────────────────────────────────────────────────────────────────

function Step1({
  form,
  update,
  err,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  err: string | null;
  onNext: () => void;
}) {
  const isTier3 = !!form.plan && TIER_3_IDS.includes(form.plan);

  return (
    <>
      <div className="screen-label">Step 1 of 4</div>
      <h1 className="screen-h">Start your free trial.</h1>
      <p className="screen-sub">
        14 days free. No credit card required.{" "}
        <strong>Pick your plan and get started in minutes.</strong>
      </p>

      {err && <div className="form-err">{err}</div>}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">First Name</label>
          <input
            className="form-input"
            placeholder="Mike"
            value={form.firstName}
            onChange={(e) => update("firstName", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Last Name</label>
          <input
            className="form-input"
            placeholder="Torres"
            value={form.lastName}
            onChange={(e) => update("lastName", e.target.value)}
          />
        </div>
      </div>

      <div className="form-row single">
        <div className="form-group">
          <label className="form-label">Company Name</label>
          <input
            className="form-input"
            placeholder="Apex Roofing LLC"
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input
            className="form-input"
            type="email"
            placeholder="you@yourcompany.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Mobile Phone</label>
          <input
            className="form-input"
            type="tel"
            placeholder="(555) 000-0000"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">State</label>
          <select
            className="form-input form-select"
            value={form.state}
            onChange={(e) => update("state", e.target.value)}
          >
            <option value="">Select your state...</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            placeholder="At least 8 characters"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />
        </div>
      </div>

      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--ra-ink)",
          marginBottom: 14,
          marginTop: 12,
        }}
      >
        Select your plan:
      </p>
      <div className="tier-grid">
        {PLANS_PRIMARY.map((p) => (
          <PlanCardEl
            key={p.id}
            plan={p}
            selected={form.plan === p.id}
            onSelect={() => update("plan", p.id)}
          />
        ))}
      </div>

      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--ra-ink)",
          marginBottom: 14,
        }}
      >
        Need a telefonista or AI caller?
      </p>
      <div className="tier-grid-3">
        {PLANS_TIER_3.map((p) => (
          <PlanCardEl
            key={p.id}
            plan={p}
            selected={form.plan === p.id}
            onSelect={() => update("plan", p.id)}
          />
        ))}
      </div>

      {isTier3 && (
        <div className="tier-demo-note">
          📅 <strong>Tier 3 includes a setup session.</strong> After completing
          your account setup, our team will reach out to configure your
          telefonista or AI caller. Your dashboard is available immediately.
        </div>
      )}

      <div className="btn-row">
        <button className="btn btn-blue" onClick={onNext}>
          Continue →
        </button>
        <span style={{ fontSize: 12, color: "var(--ra-muted)" }}>
          No credit card required · 14-day free trial
        </span>
      </div>
    </>
  );
}

function PlanCardEl({
  plan,
  selected,
  onSelect,
}: {
  plan: PlanCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const cls = [
    "tier-card",
    plan.isFree ? "is-free" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} onClick={onSelect}>
      <div className="tier-badge">{plan.badge}</div>
      <div className="tier-name">{plan.name}</div>
      <div className="tier-price">
        {plan.priceDisplay}
        <span className="mo">{plan.priceSuffix}</span>
      </div>
      <ul className="tier-features">
        {plan.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {plan.note && <div className="tier-note">{plan.note}</div>}
    </button>
  );
}

function Step2({
  form,
  update,
  err,
  pending,
  onBack,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  err: string | null;
  pending: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const allChecked = form.agreeData && form.agreeSupp && form.agreeTerms;
  return (
    <>
      <div className="screen-label">Step 2 of 4</div>
      <h1 className="screen-h">Before we begin.</h1>
      <p className="screen-sub">
        Please read and accept the following agreements.
      </p>

      {err && <div className="form-err">{err}</div>}

      <div className="agree-box">
        <div className="agree-section">
          <div className="agree-section-title">A — Data &amp; Ownership</div>
          <div className="agree-scroll">
            <p>
              Data you upload into Roof-Aid CRM — including your own customer
              lists, company information, and files — remains your property at
              all times.
            </p>
            <p>
              Data generated by Roof-Aid, including storm lead lists purchased
              through the platform, AI supplement analysis results, calling
              scripts, and outreach sequence outputs, remains the property of
              Roof-Aid CRM and is licensed to you for use during your active
              subscription.
            </p>
            <p>
              Upon cancellation of your subscription, you may export your
              uploaded data within 30 days. After 30 days, data may be deleted
              from our servers.
            </p>
          </div>
          <label className="agree-check">
            <input
              type="checkbox"
              checked={form.agreeData}
              onChange={(e) => update("agreeData", e.target.checked)}
            />
            <span>I have read and agree to the Data &amp; Ownership terms</span>
          </label>
        </div>

        <div className="agree-section">
          <div className="agree-section-title">
            B — Supplement Engine Fee Agreement
          </div>
          <div className="agree-scroll">
            <p>
              When you upload a scope of damage or insurance estimate, you
              authorize Roof-Aid to analyze it and identify potential
              supplement opportunities.
            </p>
            <p>
              <strong>Approved in full:</strong> Roof-Aid earns 10% of the
              total approved supplement value, charged automatically upon
              confirmation.
            </p>
            <p>
              <strong>Partially approved:</strong> Upload the partial approval
              letter and enter the approved amount within 15 days. Roof-Aid
              charges 10% of the reported approved amount.
            </p>
            <p>
              <strong>Denied:</strong> Upload the denial letter within 15
              days. No fee is charged.
            </p>
          </div>
          <label className="agree-check">
            <input
              type="checkbox"
              checked={form.agreeSupp}
              onChange={(e) => update("agreeSupp", e.target.checked)}
            />
            <span>
              I have read and agree to the Supplement Engine fee terms
            </span>
          </label>
        </div>

        <div className="agree-section">
          <div className="agree-section-title">C — Terms of Service</div>
          <div className="agree-scroll">
            <p>By creating a Roof-Aid CRM account you agree to:</p>
            <p>
              <strong>1. Subscription &amp; Billing:</strong> Your 14-day free
              trial begins at account creation. After 14 days, if a valid
              payment method is on file, your account converts to a paid
              subscription. Cancel anytime before the trial ends to avoid
              charges.
            </p>
            <p>
              <strong>2. Calling Compliance:</strong> You are responsible for
              ensuring all outbound calls and messages comply with TCPA, Do
              Not Call registry requirements, and all applicable regulations.
            </p>
            <p>
              <strong>3. Acceptable Use:</strong> The platform may not be used
              for harassment, spam, or any unlawful purpose.
            </p>
            <p>
              <strong>4. No Guarantee of Results:</strong> Roof-Aid does not
              guarantee specific outcomes.
            </p>
            <p>
              <strong>5. Limitation of Liability:</strong> Roof-Aid&apos;s
              liability is limited to the monthly subscription amount paid in
              the billing period in which the claim arises.
            </p>
          </div>
          <label className="agree-check">
            <input
              type="checkbox"
              checked={form.agreeTerms}
              onChange={(e) => update("agreeTerms", e.target.checked)}
            />
            <span>I have read and agree to the Terms of Service</span>
          </label>
        </div>
      </div>

      <div className="btn-row">
        <button
          className="btn btn-blue"
          disabled={!allChecked || pending}
          onClick={onNext}
        >
          {pending ? "Creating your workspace..." : "I Agree — Create Account →"}
        </button>
        <button className="btn btn-ghost" disabled={pending} onClick={onBack}>
          ← Back
        </button>
      </div>
    </>
  );
}

function Step3({
  form,
  update,
  err,
  pending,
  onNext,
  onSkip,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  err: string | null;
  pending: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="screen-label">Step 3 of 4</div>
      <h1 className="screen-h">Your company profile.</h1>
      <p className="screen-sub">
        This information appears on your documents and outreach.{" "}
        <strong>You can update it anytime.</strong>
      </p>

      {err && <div className="form-err">{err}</div>}

      <div className="form-row single">
        <div className="form-group">
          <label className="form-label">Business Address</label>
          <input
            className="form-input"
            placeholder="123 Main St, Dallas, TX 75001"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            License Number{" "}
            <span style={{ fontWeight: 400, color: "var(--ra-muted)" }}>
              (optional)
            </span>
          </label>
          <input
            className="form-input"
            placeholder="TX-ROO-12345"
            value={form.licenseNumber}
            onChange={(e) => update("licenseNumber", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            Website{" "}
            <span style={{ fontWeight: 400, color: "var(--ra-muted)" }}>
              (optional)
            </span>
          </label>
          <input
            className="form-input"
            type="url"
            placeholder="https://yourcompany.com"
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
          />
        </div>
      </div>

      <div className="btn-row">
        <button
          className="btn btn-blue"
          disabled={pending}
          onClick={onNext}
        >
          {pending ? "Saving..." : "Save & Continue →"}
        </button>
        <button className="btn btn-ghost" disabled={pending} onClick={onSkip}>
          Skip for Now
        </button>
      </div>
    </>
  );
}

function Step4({
  firstName,
  planLabel,
  onGo,
}: {
  firstName: string;
  planLabel: string;
  onGo: () => void;
}) {
  return (
    <div className="success-screen">
      <div className="success-icon">🎉</div>
      <h1 className="success-h">
        You&apos;re all set{firstName ? `, ${firstName}` : ""}.
      </h1>
      <p style={{ color: "var(--ra-muted)", fontSize: 14 }}>
        Plan selected: <strong>{planLabel}</strong>
      </p>
      <div className="success-checks">
        <div className="success-check">
          <span className="ck">✓</span> Account created
        </div>
        <div className="success-check">
          <span className="ck">✓</span> Agreements accepted
        </div>
        <div className="success-check">
          <span className="ck">✓</span> Company profile saved
        </div>
        <div className="success-check" style={{ color: "var(--ra-muted)" }}>
          <span style={{ color: "var(--ra-accent)", fontSize: 18, fontWeight: 700 }}>
            📞
          </span>{" "}
          Pick a phone number from the dashboard to enable calling
        </div>
      </div>
      <button
        className="btn btn-blue"
        style={{ margin: "0 auto", display: "flex" }}
        onClick={onGo}
      >
        Go to My Dashboard →
      </button>
    </div>
  );
}
