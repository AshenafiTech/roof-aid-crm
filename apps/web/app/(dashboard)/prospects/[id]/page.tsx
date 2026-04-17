import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

import { ProspectTabs } from "./tabs";
import { RealtimeRefresh } from "./realtime-refresh";
import type {
  ActivityWithUser,
  NoteWithAuthor,
  ProspectWithAssignee,
  UserLite,
} from "./types";

export const metadata = {
  title: "Prospect — Roof-Aid CRM",
};

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [prospectRes, activitiesRes, notesRes, ruferosRes] = await Promise.all([
    supabase
      .from("prospects")
      .select(
        "*, assigned_user:users!assigned_to(id, first_name, last_name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("activities")
      .select("*, user:users!user_id(first_name, last_name)")
      .eq("prospect_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("notes")
      .select("*, author:users!author_id(first_name, last_name)")
      .eq("prospect_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, first_name, last_name")
      .eq("role", "rufero")
      .eq("is_active", true)
      .order("first_name", { ascending: true }),
  ]);

  const prospect = prospectRes.data as ProspectWithAssignee | null;
  if (!prospect) notFound();

  if (user.role === "rufero" && prospect.assigned_to !== user.id) {
    notFound();
  }

  const activities = (activitiesRes.data ?? []) as ActivityWithUser[];
  const notes = (notesRes.data ?? []) as NoteWithAuthor[];
  const ruferos = (ruferosRes.data ?? []) as UserLite[];

  const locationParts = [prospect.address, prospect.city, prospect.state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={prospect.name}
        description={locationParts || "No address on file"}
        action={<StatusBadge status={prospect.status} />}
      />
      <ProspectTabs
        prospect={prospect}
        activities={activities}
        notes={notes}
        ruferos={ruferos}
        currentUser={user}
      />
      <RealtimeRefresh prospectId={prospect.id} />
    </div>
  );
}
