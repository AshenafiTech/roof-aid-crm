"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  setRolePrivileges,
  updateRoleMeta,
  type PrivilegeListItem,
  type RoleDetail,
} from "../actions";

const DOMAIN_LABEL: Record<string, string> = {
  prospects: "Prospects & Leads",
  appointments: "Appointments",
  documents: "Documents",
  communications: "Communications",
  notes: "Notes & Activities",
  inspections: "Inspections (Mobile)",
  settings: "Settings & Administration",
  analytics: "Analytics",
};

const DOMAIN_ORDER = [
  "prospects",
  "appointments",
  "documents",
  "communications",
  "notes",
  "inspections",
  "settings",
  "analytics",
];

type Props = {
  role: RoleDetail;
  privileges: PrivilegeListItem[];
  ownerOnlySlugs: readonly string[];
};

export function RoleEditor({ role, privileges, ownerOnlySlugs }: Props) {
  const ownerOnly = useMemo(() => new Set(ownerOnlySlugs), [ownerOnlySlugs]);

  const grouped = useMemo(() => {
    const map = new Map<string, PrivilegeListItem[]>();
    for (const p of privileges) {
      const list = map.get(p.domain) ?? [];
      list.push(p);
      map.set(p.domain, list);
    }
    return DOMAIN_ORDER.filter((d) => map.has(d)).map((d) => ({
      domain: d,
      label: DOMAIN_LABEL[d] ?? d,
      items: (map.get(d) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [privileges]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <IdentityCard role={role} />
      <PrivilegesCard
        role={role}
        grouped={grouped}
        ownerOnly={ownerOnly}
      />
    </div>
  );
}

/* ── Left column: identity ───────────────────────────────────────────── */

function IdentityCard({ role }: { role: RoleDetail }) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [loginWeb, setLoginWeb] = useState(role.login_web);
  const [loginMobile, setLoginMobile] = useState(role.login_mobile);
  const [pending, start] = useTransition();

  const dirty =
    name !== role.name ||
    (description ?? "") !== (role.description ?? "") ||
    loginWeb !== role.login_web ||
    loginMobile !== role.login_mobile;

  // Owner row identity is locked for safety (slug, super-role status).
  // Name and description are still editable so tenants can re-label.
  const isOwner = role.is_super_role;

  function save() {
    start(async () => {
      try {
        await updateRoleMeta({
          id: role.id,
          name,
          description,
          login_web: loginWeb,
          login_mobile: loginMobile,
        });
        toast.success("Role updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            Identity
            {role.is_system && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Lock className="h-3 w-3" /> System
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is responsible for…"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Login channels
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => !isOwner && setLoginWeb(!loginWeb)}
                disabled={isOwner}
                className={cn(
                  "flex-1 rounded-md border p-2 text-sm font-medium transition-colors",
                  loginWeb
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-transparent bg-muted/40 text-muted-foreground",
                  isOwner && "opacity-60 cursor-not-allowed",
                )}
              >
                Web
              </button>
              <button
                type="button"
                onClick={() => !isOwner && setLoginMobile(!loginMobile)}
                disabled={isOwner}
                className={cn(
                  "flex-1 rounded-md border p-2 text-sm font-medium transition-colors",
                  loginMobile
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-transparent bg-muted/40 text-muted-foreground",
                  isOwner && "opacity-60 cursor-not-allowed",
                )}
              >
                Mobile
              </button>
            </div>
            {role.slug === "rufero" && loginWeb && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-700 mt-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                Ruferos are field-only by default. Enabling web login bypasses
                that convention.
              </p>
            )}
          </div>

          <Button
            onClick={save}
            disabled={!dirty || pending}
            size="sm"
            className="w-full"
          >
            {pending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Save identity
          </Button>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900">
                <p className="font-medium mb-1">Owner is a super role</p>
                <p>
                  Owner always has every privilege — current and future. Its
                  privilege set is computed automatically and cannot be
                  customized.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Right column: privileges checklist ──────────────────────────────── */

function PrivilegesCard({
  role,
  grouped,
  ownerOnly,
}: {
  role: RoleDetail;
  grouped: { domain: string; label: string; items: PrivilegeListItem[] }[];
  ownerOnly: Set<string>;
}) {
  const initialGranted = useMemo(
    () => new Set(role.granted_privileges),
    [role.granted_privileges],
  );
  const [granted, setGranted] = useState<Set<string>>(initialGranted);
  const [pending, start] = useTransition();
  const isOwner = role.is_super_role;

  const allSlugs = useMemo(
    () => grouped.flatMap((g) => g.items.map((i) => i.slug)),
    [grouped],
  );

  const dirty = useMemo(() => {
    if (granted.size !== initialGranted.size) return true;
    for (const s of granted) if (!initialGranted.has(s)) return true;
    return false;
  }, [granted, initialGranted]);

  function toggle(slug: string) {
    if (isOwner) return;
    if (ownerOnly.has(slug)) return;
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function setMany(slugs: string[], on: boolean) {
    if (isOwner) return;
    setGranted((prev) => {
      const next = new Set(prev);
      for (const s of slugs) {
        if (ownerOnly.has(s)) continue;
        if (on) next.add(s);
        else next.delete(s);
      }
      return next;
    });
  }

  function saveAll() {
    start(async () => {
      try {
        const result = await setRolePrivileges({
          roleId: role.id,
          grantedSlugs: Array.from(granted),
        });
        toast.success(
          `Saved — ${result.added} added, ${result.removed} removed`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  const totalCount = allSlugs.length;
  const grantedCount = isOwner ? totalCount : granted.size;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
        <div>
          <CardTitle className="text-sm">Privileges</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {grantedCount} of {totalCount} privileges granted
            {isOwner && " · all current and future privileges always included"}
          </p>
        </div>
        {!isOwner && dirty && (
          <Button
            size="sm"
            onClick={saveAll}
            disabled={pending}
            className="shrink-0"
          >
            {pending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Save changes
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {grouped.map((group) => {
          const allOn = isOwner || group.items.every((i) => granted.has(i.slug));
          const noneOn = !isOwner && group.items.every((i) => !granted.has(i.slug));
          return (
            <div key={group.domain}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h3>
                {!isOwner && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setMany(
                          group.items.map((i) => i.slug),
                          true,
                        )
                      }
                      disabled={allOn}
                      className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                    >
                      Select all
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={() =>
                        setMany(
                          group.items.map((i) => i.slug),
                          false,
                        )
                      }
                      disabled={noneOn}
                      className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {group.items.map((p) => {
                  const ownerOnlyPriv = ownerOnly.has(p.slug);
                  const isGranted = isOwner || granted.has(p.slug);
                  const locked = isOwner || ownerOnlyPriv;
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => !locked && toggle(p.slug)}
                      disabled={locked}
                      className={cn(
                        "flex items-start gap-2 rounded-md border p-2.5 text-left transition-colors",
                        isGranted
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-background hover:bg-muted/30",
                        locked && "opacity-60 cursor-not-allowed",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isGranted
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-input bg-background",
                        )}
                      >
                        {isGranted && <CheckCircle2 className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs font-medium leading-tight">
                            {p.name}
                          </p>
                          {ownerOnlyPriv && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[9px] font-medium text-amber-800">
                              Owner only
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                            {p.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!isOwner && (
          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Changes apply immediately to every user with this role.
            </p>
            <Button
              size="sm"
              onClick={saveAll}
              disabled={!dirty || pending}
            >
              {pending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 h-3.5 w-3.5" />
              )}
              Save changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

