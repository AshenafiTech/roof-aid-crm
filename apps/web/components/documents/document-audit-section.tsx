import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

type FieldChange = { token: string; before: string; after: string };
type BodyChange = {
  index: number;
  kind: "added" | "removed" | "modified";
  before: string | null;
  after: string | null;
};

interface EditRow {
  id: string;
  created_at: string;
  field_changes: FieldChange[];
  body_changes: BodyChange[];
  editor: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  version: { version_no: number } | null;
}

export async function DocumentAuditSection({ documentId }: { documentId: string }) {
  const supabase = await createClient();

  type Joined = {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  type VerJoined = { version_no: number };
  type RawRow = {
    id: string;
    created_at: string;
    field_changes: FieldChange[] | null;
    body_changes: BodyChange[] | null;
    editor: Joined | Joined[] | null;
    version: VerJoined | VerJoined[] | null;
  };

  const { data } = await supabase
    .from("document_edits")
    .select(
      "id, created_at, field_changes, body_changes, editor:users!edited_by(first_name, last_name, email), version:document_template_versions!template_version_id(version_no)",
    )
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });

  const rows: EditRow[] = ((data ?? []) as RawRow[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    field_changes: r.field_changes ?? [],
    body_changes: r.body_changes ?? [],
    editor: Array.isArray(r.editor) ? r.editor[0] ?? null : r.editor ?? null,
    version: Array.isArray(r.version) ? r.version[0] ?? null : r.version ?? null,
  }));

  if (rows.length === 0) return null;

  return (
    <Card className="space-y-4 px-5 py-4">
      <div>
        <h2 className="text-sm font-medium">Edit log</h2>
        <p className="text-xs text-muted-foreground">
          Telefonista edits made when this document was generated. The owner's
          template is unchanged.
        </p>
      </div>
      {rows.map((r) => {
        const who = r.editor
          ? [r.editor.first_name, r.editor.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() || r.editor.email
          : "unknown";
        const fieldCount = r.field_changes.length;
        const bodyCount = r.body_changes.length;
        return (
          <div key={r.id} className="space-y-2 rounded-md border p-3">
            <div className="text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString()} · {who}
              {r.version ? ` · against template v${r.version.version_no}` : ""}
              {fieldCount === 0 && bodyCount === 0
                ? " · no edits"
                : ` · ${fieldCount} field${fieldCount === 1 ? "" : "s"}, ${bodyCount} body change${bodyCount === 1 ? "" : "s"}`}
            </div>
            {fieldCount > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Fields</p>
                {r.field_changes.map((c, i) => (
                  <div key={i} className="rounded bg-muted/40 p-2 text-xs">
                    <span className="font-mono">{c.token}</span>:{" "}
                    <span className="text-red-700 line-through">
                      {c.before || "—"}
                    </span>{" "}
                    →{" "}
                    <span className="text-emerald-700">{c.after || "—"}</span>
                  </div>
                ))}
              </div>
            )}
            {bodyCount > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Body</p>
                {r.body_changes.map((c, i) => (
                  <div key={i} className="rounded bg-muted/40 p-2 text-xs">
                    <span className="uppercase tracking-wide text-muted-foreground">
                      {c.kind} block {c.index + 1}
                    </span>
                    {c.before != null && (
                      <div className="mt-1 line-through text-red-700">
                        {c.before}
                      </div>
                    )}
                    {c.after != null && (
                      <div className="mt-1 text-emerald-700">{c.after}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
