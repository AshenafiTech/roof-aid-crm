"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canEditProspect } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/types/auth";

import { updateProspect } from "./actions";
import type { ProspectWithAssignee } from "./types";

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function firstPhone(phones: string[] | null): string {
  return phones?.[0] ?? "";
}

export function OverviewTab({
  prospect,
  currentUser,
}: {
  prospect: ProspectWithAssignee;
  currentUser: AuthUser;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit = canEditProspect(currentUser.role);

  if (!editing) {
    return (
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Overview</h2>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </Button>
          )}
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={prospect.name} />
          <Field label="Phone" value={firstPhone(prospect.phones) || "—"} />
          <Field label="Email" value={prospect.email} />
          <Field label="Address" value={prospect.address} />
          <Field
            label="City / State"
            value={
              [prospect.city, prospect.state].filter(Boolean).join(", ") ||
              "—"
            }
          />
          <Field label="ZIP" value={prospect.zip} />
          <Field
            label="Hail size"
            value={
              prospect.hail_size != null ? `${prospect.hail_size}"` : "—"
            }
          />
          <Field
            label="Home value"
            value={formatCurrency(prospect.home_value)}
          />
          <Field label="Source" value={prospect.source} />
          <Field
            label="Do not call"
            value={prospect.do_not_call ? "Yes" : "No"}
          />
        </dl>
      </Card>
    );
  }

  return (
    <EditForm
      prospect={prospect}
      onCancel={() => setEditing(false)}
      onSaved={() => setEditing(false)}
    />
  );
}

function EditForm({
  prospect,
  onCancel,
  onSaved,
}: {
  prospect: ProspectWithAssignee;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(prospect.name);
  const [phone, setPhone] = useState(firstPhone(prospect.phones));
  const [email, setEmail] = useState(prospect.email ?? "");
  const [hailSize, setHailSize] = useState(
    prospect.hail_size != null ? String(prospect.hail_size) : "",
  );
  const [homeValue, setHomeValue] = useState(
    prospect.home_value != null ? String(prospect.home_value) : "",
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const hailParsed = hailSize.trim() === "" ? null : Number(hailSize);
    const homeParsed = homeValue.trim() === "" ? null : Number(homeValue);

    if (hailParsed != null && Number.isNaN(hailParsed)) {
      toast.error("Hail size must be a number");
      return;
    }
    if (homeParsed != null && Number.isNaN(homeParsed)) {
      toast.error("Home value must be a number");
      return;
    }

    start(async () => {
      try {
        await updateProspect({
          id: prospect.id,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          hail_size: hailParsed,
          home_value: homeParsed,
        });
        toast.success("Prospect updated");
        onSaved();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update prospect",
        );
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Edit overview</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          <X className="mr-1 h-4 w-4" /> Cancel
        </Button>
      </div>
      <form
        onSubmit={onSubmit}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hail">Hail size (inches)</Label>
          <Input
            id="hail"
            type="number"
            step="0.01"
            value={hailSize}
            onChange={(e) => setHailSize(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="home_value">Home value (USD)</Label>
          <Input
            id="home_value"
            type="number"
            step="1"
            value={homeValue}
            onChange={(e) => setHomeValue(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
