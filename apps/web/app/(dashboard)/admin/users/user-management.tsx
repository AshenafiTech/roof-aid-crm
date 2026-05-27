"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  inviteUser,
  editUser,
  toggleUserActive,
  resetUserPassword,
  deleteUser,
  type TenantUser,
} from "./actions";

/* ── Constants ── */

type Role = "owner" | "admin" | "telefonista" | "rufero" | "super_admin";

const ROLE_META: Record<Role, { label: string; color: string; dot: string; description: string }> = {
  owner:        { label: "Owner",        color: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500", description: "Full access including billing and user management" },
  admin:        { label: "Admin",        color: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-500",   description: "Office manager — full prospect access, no billing" },
  telefonista:  { label: "Telefonista",  color: "bg-sky-50 text-sky-700 border-sky-200",          dot: "bg-sky-500",    description: "Call agent — search, contact, and schedule prospects" },
  rufero:       { label: "Rufero",       color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", description: "Field inspector — sees only assigned prospects" },
  super_admin:  { label: "Super Admin",  color: "bg-red-50 text-red-700 border-red-200",          dot: "bg-red-500",    description: "Platform administrator" },
};

const ALL_FILTER = "__all__";

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role as Role] ?? { label: role, color: "bg-gray-50 text-gray-700 border-gray-200", dot: "bg-gray-500" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", m.color)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

function displayName(u: TenantUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
}

function initials(u: TenantUser): string {
  const f = u.first_name?.[0] ?? "";
  const l = u.last_name?.[0] ?? "";
  return (f + l).toUpperCase() || u.email[0].toUpperCase();
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── Main component ── */

export function UserManagement({
  initialUsers,
  canDelete = true,
}: {
  initialUsers: TenantUser[];
  canDelete?: boolean;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL_FILTER);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "deactivate" | "activate" | "delete" | "reset"; user: TenantUser } | null>(null);
  const [credentialsResult, setCredentialsResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== ALL_FILTER) list = list.filter((u) => u.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) =>
        displayName(u).toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone ?? "").includes(q)
      );
    }
    return list;
  }, [users, roleFilter, search]);

  const active = users.filter((u) => u.is_active).length;
  const inactive = users.length - active;

  function refreshUsers(updatedUser?: TenantUser, removedId?: string) {
    if (removedId) setUsers((prev) => prev.filter((u) => u.id !== removedId));
    else if (updatedUser) setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Stats chips */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{users.length}</span>
            <span className="text-muted-foreground">users</span>
          </div>
          <span className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">{active} active</span>
          </div>
          {inactive > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="h-2 w-2 rounded-full bg-gray-300" />
              <span className="text-muted-foreground">{inactive} inactive</span>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search + Filter + Invite */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="h-8 w-[200px] pl-8 text-sm"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-[130px] text-sm">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All roles</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="telefonista">Telefonista</SelectItem>
              <SelectItem value="rufero">Rufero</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" /> Invite
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_100px_100px_40px] sm:grid-cols-[1fr_140px_120px_120px_40px] items-center gap-2 px-4 py-2 border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>User</span>
          <span className="hidden sm:block">Role</span>
          <span className="hidden sm:block">Phone</span>
          <span className="hidden sm:block">Joined</span>
          <span />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No users found</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                canDelete={canDelete}
                onEdit={() => setEditingUser(user)}
                onDeactivate={() => setConfirmAction({ type: user.is_active ? "deactivate" : "activate", user })}
                onResetPassword={() => setConfirmAction({ type: "reset", user })}
                onDelete={() => setConfirmAction({ type: "delete", user })}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Role legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
        {(["owner", "admin", "telefonista", "rufero"] as const).map((r) => (
          <div key={r} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", ROLE_META[r].dot)} />
            <span className="font-medium">{ROLE_META[r].label}</span>
            <span className="hidden lg:inline">— {ROLE_META[r].description}</span>
          </div>
        ))}
      </div>

      {/* Dialogs */}
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={(newUser, tempPassword) => {
          setUsers((prev) => [...prev, newUser]);
          setCredentialsResult({ email: newUser.email, tempPassword });
        }}
      />
      {editingUser && (
        <EditDialog
          key={editingUser.id}
          user={editingUser}
          open={!!editingUser}
          onOpenChange={(open) => { if (!open) setEditingUser(null); }}
          onSuccess={(updated) => { refreshUsers(updated); setEditingUser(null); }}
        />
      )}
      {confirmAction && (
        <ConfirmActionDialog
          action={confirmAction}
          open={!!confirmAction}
          onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
          onSuccess={(removedId) => {
            if (confirmAction.type === "delete" && removedId) refreshUsers(undefined, removedId);
            else if (confirmAction.type === "deactivate" || confirmAction.type === "activate")
              refreshUsers({ ...confirmAction.user, is_active: confirmAction.type === "activate" });
            setConfirmAction(null);
          }}
        />
      )}
      {credentialsResult && (
        <CredentialsDialog
          open={!!credentialsResult}
          onOpenChange={(open) => { if (!open) setCredentialsResult(null); }}
          email={credentialsResult.email}
          tempPassword={credentialsResult.tempPassword}
        />
      )}
    </div>
  );
}

/* ── User row ── */
function UserRow({
  user,
  canDelete,
  onEdit,
  onDeactivate,
  onResetPassword,
  onDelete,
}: {
  user: TenantUser;
  canDelete: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const isOwner = user.role === "owner";
  const m = ROLE_META[user.role as Role];

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_100px_100px_100px_40px] sm:grid-cols-[1fr_140px_120px_120px_40px] items-center gap-2 px-4 py-2.5 transition-colors hover:bg-muted/30",
        !user.is_active && "opacity-50",
      )}
    >
      {/* User info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          user.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}>
          {initials(user)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{displayName(user)}</p>
            {!user.is_active && (
              <span className="shrink-0 rounded bg-orange-50 border border-orange-200 px-1.5 py-0 text-[10px] font-medium text-orange-600">Inactive</span>
            )}
            {/* Show role badge inline on mobile */}
            <span className="sm:hidden"><RoleBadge role={user.role} /></span>
          </div>
          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <Mail className="h-3 w-3 shrink-0" /> {user.email}
          </p>
        </div>
      </div>

      {/* Role */}
      <div className="hidden sm:block">
        <RoleBadge role={user.role} />
      </div>

      {/* Phone */}
      <div className="hidden sm:block">
        {user.phone ? (
          <span className="text-xs text-muted-foreground">{user.phone}</span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </div>

      {/* Joined */}
      <div className="hidden sm:block">
        <span className="text-xs text-muted-foreground">{formatDate(user.created_at)}</span>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onResetPassword}>
            <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset Password
          </DropdownMenuItem>
          {!isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDeactivate}>
                {user.is_active
                  ? <><Ban className="mr-2 h-3.5 w-3.5" /> Deactivate</>
                  : <><CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Reactivate</>
                }
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete User
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ── Invite dialog ── */
function InviteDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (user: TenantUser, tempPassword: string) => void;
}) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"admin" | "telefonista" | "rufero">("telefonista");
  const [phone, setPhone] = useState("");
  const [telnyxExt, setTelnyxExt] = useState("");

  function reset() {
    setEmail(""); setFirstName(""); setLastName(""); setRole("telefonista"); setPhone(""); setTelnyxExt("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const result = await inviteUser({ email, firstName, lastName, role, phone, telnyxExtension: telnyxExt });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const newUser: TenantUser = {
          id: result.id, first_name: firstName, last_name: lastName, email,
          phone: phone || null, role, is_active: true,
          telnyx_extension: telnyxExt || null, sendgrid_sender: null, created_at: new Date().toISOString(),
        };
        toast.success(`${firstName} ${lastName} invited successfully`);
        onSuccess(newUser, result.tempPassword);
        reset();
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to invite user");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Create a new user account with a temporary password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-first" className="text-xs">First Name</Label>
              <Input id="inv-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-last" className="text-xs">Last Name</Label>
              <Input id="inv-last" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="inv-email" className="text-xs">Email Address</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" required />
          </div>

          {/* Role selector */}
          <div className="space-y-2">
            <Label className="text-xs">Role</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["admin", "telefonista", "rufero"] as const).map((r) => {
                const meta = ROLE_META[r];
                const selected = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      "group relative rounded-lg border-2 p-3 text-left transition-all",
                      selected ? "border-primary bg-primary/5" : "border-transparent bg-muted/40 hover:bg-muted/70",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                      <span className="text-sm font-semibold">{meta.label}</span>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">{meta.description}</p>
                    {selected && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-phone" className="text-xs">Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="inv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-ext" className="text-xs">Phone Extension <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="inv-ext" value={telnyxExt} onChange={(e) => setTelnyxExt(e.target.value)} placeholder="1001" />
            </div>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Create User
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit dialog ── */
function EditDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: {
  user: TenantUser;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (updated: TenantUser) => void;
}) {
  const [pending, start] = useTransition();
  const [firstName, setFirstName] = useState(user.first_name ?? "");
  const [lastName, setLastName] = useState(user.last_name ?? "");
  const [role, setRole] = useState(user.role as "admin" | "telefonista" | "rufero");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [telnyxExt, setTelnyxExt] = useState(user.telnyx_extension ?? "");
  const [sendgrid, setSendgrid] = useState(user.sendgrid_sender ?? "");
  const isOwner = user.role === "owner";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await editUser({
          id: user.id, firstName, lastName,
          role: isOwner ? undefined : role,
          phone, telnyxExtension: telnyxExt, sendgridSender: sendgrid,
        });
        const updated: TenantUser = {
          ...user, first_name: firstName, last_name: lastName,
          role: isOwner ? user.role : role,
          phone: phone || null, telnyx_extension: telnyxExt || null, sendgrid_sender: sendgrid || null,
        };
        toast.success("User updated");
        onSuccess(updated);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update profile for {displayName(user)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Identity header */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
              {initials(user)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.email}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <RoleBadge role={user.role} />
                {user.is_active ? (
                  <span className="text-[10px] text-green-600 font-medium">Active</span>
                ) : (
                  <span className="text-[10px] text-orange-600 font-medium">Inactive</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>

          {!isOwner && (
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["admin", "telefonista", "rufero"] as const).map((r) => (
                    <SelectItem key={r} value={r}>
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", ROLE_META[r].dot)} />
                        {ROLE_META[r].label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone Extension</Label>
              <Input value={telnyxExt} onChange={(e) => setTelnyxExt(e.target.value)} placeholder="1001" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">SendGrid Sender Email</Label>
            <Input value={sendgrid} onChange={(e) => setSendgrid(e.target.value)} placeholder="sender@company.com" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Confirm action dialog ── */
function ConfirmActionDialog({
  action,
  open,
  onOpenChange,
  onSuccess,
}: {
  action: { type: "deactivate" | "activate" | "delete" | "reset"; user: TenantUser };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (removedId?: string) => void;
}) {
  const [pending, start] = useTransition();

  const config = {
    deactivate: {
      title: "Deactivate User",
      description: `${displayName(action.user)} will no longer be able to sign in. You can reactivate them later.`,
      icon: Ban, iconBg: "bg-orange-100 text-orange-700",
      buttonLabel: "Deactivate", buttonClass: "bg-orange-600 hover:bg-orange-700 text-white",
    },
    activate: {
      title: "Reactivate User",
      description: `${displayName(action.user)} will be able to sign in again with their existing credentials.`,
      icon: CheckCircle2, iconBg: "bg-green-100 text-green-700",
      buttonLabel: "Reactivate", buttonClass: "",
    },
    delete: {
      title: "Delete User",
      description: `This will permanently delete ${displayName(action.user)} and remove their auth account. This cannot be undone.`,
      icon: Trash2, iconBg: "bg-red-100 text-red-700",
      buttonLabel: "Delete Permanently", buttonClass: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
    },
    reset: {
      title: "Reset Password",
      description: `A password recovery link will be generated for ${action.user.email}.`,
      icon: KeyRound, iconBg: "bg-blue-100 text-blue-700",
      buttonLabel: "Send Reset Link", buttonClass: "",
    },
  }[action.type];

  const Icon = config.icon;

  function handleConfirm() {
    start(async () => {
      try {
        if (action.type === "deactivate") {
          await toggleUserActive({ id: action.user.id, isActive: false });
          toast.success(`${displayName(action.user)} deactivated`);
        } else if (action.type === "activate") {
          await toggleUserActive({ id: action.user.id, isActive: true });
          toast.success(`${displayName(action.user)} reactivated`);
        } else if (action.type === "delete") {
          await deleteUser(action.user.id);
          toast.success(`${displayName(action.user)} deleted`);
          onSuccess(action.user.id); return;
        } else if (action.type === "reset") {
          await resetUserPassword(action.user.id);
          toast.success(`Reset link sent to ${action.user.email}`);
        }
        onSuccess();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col items-center text-center pt-2">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-full mb-4", config.iconBg)}>
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold">{config.title}</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-[280px]">{config.description}</p>
        </div>
        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button className={cn("flex-1", config.buttonClass)} onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {config.buttonLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Credentials dialog ── */
function CredentialsDialog({
  open,
  onOpenChange,
  email,
  tempPassword,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  email: string;
  tempPassword: string;
}) {
  function copyAll() {
    navigator.clipboard.writeText(`Email: ${email}\nTemporary Password: ${tempPassword}`);
    toast.success("Copied to clipboard");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col items-center text-center pt-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700 mb-4">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h3 className="text-base font-semibold">User Created Successfully</h3>
          <p className="text-sm text-muted-foreground mt-1">Share these credentials securely with the new user.</p>
        </div>
        <div className="mt-4 rounded-lg border bg-muted/30 divide-y">
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Email</p>
            <p className="text-sm font-mono">{email}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Temporary Password</p>
            <p className="text-sm font-mono">{tempPassword}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={copyAll}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button className="flex-1" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
