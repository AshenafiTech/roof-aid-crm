import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

import "./login.css";

export const metadata = {
  title: "Sign in — Roof-Aid CRM",
  description: "Sign in to your Roof-Aid CRM workspace",
};

export default function LoginPage() {
  return (
    <div className="ra-login">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700&display=swap"
        rel="stylesheet"
      />

      <div className="shell">
        {/* LEFT — Brand panel */}
        <aside className="brand">
          <div className="brand-bg-grid" />
          <div className="brand-glow" />
          <div className="brand-glow-2" />

          <Link href="/" className="brand-logo">
            <div className="brand-logo-mark">RA</div>
            <div className="brand-logo-name">
              ROOF-<span>AID</span>
            </div>
          </Link>

          <div className="brand-mid">
            <div className="brand-tag">
              <span className="live-dot" />
              AI Driven · Built by Roofers
            </div>
            <h1 className="brand-h1">
              First to the Homeowner.
              <em>Every Time.</em>
            </h1>
            <p className="brand-p">
              The only CRM built for storm restoration.{" "}
              <strong>
                Reach 500+ homeowners the morning after a storm
              </strong>{" "}
              — automatically, in English and Spanish.
            </p>
            <div className="brand-numbers">
              <div className="bn">
                <div className="bn-val">500+</div>
                <div className="bn-lbl">Contacts/day</div>
              </div>
              <div className="bn">
                <div className="bn-val">60</div>
                <div className="bn-lbl">Inspections/week</div>
              </div>
              <div className="bn">
                <div className="bn-val">$4K</div>
                <div className="bn-lbl">Avg supplement</div>
              </div>
            </div>
          </div>

          <div className="brand-foot">
            Questions?{" "}
            <a href="mailto:roofaidsales@gmail.com">
              roofaidsales@gmail.com
            </a>
            <br />
            (479) 321-9094
          </div>
        </aside>

        {/* RIGHT — Form */}
        <section className="form-panel">
          <div className="form-card">
            <div className="screen-label">Welcome back</div>
            <h1 className="screen-h">Sign in to Roof-Aid.</h1>
            <p className="screen-sub">
              Pick up where you left off. Enter your credentials below to
              access your workspace.
            </p>

            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>

            <div className="divider">New here</div>
            <Link href="/signup" className="signup-cta">
              Create a workspace — Start free →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
