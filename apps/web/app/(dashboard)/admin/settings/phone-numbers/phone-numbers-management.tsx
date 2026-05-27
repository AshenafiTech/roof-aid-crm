"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MoreHorizontal,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  NumberPickerForm,
  formatE164,
} from "@/components/shared/number-picker-form";

import {
  addPhoneNumber,
  releasePhoneNumber,
  searchNumbers,
  setPrimaryNumber,
  updateNumberLabel,
  updateRoutingRule,
  type RoutingKind,
  type TenantPhoneNumberRow,
} from "./actions";

const ROUTING_LABELS: Record<RoutingKind, string> = {
  ring_all: "Ring all reps",
  assigned_rep_first_then_all: "Ring assigned rep, then all",
  voicemail_only: "Send to voicemail",
};

export function PhoneNumbersManagement({
  initialNumbers,
}: {
  initialNumbers: TenantPhoneNumberRow[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState<TenantPhoneNumberRow | null>(null);
  const [releasing, startRelease] = useTransition();

  const handleRelease = () => {
    if (!confirmRelease) return;
    startRelease(async () => {
      const res = await releasePhoneNumber({ id: confirmRelease.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Released ${formatE164(confirmRelease.e164)}`);
      setConfirmRelease(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">
            {initialNumbers.length} active{" "}
            {initialNumbers.length === 1 ? "number" : "numbers"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Each number is dedicated to your tenant. Released numbers stay in
            your call history but stop billing.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add another number
        </Button>
      </div>

      {initialNumbers.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No numbers yet. Click <strong>Add another number</strong> to buy
          your first one.
        </Card>
      ) : (
        <div className="space-y-3">
          {initialNumbers.map((row) => (
            <NumberRow
              key={row.id}
              row={row}
              onReleaseRequest={() => setConfirmRelease(row)}
            />
          ))}
        </div>
      )}

      {/* Add-number dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add another number</DialogTitle>
            <DialogDescription>
              Search by area code, pick a number, give it a label. The number
              is wired to your account immediately.
            </DialogDescription>
          </DialogHeader>
          <NumberPickerForm
            searchAction={searchNumbers}
            purchaseAction={addPhoneNumber}
            submitLabel="Buy number"
            defaultLabelValue=""
            successToast={(e164) => `Added ${formatE164(e164)} to your account.`}
            onSuccess={() => {
              setAddOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Release confirmation */}
      <Dialog
        open={!!confirmRelease}
        onOpenChange={(open) => !open && setConfirmRelease(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Release this number?</DialogTitle>
            <DialogDescription>
              {confirmRelease && (
                <>
                  This will release{" "}
                  <strong className="tabular-nums">
                    {formatE164(confirmRelease.e164)}
                  </strong>{" "}
                  ({confirmRelease.label}) and stop billing for it.
                  Existing call and SMS history is preserved. The number cannot
                  be re-claimed afterward.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmRelease(null)}
              disabled={releasing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRelease}
              disabled={releasing}
            >
              {releasing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Release
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function NumberRow({
  row,
  onReleaseRequest,
}: {
  row: TenantPhoneNumberRow;
  onReleaseRequest: () => void;
}) {
  const router = useRouter();
  const [labelDraft, setLabelDraft] = useState(row.label);
  const [savingLabel, startLabel] = useTransition();
  const [savingPrimary, startPrimary] = useTransition();
  const [savingRoute, startRoute] = useTransition();

  const labelDirty = labelDraft.trim() !== row.label && labelDraft.trim().length > 0;

  const saveLabel = () => {
    if (!labelDirty) return;
    startLabel(async () => {
      const res = await updateNumberLabel({ id: row.id, label: labelDraft.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Label updated");
      router.refresh();
    });
  };

  const promotePrimary = () => {
    if (row.is_primary) return;
    startPrimary(async () => {
      const res = await setPrimaryNumber({ id: row.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${formatE164(row.e164)} is now the primary number`);
      router.refresh();
    });
  };

  const changeRouting = (kind: RoutingKind) => {
    startRoute(async () => {
      const res = await updateRoutingRule({ id: row.id, kind });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Routing set to "${ROUTING_LABELS[kind]}"`);
      router.refresh();
    });
  };

  return (
    <Card className="p-5">
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-start">
        {/* Number + capabilities */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Phone className="size-4 text-muted-foreground" />
            <div className="text-base font-medium tabular-nums">
              {formatE164(row.e164)}
            </div>
            {row.is_primary && (
              <Badge variant="default" className="text-[10px] tracking-wide">
                PRIMARY
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {row.capabilities.map((c) => (
              <Badge key={c} variant="secondary" className="text-[10px] uppercase tracking-wide">
                {c}
              </Badge>
            ))}
          </div>
          <div className="text-xs text-muted-foreground pt-2">
            12 calls · 47 SMS this month
          </div>
        </div>

        {/* Label + routing */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`label-${row.id}`} className="text-xs">
              Label
            </Label>
            <div className="flex gap-1.5">
              <Input
                id={`label-${row.id}`}
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value.slice(0, 50))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveLabel();
                }}
                maxLength={50}
                className="h-8 text-sm"
              />
              {labelDirty && (
                <Button
                  size="sm"
                  onClick={saveLabel}
                  disabled={savingLabel}
                  className="h-8"
                >
                  {savingLabel ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Routing</Label>
            <Select
              value={row.routing_rule.kind}
              onValueChange={(v) => changeRouting(v as RoutingKind)}
              disabled={savingRoute}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ring_all">{ROUTING_LABELS.ring_all}</SelectItem>
                <SelectItem value="assigned_rep_first_then_all">
                  {ROUTING_LABELS.assigned_rep_first_then_all}
                </SelectItem>
                <SelectItem value="voicemail_only">{ROUTING_LABELS.voicemail_only}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex md:flex-col items-start gap-2">
          {!row.is_primary && (
            <Button
              variant="outline"
              size="sm"
              onClick={promotePrimary}
              disabled={savingPrimary}
            >
              {savingPrimary ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Set as primary
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={onReleaseRequest}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Release number
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
