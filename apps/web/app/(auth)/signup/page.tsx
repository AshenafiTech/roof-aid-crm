import { SignupWizard } from "./signup-wizard";

import "./signup.css";

export const metadata = {
  title: "Start your free trial — Roof-Aid CRM",
  description:
    "Create your Roof-Aid CRM workspace. Pick a plan, set up your owner account, and you'll be inside in minutes.",
};

export default function SignupPage() {
  return <SignupWizard />;
}
