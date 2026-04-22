# Stage 3 — Prospect Create/Edit + Assignment + DNC

**Goal:** Ship the three data-management workflows that turn M2's read-only list into a real CRM: create/edit prospects with validated + geocoded addresses, assign prospects to Ruferos with an audit trail, and manage DNC flags with TCPA-compliant rigor.

**Outcome:** After Stage 3, every field in the `prospects` table is reachable through the UI, every change is logged, and DNC compliance is enforced across every communication button in the app.

**Estimated time:** 2 days

---

## 1. Scope

Three features, three sections below.

| Feature | Who can do it | Side effects |
|---------|---------------|--------------|
| Create / Edit prospect | telefonista, admin, owner | Geocode address → coordinates; activity logged; **cannot** edit `tenant_id`, `created_by`, audit fields |
| Assignment | admin, owner (NOT telefonista) | Activity logged; notification to rufero; `assigned_at`/`assigned_by` updated |
| DNC toggle | telefonista, admin, owner | **Permanent** record; reason required; disables Call + SMS buttons everywhere; activity logged |

---

## 2. Prospect form schema (shared)

**File:** `apps/web/lib/schemas/prospect.ts`

```ts
import { z } from "zod";

export const prospectFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  address: z.string().min(3, "Street address is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().length(2, "Use 2-letter state code"),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP"),
  phones: z.array(z.string().regex(/^\+?1?\d{10}$/, "10-digit phone")).min(1).max(3),
  email: z.string().email().optional().or(z.literal("")),
  home_value: z.number().positive().optional().nullable(),
  hail_size: z.number().positive().optional().nullable(),
  tipo: z.enum(["residential", "commercial"]).nullable(),
  source: z.string().max(50).optional().nullable(),
});

export type ProspectFormInput = z.infer<typeof prospectFormSchema>;
```

This schema is shared by the create form, edit form, and server action. Single source of truth.

---

## 3. Server-side geocoding

**File:** `apps/web/lib/geocoding.ts`

```ts
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

type GeocodeResult = {
  lat: number;
  lng: number;
  formattedAddress: string;
} | null;

export async function geocodeAddress(addr: {
  address: string; city: string; state: string; zip: string;
}): Promise<GeocodeResult> {
  const query = `${addr.address}, ${addr.city}, ${addr.state} ${addr.zip}`;
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${process.env.GOOGLE_MAPS_SERVER_KEY}`;

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (json.status !== "OK" || !json.results?.[0]) return null;

  const r = json.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address,
  };
}
```

Server-side only — the `GOOGLE_MAPS_SERVER_KEY` must never ship to the browser.

---

## 4. Create/edit server actions

**File:** `apps/web/app/(dashboard)/prospects/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prospectFormSchema, type ProspectFormInput } from "@/lib/schemas/prospect";
import { geocodeAddress } from "@/lib/geocoding";

export async function createProspect(input: ProspectFormInput) {
  const parsed = prospectFormSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const user = await getCurrentUser();
  if (!["owner", "admin", "telefonista"].includes(user.role)) {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();
  const geo = await geocodeAddress(parsed.data);

  const { data, error } = await supabase
    .from("prospects")
    .insert({
      tenant_id: user.tenant_id,
      ...parsed.data,
      coordinates: geo ? `POINT(${geo.lng} ${geo.lat})` : null,
      status: "new_leads",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await supabase.from("activities").insert({
    tenant_id: user.tenant_id,
    prospect_id: data.id,
    user_id: user.id,
    action: "prospect.created",
    metadata: { name: data.name },
  });

  revalidatePath("/prospects");
  return { data };
}

export async function updateProspect(id: string, input: ProspectFormInput) {
  const parsed = prospectFormSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("prospects").select("address, city, state, zip").eq("id", id).single();
  if (!existing) return { error: "Prospect not found" };

  const addressChanged =
    existing.address !== parsed.data.address ||
    existing.city !== parsed.data.city ||
    existing.state !== parsed.data.state ||
    existing.zip !== parsed.data.zip;

  let coordinates: string | undefined;
  if (addressChanged) {
    const geo = await geocodeAddress(parsed.data);
    if (geo) coordinates = `POINT(${geo.lng} ${geo.lat})`;
  }

  const { error } = await supabase
    .from("prospects")
    .update({
      ...parsed.data,
      ...(coordinates !== undefined ? { coordinates } : {}),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.from("activities").insert({
    tenant_id: user.tenant_id,
    prospect_id: id,
    user_id: user.id,
    action: "prospect.updated",
    metadata: { address_changed: addressChanged },
  });

  revalidatePath(`/prospects/${id}`);
  revalidatePath("/prospects");
  return { data: { id } };
}
```

Only re-geocode when the address actually changed — saves Google API quota.

---

## 5. Form component

**File:** `apps/web/components/prospects/prospect-form.tsx`

Use `react-hook-form` + `zodResolver`. Dynamic phones array with add/remove buttons. `react-hook-form` already lives in the project from M2; no new install needed.

```tsx
"use client";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { prospectFormSchema, type ProspectFormInput } from "@/lib/schemas/prospect";
// ... imports

export function ProspectForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
}: {
  defaultValues?: Partial<ProspectFormInput>;
  onSubmit: (values: ProspectFormInput) => Promise<void>;
  submitLabel?: string;
}) {
  const form = useForm<ProspectFormInput>({
    resolver: zodResolver(prospectFormSchema),
    defaultValues: { phones: [""], ...defaultValues },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "phones" });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {/* Name, Address row, City/State/ZIP row, Phones field array, Email, home_value, hail_size, tipo, source */}
      <Button type="submit" disabled={form.formState.isSubmitting}>{submitLabel}</Button>
    </form>
  );
}
```

Mounted in:
- **Create**: `/prospects/new` page → server action wraps action call + `router.push('/prospects/' + id)`
- **Edit**: Edit button on detail page → Dialog → form with `defaultValues` from server component

---

## 6. Assignment workflow

### 6.1 DB function (atomic)

**File:** `supabase/migrations/011_assign_prospect.sql`

```sql
CREATE OR REPLACE FUNCTION assign_prospect(
  p_prospect_id uuid,
  p_rufero_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := get_tenant_id();
  v_actor_id  uuid := auth.uid();
  v_actor_role text;
BEGIN
  -- role guard: only owner/admin
  SELECT role INTO v_actor_role FROM users WHERE id = v_actor_id AND tenant_id = v_tenant_id;
  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only owners or admins can assign prospects';
  END IF;

  -- rufero must belong to same tenant
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_rufero_id AND tenant_id = v_tenant_id AND role = 'rufero') THEN
    RAISE EXCEPTION 'Target user is not a rufero in this tenant';
  END IF;

  -- update
  UPDATE prospects
  SET assigned_to = p_rufero_id,
      assigned_by = v_actor_id,
      assigned_at = now()
  WHERE id = p_prospect_id AND tenant_id = v_tenant_id;

  -- activity
  INSERT INTO activities (tenant_id, prospect_id, user_id, action, metadata)
  VALUES (v_tenant_id, p_prospect_id, v_actor_id, 'prospect.assigned', jsonb_build_object('to', p_rufero_id));

  -- notification
  INSERT INTO notifications (tenant_id, user_id, type, ref_id, title, body)
  VALUES (v_tenant_id, p_rufero_id, 'prospect_assigned', p_prospect_id,
          'New prospect assigned',
          (SELECT 'You were assigned ' || name FROM prospects WHERE id = p_prospect_id));
END;
$$;

GRANT EXECUTE ON FUNCTION assign_prospect TO authenticated;
```

All three inserts happen in one transaction. If any fails, none commit.

### 6.2 UI — Assignment tab

Already wired in M2's prospect detail `tabs.tsx`. Add a Select dropdown that calls a server action → `supabase.rpc('assign_prospect', {...})`. Owner/admin only (hide for rufero/telefonista).

### 6.3 Rufero sees the notification

The notification bell from M2 shows it. Once M6 ships push notifications, FCM will fire on this insert too — no code change needed here.

---

## 7. DNC flag management

### 7.1 Rules

- Toggle lives **on the prospect detail page only** — NEVER on the row card (prevents accidental taps)
- Toggling ON requires a written reason (text field, minimum 3 characters)
- Toggling OFF is disabled in the UI — requires manual DB intervention by owner + support ticket. TCPA: once someone says stop, you stop. Forever.
- Record the reason, the user who toggled, and the timestamp
- DNC prospects get Call / SMS buttons disabled with a tooltip "DNC — do not contact"

### 7.2 Server action

**File:** `apps/web/app/(dashboard)/prospects/actions.ts` — add:

```ts
export async function flagDNC(prospectId: string, reason: string) {
  if (reason.trim().length < 3) return { error: "Reason is required" };

  const user = await getCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("prospects")
    .update({
      do_not_call: true,
      do_not_call_reason: reason,
      do_not_call_at: new Date().toISOString(),
    })
    .eq("id", prospectId);

  if (error) return { error: error.message };

  await supabase.from("activities").insert({
    tenant_id: user.tenant_id,
    prospect_id: prospectId,
    user_id: user.id,
    action: "prospect.dnc_flagged",
    metadata: { reason },
  });

  revalidatePath(`/prospects/${prospectId}`);
  revalidatePath("/prospects");
  return { data: { id: prospectId } };
}
```

### 7.3 UI pattern for DNC-disabled buttons

Add a shared helper:

**File:** `apps/web/lib/can-contact.ts`

```ts
export function canContact(prospect: { do_not_call: boolean }) {
  return !prospect.do_not_call;
}
```

Any Call/SMS button:

```tsx
<Tooltip content={prospect.do_not_call ? "DNC — do not contact" : undefined}>
  <Button disabled={!canContact(prospect)}>Call</Button>
</Tooltip>
```

Repeat on the card, the detail header, the quick actions dropdown, and the compose dialogs.

### 7.4 DNC audit filter

Admin analytics (M7) will want a report of DNC flags. The activity log already captures them via `action = 'prospect.dnc_flagged'`. No extra schema needed.

---

## 8. Updating the prospect detail overview tab

The Overview tab from M2 is read-only + minimal inline edit. Replace it with:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Overview</CardTitle>
    <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
  </CardHeader>
  <CardContent>
    {/* read view: all fields */}
  </CardContent>
</Card>

<Dialog open={editOpen} onOpenChange={setEditOpen}>
  <DialogContent className="max-w-2xl">
    <ProspectForm
      defaultValues={prospect}
      submitLabel="Save changes"
      onSubmit={async (values) => {
        const result = await updateProspect(prospect.id, values);
        if (result.error) toast.error(String(result.error));
        else { toast.success("Saved"); setEditOpen(false); }
      }}
    />
  </DialogContent>
</Dialog>
```

---

## 9. Verification

### Create/Edit
- [ ] Create prospect with complete address → coordinates populate → pin appears on map
- [ ] Invalid ZIP → form shows inline error
- [ ] Editing non-address fields does NOT re-geocode (check server log)
- [ ] Editing address re-geocodes and pin moves

### Assignment
- [ ] Owner changes assignee → Activity tab shows "Assigned to X"
- [ ] New rufero sees notification in their bell dropdown
- [ ] Telefonista's assignment dropdown is hidden
- [ ] Attempting to assign to a user from a different tenant → RPC throws

### DNC
- [ ] Toggle DNC with reason → buttons disable across card, detail header, and quick actions
- [ ] Empty reason → form rejects
- [ ] DNC off toggle is not visible
- [ ] Activity tab shows `prospect.dnc_flagged` with reason in metadata
- [ ] DNC prospect still appears in lists — just with grey Call/SMS buttons

### Security
- [ ] Telefonista attempts `assign_prospect` via RPC → error "Only owners or admins..."
- [ ] Cross-tenant: assign_prospect with a rufero ID from Tenant B → error

---

## 10. Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Coordinates NULL after create | Geocoding returned no result | Log the query + status; check if `GOOGLE_MAPS_SERVER_KEY` has Geocoding API enabled |
| Rufero never sees notification | RLS on `notifications` filtering out | Check `notifications_select_own` policy |
| Assignment dropdown shows telefonistas | Query not filtering by role | `.in('role', ['rufero'])` |
| DNC button still clickable | Passing `disabled={prospect.dnc}` instead of `!canContact(prospect)` | Use the helper everywhere |
| Activity log missing for edits | Forgot to insert after update | Add to `updateProspect` action |

---

## 11. What Stage 4 now has to work with

- Every prospect has: full field set + optional coordinates + assignment info + DNC state
- `activities` table has new action types: `prospect.created`, `prospect.updated`, `prospect.assigned`, `prospect.dnc_flagged`
- The Activity tab will surface these once Stage 4 builds it
