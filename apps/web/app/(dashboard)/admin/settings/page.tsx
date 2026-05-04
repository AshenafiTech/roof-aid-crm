import Link from "next/link";
import { ArrowRight, Clock, Mail, Phone, Users } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Settings — Roof-Aid CRM",
};

interface SettingsCard {
  title: string;
  description: string;
  href: string | null;
  icon: typeof Phone;
  /** Status pill shown on the right of the card. */
  status?: { label: string; tone: "ok" | "missing" | "soon" };
}

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  // Quick comms-readiness probe so the cards can show "missing" / "ok"
  const { data: user } = await supabase.auth.getUser();
  const tenantId = user.user?.user_metadata?.tenant_id as string | undefined;

  let activeNumbers = 0;
  if (tenantId) {
    const { count } = await supabase
      .from("tenant_phone_numbers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active");
    activeNumbers = count ?? 0;
  }

  const cards: SettingsCard[] = [
    {
      title: "Phone numbers",
      description:
        "Buy, label, set primary, and configure per-number routing for your business lines.",
      href: "/admin/settings/phone-numbers",
      icon: Phone,
      status:
        activeNumbers > 0
          ? { label: `${activeNumbers} active`, tone: "ok" }
          : { label: "Not set up", tone: "missing" },
    },
    {
      title: "Calling hours",
      description:
        "Set when your team is allowed to call homeowners. Calls outside these hours are blocked.",
      href: null,
      icon: Clock,
      status: { label: "Coming in M7", tone: "soon" },
    },
    {
      title: "Users",
      description:
        "Add team members, assign roles (owner / admin / telefonista / rufero), set Telnyx extensions.",
      href: "/admin/users",
      icon: Users,
    },
    {
      title: "SMS & email templates",
      description:
        "Reusable message templates for outbound SMS and email follow-ups.",
      href: null,
      icon: Mail,
      status: { label: "Coming in M7", tone: "soon" },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage how your tenant uses Roof-Aid."
      />

      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((card) => (
          <SettingsCardLink key={card.title} card={card} />
        ))}
      </div>
    </div>
  );
}

function SettingsCardLink({ card }: { card: SettingsCard }) {
  const Icon = card.icon;
  const tone = card.status?.tone;

  const inner = (
    <Card
      className={
        "transition-colors h-full" +
        (card.href ? " hover:border-primary/40" : " opacity-60")
      }
    >
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="rounded-md bg-muted p-2">
          <Icon className="size-5" />
        </div>
        <div className="flex-1 space-y-1">
          <CardTitle className="flex items-center justify-between text-base">
            <span>{card.title}</span>
            {card.status && (
              <span
                className={
                  "rounded-full px-2 py-0.5 text-xs font-medium " +
                  (tone === "ok"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                    : tone === "missing"
                      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                      : "bg-muted text-muted-foreground")
                }
              >
                {card.status.label}
              </span>
            )}
          </CardTitle>
          <CardDescription>{card.description}</CardDescription>
        </div>
        {card.href && (
          <ArrowRight className="size-4 text-muted-foreground" />
        )}
      </CardHeader>
    </Card>
  );

  if (!card.href) return inner;
  return <Link href={card.href}>{inner}</Link>;
}
