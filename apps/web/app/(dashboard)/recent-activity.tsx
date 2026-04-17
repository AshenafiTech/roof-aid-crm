import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { RecentActivityItem } from "@/lib/queries/dashboard";

const TYPE_LABELS: Record<string, string> = {
  status_change: "changed status",
  note_added: "added a note",
  call: "logged a call",
  sms: "sent an SMS",
  email: "sent an email",
  appointment: "scheduled an appointment",
  document: "uploaded a document",
  assignment: "reassigned",
  dnc: "marked do-not-call",
  prospect_update: "updated overview",
};

function displayName(
  user: { first_name: string | null; last_name: string | null } | null,
): string {
  if (!user) return "Someone";
  const name = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || "Someone";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function RecentActivity({
  items,
}: {
  items: RecentActivityItem[];
}) {
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">Recent activity</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No activity yet. Start adding notes and status changes.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5 text-sm">
              <p>
                <span className="font-medium">{displayName(item.user)}</span>{" "}
                <span className="text-muted-foreground">
                  {TYPE_LABELS[item.type] ?? item.type}
                </span>
                {item.prospect && (
                  <>
                    {" on "}
                    <Link
                      href={`/prospects/${item.prospect.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.prospect.name}
                    </Link>
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {relativeTime(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
