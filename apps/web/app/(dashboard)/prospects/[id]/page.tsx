import { notFound } from "next/navigation";
import { Clock } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

import { BackToProspectsButton } from "./back-button";
import { ProspectTabs } from "./tabs";
import { RealtimeRefresh } from "./realtime-refresh";
import type {
  ActivityWithUser,
  NoteWithAuthor,
  ProspectWithAssignee,
  UserLite,
} from "./types";

function formatAuthor(author: NoteWithAuthor["author"]): string {
  if (!author) return "Unknown";
  return [author.first_name, author.last_name].filter(Boolean).join(" ") || "Unknown";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

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

  const followUpNote = prospect.status === "follow_up" ? notes[0] : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackToProspectsButton />
        <PageHeader
          title={prospect.name}
          description={locationParts || "No address on file"}
          action={<StatusBadge status={prospect.status} />}
        />
      </div>
      {followUpNote && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Follow-up note
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950 dark:text-amber-100">
                {followUpNote.body}
              </p>
              <p className="mt-2 text-xs text-amber-800/70 dark:text-amber-300/70">
                {formatAuthor(followUpNote.author)} · {formatDateTime(followUpNote.created_at)}
              </p>
            </div>
          </div>
        </div>
      )}
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
