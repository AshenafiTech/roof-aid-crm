"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Download,
  Eye,
  MoreHorizontal,
  PenLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserRole } from "@/lib/types/auth";

import {
  deleteDocument,
  getDocumentSignedUrl,
} from "@/app/(dashboard)/documents/actions";

type Doc = {
  id: string;
  status: string | null;
  storage_path: string | null;
  signed_storage_path: string | null;
};

export function DocumentRowActions({
  document,
  currentUserRole,
}: {
  document: Doc;
  currentUserRole: UserRole;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const adminish =
    currentUserRole === "admin" ||
    currentUserRole === "owner" ||
    currentUserRole === "super_admin";
  const canSign =
    document.status === "generated" && !!document.storage_path;
  const hasSigned = !!document.signed_storage_path;

  async function open(kind: "unsigned" | "signed") {
    try {
      const { url } = await getDocumentSignedUrl({
        documentId: document.id,
        signed: kind === "signed",
      });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open");
    }
  }

  function onDelete() {
    if (confirmText !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }
    start(async () => {
      try {
        await deleteDocument({ documentId: document.id });
        toast.success("Document deleted");
        setConfirmOpen(false);
        setConfirmText("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {document.storage_path && (
            <DropdownMenuItem onClick={() => open("unsigned")}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
          )}
          {hasSigned && (
            <DropdownMenuItem onClick={() => open("signed")}>
              <Eye className="mr-2 h-4 w-4" />
              View signed
            </DropdownMenuItem>
          )}
          {canSign && (
            <DropdownMenuItem asChild>
              <Link href={`/documents/${document.id}/sign`}>
                <PenLine className="mr-2 h-4 w-4" />
                Sign
              </Link>
            </DropdownMenuItem>
          )}
          {adminish && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                className="text-red-600 focus:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
            <DialogDescription>
              This removes the PDF file from storage. The audit row is
              preserved. Type <span className="font-semibold">DELETE</span> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete">Confirmation</Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={pending || confirmText !== "DELETE"}
            >
              {pending ? "Deleting…" : "Delete document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
