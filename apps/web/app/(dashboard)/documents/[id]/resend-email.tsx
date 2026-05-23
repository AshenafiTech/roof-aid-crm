"use client";

import { useTransition } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { emailSignedDocument } from "@/app/(dashboard)/documents/actions";

export function ResendEmailButton({
  signedDocId,
  email,
}: {
  signedDocId: string;
  email: string;
}) {
  const [pending, start] = useTransition();
  function onClick() {
    start(async () => {
      try {
        const result = await emailSignedDocument(signedDocId);
        if (result.ok) {
          toast.success(`Email queued to ${email}`);
        } else {
          toast.error(`Could not email: ${result.reason ?? "unknown"}`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Send failed");
      }
    });
  }
  return (
    <Button onClick={onClick} disabled={pending} variant="outline" size="sm">
      <Mail className="mr-1.5 h-4 w-4" />
      {pending ? "Sending…" : "Resend email"}
    </Button>
  );
}
