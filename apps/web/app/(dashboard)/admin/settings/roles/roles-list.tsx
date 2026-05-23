"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Copy,
  Loader2,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { createRole, deleteRole, type RoleListItem } from "./actions";

const ROLE_ACCENT: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
  telefonista: "bg-sky-100 text-sky-700 border-sky-200",
  rufero: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const ROLE_DOT: Record<string, string> = {
  owner: "bg-purple-500",
  admin: "bg-blue-500",
  telefonista: "bg-sky-500",
  rufero: "bg-emerald-500",
};

function RoleBadge({ slug, isSystem }: { slug: string; isSystem: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        ROLE_ACCENT[slug] ?? "bg-gray-100 text-gray-700 border-gray-200",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ROLE_DOT[slug] ?? "bg-gray-500")} />
      {isSystem ? "System" : "Custom"}
    </span>
  );
}

export function RolesList({
  initialRoles,
  totalPrivileges,
}: {
  initialRoles: RoleListItem[];
  totalPrivileges: number;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RoleListItem | null>(null);

  function removeRoleFromList(id: string) {
    setRoles((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {roles.length} {roles.length === 1 ? "role" : "roles"} ·{" "}
          {totalPrivileges} privileges available
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New Role
        </Button>
      </div>

      {/* List */}
      <Card className="overflow-hidden divide-y">
        {roles.map((role) => (
          <RoleRow
            key={role.id}
            role={role}
            totalPrivileges={totalPrivileges}
            onDelete={() => setConfirmDelete(role)}
          />
        ))}
        {roles.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No roles defined.
          </div>
        )}
      </Card>

      {/* Create dialog */}
      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        cloneOptions={roles.filter((r) => !r.is_super_role)}
        onCreated={(newId) => {
          setCreateOpen(false);
          router.push(`/admin/settings/roles/${newId}`);
        }}
      />

      {/* Delete confirmation */}
      <DeleteRoleDialog
        role={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        onDeleted={(id) => {
          removeRoleFromList(id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function RoleRow({
  role,
  totalPrivileges,
  onDelete,
}: {
  role: RoleListItem;
  totalPrivileges: number;
  onDelete: () => void;
}) {
  const isOwner = role.is_super_role;
  const privilegeLabel = isOwner
    ? "All privileges"
    : `${role.privilege_count} / ${totalPrivileges} privileges`;

  return (
    <div className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Link
            href={`/admin/settings/roles/${role.id}`}
            className="text-sm font-semibold hover:underline truncate"
          >
            {role.name}
          </Link>
          <RoleBadge slug={role.slug} isSystem={role.is_system} />
          {isOwner && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              <ShieldCheck className="h-3 w-3" /> Super role
            </span>
          )}
        </div>
        {role.description && (
          <p className="text-xs text-muted-foreground line-clamp-1">
            {role.description}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" /> {role.user_count}{" "}
            {role.user_count === 1 ? "user" : "users"}
          </span>
          <span>·</span>
          <span>{privilegeLabel}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Smartphone className="h-3 w-3" />
            {role.login_mobile ? "Mobile" : "—"}
            {" / "}
            {role.login_web ? "Web" : "no web"}
          </span>
        </div>
      </div>

      <Link
        href={`/admin/settings/roles/${role.id}`}
        className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        Edit <ArrowRight className="h-3 w-3" />
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem asChild>
            <Link href={`/admin/settings/roles/${role.id}`}>
              <ArrowRight className="mr-2 h-3.5 w-3.5" /> Edit privileges
            </Link>
          </DropdownMenuItem>
          {!role.is_system && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete role
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function CreateRoleDialog({
  open,
  onOpenChange,
  cloneOptions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cloneOptions: RoleListItem[];
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loginWeb, setLoginWeb] = useState(true);
  const [loginMobile, setLoginMobile] = useState(true);
  const [cloneFrom, setCloneFrom] = useState<string>("");
  const [pending, start] = useTransition();

  function reset() {
    setName("");
    setDescription("");
    setLoginWeb(true);
    setLoginMobile(true);
    setCloneFrom("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const res = await createRole({
          name,
          description,
          login_web: loginWeb,
          login_mobile: loginMobile,
          cloneFromRoleId: cloneFrom || undefined,
        });
        toast.success("Role created");
        reset();
        onCreated(res.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create role");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Custom Role</DialogTitle>
          <DialogDescription>
            Create a role tailored to your team. Pick the privileges next.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rn">Name</Label>
            <Input
              id="rn"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Senior Telefonista"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rd">Description (optional)</Label>
            <Textarea
              id="rd"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Lead caller — full sales access plus team analytics"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Login channels
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLoginWeb(!loginWeb)}
                className={cn(
                  "flex-1 rounded-md border p-2 text-sm font-medium",
                  loginWeb
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-transparent bg-muted/40 text-muted-foreground",
                )}
              >
                Web
              </button>
              <button
                type="button"
                onClick={() => setLoginMobile(!loginMobile)}
                className={cn(
                  "flex-1 rounded-md border p-2 text-sm font-medium",
                  loginMobile
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-transparent bg-muted/40 text-muted-foreground",
                )}
              >
                Mobile
              </button>
            </div>
          </div>

          {cloneOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="cf" className="flex items-center gap-1.5">
                <Copy className="h-3.5 w-3.5" /> Clone privileges from (optional)
              </Label>
              <select
                id="cf"
                value={cloneFrom}
                onChange={(e) => setCloneFrom(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Start empty</option>
                {cloneOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Create Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({
  role,
  onOpenChange,
  onDeleted,
}: {
  role: RoleListItem | null;
  onOpenChange: (v: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [pending, start] = useTransition();

  function handleDelete() {
    if (!role) return;
    start(async () => {
      try {
        await deleteRole({ id: role.id });
        toast.success(`Role "${role.name}" deleted`);
        onDeleted(role.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete role");
      }
    });
  }

  return (
    <Dialog open={!!role} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete role?</DialogTitle>
          <DialogDescription>
            {role
              ? `"${role.name}" will be permanently removed. This cannot be undone.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Delete role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
