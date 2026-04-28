# Stage 4 — Full Prospect Profile Tabs

**Goal:** Finish the prospect detail page by adding the remaining tabs deferred from M2: Calls, SMS, Email, Appointments, Documents, Inspection, and Map. Each tab renders real data from its backing table or a clean empty state — no "lorem ipsum," no placeholder icons.

**Outcome:** The prospect detail page is now the complete 360° view. M4 and M5 will wire up the *create* side of these tabs (send SMS, generate PDF, etc.), but the **read** surface is done.

**Estimated time:** 1 day

---

## 1. What each tab shows in M3

| Tab | M3 renders | M4/M5 adds |
|-----|-----------|------------|
| Overview | Full read view + Edit button (Stage 3) | — |
| Pipeline | Status history from `activities` (M2) | — |
| Assignment | Current assignee + change dropdown (Stage 3) | — |
| Activity | Full audit log (M2) | — |
| Notes | List + add (M2) | — |
| **Calls** | Table of call logs for this prospect (read from `call_logs`) | **M4:** Dial button, recordings |
| **SMS** | Threaded conversation view of `sms_logs` rows | **M4:** Send + real-time delivery |
| **Email** | Timeline of `email_logs` rows | **M4:** Compose + SendGrid send |
| **Appointments** | List of `appointments` for this prospect | **M5:** Schedule flow |
| **Documents** | List of `documents` rows with signed-URL download | **M5:** Generate PDF + e-sign |
| **Inspection** | Summary card from `inspection_reports` | **M5:** Photo capture + damage form |
| **Map** | Mini embedded Google Map with a single pin + Street View link | — |

All tabs except Map read from a table that exists from M1's schema. If no rows → clean empty state.

---

## 2. Data fetching pattern

Extend the server component from M2 to fetch all relevant tab data in parallel:

**File:** `apps/web/app/(dashboard)/prospects/[id]/page.tsx`

```tsx
const [
  { data: prospect },
  { data: activities },
  { data: notes },
  { data: ruferos },
  { data: calls },
  { data: sms },
  { data: emails },
  { data: appointments },
  { data: documents },
  { data: inspection },
] = await Promise.all([
  supabase.from("prospects").select("*, assigned_user:users!assigned_to(*)").eq("id", id).single(),
  supabase.from("activities").select("*, user:users(first_name, last_name)").eq("prospect_id", id).order("created_at", { ascending: false }).limit(100),
  supabase.from("notes").select("*, author:users(first_name, last_name)").eq("prospect_id", id).order("created_at", { ascending: false }),
  supabase.from("users").select("id, first_name, last_name, role").eq("role", "rufero"),
  supabase.from("call_logs").select("*, agent:users(first_name, last_name)").eq("prospect_id", id).order("started_at", { ascending: false }).limit(50),
  supabase.from("sms_logs").select("*").eq("prospect_id", id).order("sent_at", { ascending: true }).limit(200),
  supabase.from("email_logs").select("*, sender:users(first_name, last_name)").eq("prospect_id", id).order("sent_at", { ascending: false }).limit(50),
  supabase.from("appointments").select("*, rufero:users!assigned_to(first_name, last_name)").eq("prospect_id", id).order("scheduled_at", { ascending: false }).limit(20),
  supabase.from("documents").select("*").eq("prospect_id", id).order("created_at", { ascending: false }).limit(50),
  supabase.from("inspection_reports").select("*").eq("prospect_id", id).maybeSingle(),
]);
```

Ten parallel queries; still well under 200ms on a healthy DB. If a tenant has thousands of SMS messages for one prospect, M4 will paginate — M3 is fine with the LIMIT 200 cap.

---

## 3. Tab shells

**File:** `apps/web/app/(dashboard)/prospects/[id]/tabs.tsx`

```tsx
<Tabs defaultValue="overview">
  <TabsList className="grid grid-cols-6 lg:grid-cols-12">
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
    <TabsTrigger value="assignment">Assignment</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
    <TabsTrigger value="notes">Notes</TabsTrigger>
    <TabsTrigger value="calls">Calls</TabsTrigger>
    <TabsTrigger value="sms">SMS</TabsTrigger>
    <TabsTrigger value="email">Email</TabsTrigger>
    <TabsTrigger value="appts">Appointments</TabsTrigger>
    <TabsTrigger value="docs">Documents</TabsTrigger>
    <TabsTrigger value="inspection">Inspection</TabsTrigger>
    <TabsTrigger value="map">Map</TabsTrigger>
  </TabsList>

  <TabsContent value="calls"><CallsTab calls={calls ?? []} /></TabsContent>
  <TabsContent value="sms"><SmsTab messages={sms ?? []} /></TabsContent>
  {/* …etc */}
</Tabs>
```

Tabs overflow gracefully on narrow screens — use a `<ScrollArea>` wrapper on the `TabsList` for mobile-web.

---

## 4. Calls tab

**File:** `apps/web/components/prospects/calls-tab.tsx`

```tsx
import { formatDuration, formatDistanceToNow } from "date-fns";

const DISPOSITION_LABEL: Record<string, string> = {
  answered: "Answered",
  no_answer: "No answer",
  voicemail: "Voicemail",
  wrong_number: "Wrong number",
  dnc_request: "DNC request",
  callback: "Callback",
};

export function CallsTab({ calls }: { calls: CallLog[] }) {
  if (calls.length === 0) return <EmptyState icon={PhoneIcon} title="No calls yet" desc="When a call is placed to this prospect, it'll show up here." />;

  return (
    <div className="divide-y rounded-lg border">
      {calls.map((call) => (
        <div key={call.id} className="p-4 flex items-center gap-4">
          <StatusDot disposition={call.disposition} />
          <div className="flex-1">
            <p className="font-medium">{call.agent?.first_name} {call.agent?.last_name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(call.started_at))} ago · {formatDuration({ seconds: call.duration_seconds })}
            </p>
          </div>
          <Badge variant="outline">{DISPOSITION_LABEL[call.disposition] ?? call.disposition}</Badge>
        </div>
      ))}
    </div>
  );
}
```

No call playback button in M3 (M4 ships recordings) — but if `call.recording_url` is already populated from seed data, surface a "Recording" link that signs the storage URL.

---

## 5. SMS tab — threaded view

**File:** `apps/web/components/prospects/sms-tab.tsx`

Render messages as chat bubbles, inbound left, outbound right. M3 is read-only — no input box. Reserve a small footer band that says "Reply coming in M4."

```tsx
export function SmsTab({ messages }: { messages: SmsLog[] }) {
  if (messages.length === 0) {
    return <EmptyState icon={MessageSquareIcon} title="No SMS yet" desc="Text threads will appear here once messages are exchanged." />;
  }

  return (
    <div className="flex flex-col gap-2 p-4 max-h-[60vh] overflow-y-auto">
      {messages.map((m) => (
        <div key={m.id} className={`max-w-[75%] rounded-lg px-3 py-2 ${
          m.direction === "outbound"
            ? "bg-primary text-primary-foreground self-end"
            : "bg-muted self-start"
        }`}>
          <p className="text-sm whitespace-pre-wrap">{m.body}</p>
          <p className={`text-[10px] mt-1 ${m.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {format(new Date(m.sent_at), "MMM d, h:mm a")}
            {m.direction === "outbound" && m.delivery_status && ` · ${m.delivery_status}`}
          </p>
        </div>
      ))}
    </div>
  );
}
```

---

## 6. Email tab — timeline

Each row: subject + "from / to" + sent date. Click to expand the body (sanitized with DOMPurify).

```tsx
export function EmailTab({ emails }: { emails: EmailLog[] }) {
  if (emails.length === 0) return <EmptyState ... />;

  return (
    <Accordion type="single" collapsible>
      {emails.map((e) => (
        <AccordionItem key={e.id} value={e.id}>
          <AccordionTrigger>
            <div className="flex justify-between w-full pr-4">
              <span className="font-medium truncate">{e.subject}</span>
              <span className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(e.sent_at))} ago</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground mb-2">From {e.sender?.first_name} {e.sender?.last_name} → {e.to_address}</p>
            <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(e.body_html) }} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
```

**DOMPurify is mandatory** per project code standards. Never render `dangerouslySetInnerHTML` with raw user input.

---

## 7. Appointments tab

List past + upcoming with status badges. If there's an upcoming appointment, surface it at the top in a highlighted card.

```tsx
export function AppointmentsTab({ appointments, prospect }: Props) {
  const upcoming = appointments.find((a) => new Date(a.scheduled_at) > new Date() && !["cancelled", "no_show"].includes(a.status));
  const past = appointments.filter((a) => a !== upcoming);

  return (
    <div className="space-y-4">
      {upcoming && <UpcomingAppointmentCard appointment={upcoming} />}
      {past.length > 0 ? <PastAppointmentsList appointments={past} /> : <EmptyState ... />}
    </div>
  );
}
```

The "Schedule appointment" button in the card header is disabled until M5. Wire the click to `toast.info("Coming in M5")` for now.

---

## 8. Documents tab

Table: type, status, created date, download button. Download calls a server action that creates a 1-hour signed URL:

```ts
// actions.ts
export async function getDocumentSignedUrl(documentId: string) {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", documentId).single();
  if (!doc) return { error: "Not found" };

  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 3600);
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}
```

No upload button in M3 (M5 ships generation + signing). Manual upload lands in M7 (admin tools).

---

## 9. Inspection tab

Renders a summary if `inspection_reports` has a row — otherwise an empty state that says "No inspection report yet. Once the Rufero completes the field visit, the report will appear here."

```tsx
export function InspectionTab({ inspection }: { inspection: InspectionReport | null }) {
  if (!inspection) return <EmptyState icon={HardHatIcon} title="No inspection yet" desc="..." />;

  return (
    <div className="grid grid-cols-2 gap-6">
      <Field label="Roof age" value={`${inspection.roof_age} years`} />
      <Field label="Material" value={inspection.material_type} />
      <Field label="Storm date" value={format(new Date(inspection.storm_date), "PP")} />
      <Field label="Severity" value={`${inspection.severity}/10`} />
      <Field label="Affected areas" value={inspection.affected_areas.join(", ")} />
      <Field label="Scope notes" value={inspection.scope_notes} className="col-span-2" />
    </div>
  );
}
```

Photo grid lands in M5 — M3 just reads the form fields.

---

## 10. Map tab — mini embedded map

**File:** `apps/web/components/prospects/map-tab.tsx`

```tsx
"use client";
import { Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { toLatLng } from "@/lib/geo";

export function MapTab({ prospect }: { prospect: Prospect }) {
  const pos = toLatLng(prospect.coordinates);

  if (!pos) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No coordinates on record. Edit the prospect to set an address, then this map will populate.
      </div>
    );
  }

  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${pos.lat},${pos.lng}`;

  return (
    <div className="space-y-4">
      <div className="h-[400px] rounded-lg overflow-hidden border">
        <Map
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
          defaultCenter={pos}
          defaultZoom={17}
          disableDefaultUI={false}
        >
          <AdvancedMarker position={pos} />
        </Map>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <a href={streetViewUrl} target="_blank" rel="noreferrer">Open Street View</a>
        </Button>
        <Button asChild variant="outline">
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${pos.lat},${pos.lng}`} target="_blank" rel="noreferrer">
            Get directions
          </a>
        </Button>
      </div>
    </div>
  );
}
```

Zoom 17 ≈ individual houses — the level Ruferos will want when pre-planning.

---

## 11. Shared empty state component

**File:** `apps/web/components/shared/empty-state.tsx`

```tsx
export function EmptyState({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-full bg-muted mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{desc}</p>
    </div>
  );
}
```

Use it in every tab that has no rows. Consistency matters — Ruferos see this pattern 50 times a day.

---

## 12. Verification

- [ ] Prospect with no call logs → Calls tab shows empty state
- [ ] Seed prospect WITH call log → rows render with agent name + duration + disposition
- [ ] SMS thread renders inbound/outbound bubbles correctly
- [ ] Email expansion shows sanitized HTML (try injecting a `<script>` in a seed row — must not run)
- [ ] Documents download generates a signed URL that actually works (check 1-hour expiry)
- [ ] Map tab shows a pin at 17-level zoom + both Street View and Directions links open correct URLs
- [ ] All tabs accessible via keyboard (Tab key rotates through triggers)

---

## 13. Follow-up coupling for later milestones

| Tab | M4/M5 hook point |
|-----|------------------|
| Calls | Replace `<Button disabled>Dial</Button>` with Telnyx softphone trigger |
| SMS | Add `<SmsComposer />` footer |
| Email | Add `<EmailComposer />` dialog |
| Appointments | Replace disabled "Schedule" with `<AppointmentScheduler />` |
| Documents | Add "Generate document" button that calls the pdf-lib Edge Function |
| Inspection | Full photo grid + damage form |

These are noted so the M4/M5 owner doesn't re-design Stage 4's plumbing.
