import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { NumberPicker } from "./number-picker";

function formatE164(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/onboarding");

  const { data: profile } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return (
      <main className="container mx-auto px-4 py-12">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Welcome to Roof-Aid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your account isn&rsquo;t linked to a tenant yet. Step 1 (business
              profile) needs to be completed by an admin before you can pick a
              phone number. Contact support if you&rsquo;re seeing this in error.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Show current primary number if one already exists
  const { data: primary } = await supabase
    .from("tenant_phone_numbers")
    .select("e164, label, capabilities")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_primary", true)
    .eq("status", "active")
    .maybeSingle();

  return (
    <main className="container mx-auto px-4 py-12 space-y-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Welcome to Roof-Aid</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One quick step before you can call and text homeowners.
        </p>
      </div>

      {primary ? (
        <Card className="max-w-2xl mx-auto border-green-600/30 bg-green-600/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-5" />
              Your business line is set up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-base font-medium tabular-nums">
              {formatE164(primary.e164)}
            </p>
            <p className="text-sm text-muted-foreground">
              Label: {primary.label} · {primary.capabilities.join(" / ").toUpperCase()}
            </p>
            <p className="text-sm text-muted-foreground pt-2">
              Add more numbers anytime from{" "}
              <a className="underline" href="/admin/settings/phone-numbers">
                Settings → Phone Numbers
              </a>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <NumberPicker />
      )}
    </main>
  );
}
