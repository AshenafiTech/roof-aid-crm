"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { addNote } from "../actions";
import type { NoteWithAuthor, ProspectWithAssignee } from "./types";
import { displayName } from "./types";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function NotesTab({
  prospect,
  notes,
}: {
  prospect: ProspectWithAssignee;
  notes: NoteWithAuthor[];
}) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  function onSave() {
    const value = body.trim();
    if (!value) {
      toast.error("Note cannot be empty");
      return;
    }
    start(async () => {
      try {
        await addNote({ prospectId: prospect.id, body: value });
        toast.success("Note saved");
        setBody("");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save note",
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="mb-3 text-sm font-semibold">Add note</h3>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What happened on this contact?"
          rows={4}
          maxLength={5000}
          disabled={pending}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={onSave} disabled={pending}>
            {pending ? "Saving..." : "Save note"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-3 text-sm font-semibold">
          Notes ({notes.length})
        </h3>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No notes yet. Add the first one above.
          </p>
        ) : (
          <ul className="space-y-4">
            {notes.map((note) => (
              <li
                key={note.id}
                className="flex flex-col gap-1 border-l-2 border-muted pl-4"
              >
                <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                <p className="text-xs text-muted-foreground">
                  {displayName(note.author)} ·{" "}
                  {formatTimestamp(note.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
