import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import "./landing.css";

export const metadata = {
  title: "Roof-Aid CRM — First to the Homeowner. Every Time.",
  description:
    "The only CRM built for storm restoration. Reach 500+ homeowners the morning after a storm — automatically, in English and Spanish.",
};

export default async function LandingPage() {
  // Check auth so the header can show either "Sign in / Sign up" (visitor)
  // or "Go to dashboard" (signed-in user). The middleware lets `/` be
  // viewed in both states; we just adapt the chrome.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthed = !!user;

  return (
    <div className="ra-landing">
      {/* Brand fonts. We load these inline so the marketing site looks the
          same in dev and prod without modifying the global layout fonts
          used by the dashboard. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300&display=swap"
        rel="stylesheet"
      />

      <nav className="ra-nav">
        <Link href="/" className="logo">
          <div className="logo-mark">RA</div>
          <span className="logo-name">
            ROOF-<span>AID</span>
          </span>
        </Link>
        <div className="nav-right">
          <a href="#how" className="nav-link">
            How It Works
          </a>
          <a href="#pricing" className="nav-link">
            Pricing
          </a>
          {isAuthed ? (
            <Link href="/dashboard" className="nav-btn">
              Go to Dashboard →
            </Link>
          ) : (
            <>
              <Link href="/login" className="nav-link">
                Log in
              </Link>
              <Link href="/signup" className="nav-btn">
                Sign Up →
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-bg-grid" />
        <div className="hero-glow-l" />
        <div className="hero-glow-r" />

        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-tag">
              <span className="live-dot" />
              AI Driven · Built by Roofers
            </div>

            <h1 className="hero-h1">
              First to the
              <br />
              Homeowner.
              <em>Every Time.</em>
            </h1>

            <p className="hero-p">
              The only CRM built for storm restoration.{" "}
              <strong>
                Reach 500+ homeowners the morning after a storm
              </strong>{" "}
              — automatically, in English and Spanish — before anyone else gets
              there.
            </p>

            <div className="hero-numbers">
              <div className="hn">
                <div className="hn-val">500+</div>
                <div className="hn-lbl">Contacts/day</div>
              </div>
              <div className="hn">
                <div className="hn-val">60</div>
                <div className="hn-lbl">Inspections/week</div>
              </div>
              <div className="hn">
                <div className="hn-val">$4K</div>
                <div className="hn-lbl">Avg supplement recovered</div>
              </div>
              <div className="hn">
                <div className="hn-val">24/7</div>
                <div className="hn-lbl">AI voice caller</div>
              </div>
            </div>

            <div className="hero-btns">
              <Link href="/signup" className="btn-blue">
                Start Your Free Trial <span>→</span>
              </Link>
              <a href="#how" className="btn-ghost">
                ▶ &nbsp;Watch 90-sec demo
              </a>
            </div>
          </div>

          {/* CTA card */}
          <div className="hero-card" id="demo">
            <div className="card-eyebrow">Start Your Free Trial</div>
            <div className="card-title">
              See it work with your leads, in your market.
            </div>
            <div className="card-sub">
              White-glove setup call included. We import your first storm leads
              and run your first calling session live — you see a booked
              appointment before we hang up.
            </div>

            <Link href="/signup" className="f-submit">
              Sign Up Free — Start Trial Today →
            </Link>
            <div className="f-legal">
              No credit card required · 14-day free trial · Cancel anytime
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 18,
                borderTop: "1px solid var(--ra-border)",
                textAlign: "center",
                fontSize: 13,
                color: "var(--ra-muted)",
              }}
            >
              Already have an account?{" "}
              <Link
                href="/login"
                style={{ color: "var(--ra-blue)", fontWeight: 600 }}
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="trust-bar">
        <div className="trust-item">
          <span>🌩️</span> Storm-triggered outreach — automatic
        </div>
        <div className="trust-item">
          <span>🤖</span> AI voice caller — 24/7, never misses a lead
        </div>
        <div className="trust-item">
          <span>🇲🇽</span> Full English + Spanish — built in
        </div>
        <div className="trust-item">
          <span>📋</span> AI supplement engine — every tier
        </div>
        <div className="trust-item">
          <span>📱</span> Mobile-first — works on your iPhone
        </div>
      </div>

      <section className="sec">
        <div className="container">
          <div className="sec-label">Why Roofers Choose Roof-Aid</div>
          <h2 className="sec-h2">
            Three problems.
            <br />
            One platform.
          </h2>
          <p className="sec-p">
            Whether you follow storms or work a fixed market, the same three
            things are costing you contracts and money every season.
          </p>

          <div className="problem-grid">
            <div className="problem-tile">
              <div className="tile-num">01</div>
              <div className="tile-h">
                You can&apos;t reach enough homeowners fast enough
              </div>
              <div className="tile-p">
                Door-to-door hits 50–60 homes per day. Manual calling gets you
                80–120. Roof-Aid contacts 500–1,000 homeowners automatically —
                the morning after the storm, before anyone else in that market.
              </div>
              <span className="tile-tag">Speed</span>
            </div>
            <div className="problem-tile">
              <div className="tile-num">02</div>
              <div className="tile-h">
                Your leads have no system behind them
              </div>
              <div className="tile-p">
                Spreadsheets, sticky notes, and text threads lose deals.
                Roof-Aid gives you a full CRM pipeline — from first contact to
                signed contract to paid claim — with every call, SMS, and
                email tracked automatically.
              </div>
              <span className="tile-tag">Organization</span>
            </div>
            <div className="problem-tile">
              <div className="tile-num">03</div>
              <div className="tile-h">
                You&apos;re leaving supplement money on the table
              </div>
              <div className="tile-p">
                Most contractors capture less than 40% of available supplement
                value per claim. Our AI reads the adjuster&apos;s estimate and
                identifies every missed line item automatically. Average
                recovery: $4,000 per supplement.
              </div>
              <span className="tile-tag">Revenue</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="container">
          <div className="sec-label">Platform Comparison</div>
          <h2 className="sec-h2">Roof-Aid vs. the rest.</h2>
          <p className="sec-p">
            Generic roofing CRMs track jobs. Roof-Aid{" "}
            <strong>
              creates revenue, reaches homeowners first, and recovers money
              you&apos;re already owed.
            </strong>{" "}
            That&apos;s a different product category entirely.
          </p>

          <div className="comp-wrap">
            <table className="comp-table">
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>Feature</th>
                  <th className="col-us-first">⭐ ROOF-AID CRM</th>
                  <th className="col-comp">AccuTracker™</th>
                  <th className="col-comp">NimbusPro™</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["CRM & Pipeline Management", "All tiers", true, true],
                  ["Storm Lead Lists (auto-imported)", "Any tier + add-on", false, false],
                  ["AI Supplement Engine", "Every tier", false, false],
                  ["Outbound Calling Infrastructure", "All tiers", false, false],
                  ["Dedicated Human Telefonista", "Tiers 3A & 3C", false, false],
                  ["AI 24/7 Voice Caller", "Tiers 3B & 3C", false, false],
                  ["Spanish-Language Outreach", "Built in", false, false],
                  ["Storm-Triggered Auto-Import", "Automated", false, false],
                ].map(([feature, us, them1, them2]) => (
                  <tr key={feature as string}>
                    <td>{feature}</td>
                    <td className="col-us-first">
                      <span className="chk">✓</span> {us}
                    </td>
                    <td className="col-comp">
                      <span className={them1 ? "chk" : "crs"}>
                        {them1 ? "✓" : "✗"}
                      </span>
                    </td>
                    <td className="col-comp">
                      <span className={them2 ? "chk" : "crs"}>
                        {them2 ? "✓" : "✗"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec" id="how">
        <div className="container">
          <div className="sec-label">How It Works</div>
          <h2 className="sec-h2">Storm hits. Roof-Aid moves.</h2>
          <p className="sec-p">
            From the moment a hail event is confirmed in your market, the
            platform works automatically — no manual setup required on your
            end.
          </p>

          <div className="steps">
            {[
              [
                "1",
                "Storm Detected",
                "Our data feed confirms a hail event. Homeowner leads for your service area are imported automatically into your CRM.",
                "Day 0 — Automatic",
              ],
              [
                "2",
                "AI Caller Dials",
                "Your AI voice caller (or human telefonista) starts contacting homeowners immediately. 500+ contacts per day, in English and Spanish.",
                "Day 1 — Morning",
              ],
              [
                "3",
                "Inspections Booked",
                "Interested homeowners book directly into your calendar. No manual follow-up. No missed callbacks. Every lead tracked in your pipeline.",
                "Day 1–3 — Real-time",
              ],
              [
                "4",
                "Supplements Recovered",
                "AI reads each adjuster estimate and identifies missed line items. Average recovery is $4,000 per claim — money you were already leaving behind.",
                "At Claim — Automatic",
              ],
            ].map(([n, h, p, t]) => (
              <div key={n} className="step">
                <div className="step-circle">{n}</div>
                <div className="step-h">{h}</div>
                <div className="step-p">{p}</div>
                <div className="step-timing">{t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="pricing">
        <div className="container">
          <div className="sec-label">Simple Pricing</div>
          <h2 className="sec-h2">Pick your level of output.</h2>
          <p className="sec-p">
            Start free, then scale up. Every paid tier includes the AI
            supplement engine — because that&apos;s money you&apos;re already
            owed on every single claim.
          </p>

          {/* Free + Tier 1 + Tier 2 row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
              marginTop: 56,
            }}
            className="ra-pricing-top"
          >
            <div className="p-card free">
              <div className="p-head">
                <div className="free-badge">Start Here</div>
                <div className="p-tier">Free</div>
                <div className="p-name">Try Everything</div>
                <div className="p-price">
                  $0<span className="p-mo">/forever</span>
                </div>
              </div>
              <div className="p-body">
                <ul className="p-feats">
                  <li>Full CRM pipeline &amp; mobile app</li>
                  <li>Bring your own leads — no limits while we&apos;re in beta</li>
                  <li>Document management</li>
                  <li>AI supplement engine (10% only when approved)</li>
                  <li>Calling &amp; SMS available — pay as you go</li>
                  <li>No credit card required</li>
                </ul>
                <Link href="/signup" className="p-cta free">
                  Start Free →
                </Link>
                <div className="p-note">
                  Best for: trying Roof-Aid risk-free before committing to a
                  paid tier.
                </div>
              </div>
            </div>

            <div className="p-card">
              <div className="p-head">
                <div className="p-tier">Tier 1</div>
                <div className="p-name">CRM Core</div>
                <div className="p-price">
                  $149<span className="p-mo">/mo</span>
                </div>
              </div>
              <div className="p-body">
                <ul className="p-feats">
                  <li>Full CRM pipeline &amp; mobile app</li>
                  <li>500 outbound calling minutes/mo</li>
                  <li>500 SMS messages/mo</li>
                  <li>Document management</li>
                  <li>AI supplement engine (10% commission)</li>
                  <li>Bring your own leads</li>
                </ul>
                <Link href="/signup" className="p-cta outline">
                  Start 14-day Trial →
                </Link>
                <div className="p-note">
                  Best for: roofers with their own lead sources who want a
                  system behind them
                </div>
              </div>
            </div>

            <div className="p-card">
              <div className="p-head">
                <div className="p-tier">Tier 2</div>
                <div className="p-name">CRM + More Volume</div>
                <div className="p-price">
                  $249<span className="p-mo">/mo</span>
                </div>
              </div>
              <div className="p-body">
                <ul className="p-feats">
                  <li>Everything in Tier 1</li>
                  <li>1,500 outbound calling minutes/mo</li>
                  <li>1,500 SMS messages/mo</li>
                  <li>AI supplement engine (10% commission)</li>
                  <li>Storm lead list add-on: $799 / $599</li>
                </ul>
                <Link href="/signup" className="p-cta outline">
                  Start 14-day Trial →
                </Link>
                <div className="p-note">
                  Best for: growing companies making more outbound calls
                </div>
              </div>
            </div>
          </div>

          {/* Tier 3 row */}
          <div className="pricing-grid-3">
            <div className="p-card">
              <div className="p-head">
                <div className="p-tier">Tier 3A</div>
                <div className="p-name">CRM + Dedicated Telefonista</div>
                <div className="p-price">
                  $899<span className="p-mo">/mo</span>
                </div>
              </div>
              <div className="p-body">
                <ul className="p-feats">
                  <li>Dedicated human telefonista — yours exclusively</li>
                  <li>60 outbound contacts per day</li>
                  <li>2,500 calling minutes/mo</li>
                  <li>2,500 SMS messages/mo</li>
                  <li>English + Spanish outreach</li>
                  <li>AI supplement engine (10% commission)</li>
                </ul>
                <Link href="/signup" className="p-cta outline">
                  Get Started →
                </Link>
              </div>
            </div>

            <div className="p-card best">
              <div className="p-head">
                <div className="best-badge">Most Popular</div>
                <div className="p-tier">Tier 3B</div>
                <div className="p-name">CRM + AI Caller 24/7</div>
                <div className="p-price">
                  $1,299<span className="p-mo">/mo</span>
                </div>
              </div>
              <div className="p-body">
                <ul className="p-feats">
                  <li>AI caller — works 24/7, never stops</li>
                  <li>1,500 AI voice minutes/mo included</li>
                  <li>2,500 SMS messages/mo</li>
                  <li>Answers inbound calls automatically</li>
                  <li>Books inspections directly into your calendar</li>
                  <li>AI supplement engine (10% commission)</li>
                </ul>
                <Link href="/signup" className="p-cta filled">
                  Get Started →
                </Link>
              </div>
            </div>

            <div className="p-card">
              <div className="p-head">
                <div className="p-tier">Tier 3C</div>
                <div className="p-name">Telefonista + AI Caller</div>
                <div className="p-price">
                  $1,699<span className="p-mo">/mo</span>
                </div>
              </div>
              <div className="p-body">
                <ul className="p-feats">
                  <li>Dedicated human telefonista — business hours</li>
                  <li>AI caller — nights &amp; weekends</li>
                  <li>2,500 calling + 1,000 AI voice minutes/mo</li>
                  <li>Complete 24/7 homeowner coverage</li>
                  <li>English + Spanish outreach</li>
                  <li>AI supplement engine (10% commission)</li>
                </ul>
                <Link href="/signup" className="p-cta outline">
                  Get Started →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <div className="sec-label">What Roofers Say</div>
          <h2 className="sec-h2">Results speak.</h2>
          <div className="proof-grid">
            <div className="proof-card">
              <div className="stars">★★★★★</div>
              <div className="quote-text">
                &ldquo;First week after a storm in my market, my AI caller
                booked <strong>47 inspections</strong>. I didn&apos;t knock a
                single door. I just showed up and did the inspections.&rdquo;
              </div>
              <div className="quote-author">Carlos M.</div>
              <div className="quote-loc">Dallas–Fort Worth, TX</div>
            </div>
            <div className="proof-card">
              <div className="stars">★★★★★</div>
              <div className="quote-text">
                &ldquo;The supplement engine recovered{" "}
                <strong>$18,000 on my first three claims</strong>. That money
                was already in those estimates — I just wasn&apos;t finding it.
                Now I never miss it.&rdquo;
              </div>
              <div className="quote-author">Jake R.</div>
              <div className="quote-loc">Oklahoma City, OK</div>
            </div>
            <div className="proof-card">
              <div className="stars">★★★★★</div>
              <div className="quote-text">
                &ldquo;I work Spanish-speaking neighborhoods in South Texas.
                Roof-Aid runs the entire outreach sequence in Spanish
                automatically.{" "}
                <strong>My close rate in that market tripled.</strong>&rdquo;
              </div>
              <div className="quote-author">Roberto V.</div>
              <div className="quote-loc">San Antonio, TX</div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-sec">
        <div className="cta-glow" />
        <div className="container" style={{ position: "relative" }}>
          <h2>
            14 Days Free.
            <br />
            See a booking happen live.
          </h2>
          <p>
            We set up your account, import your first storm leads, and run your
            first calling session — with you watching. You see a booked
            inspection before we hang up.
          </p>
          <div className="cta-pill">
            No credit card required
            <Link href="/signup" className="cta-pill-btn">
              Sign Up for Free Trial →
            </Link>
          </div>
        </div>
      </section>

      <footer className="ra-footer">
        <div className="foot-brand">
          ROOF-<span>AID</span> CRM
        </div>
        <div className="foot-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="mailto:roofaidsales@gmail.com">roofaidsales@gmail.com</a>
          <a href="tel:4793219094">(479) 321-9094</a>
        </div>
        <div className="foot-legal">
          © 2026 Roof-Aid CRM · Bentonville, AR · AI Driven · Built by Roofers
        </div>
      </footer>
    </div>
  );
}
