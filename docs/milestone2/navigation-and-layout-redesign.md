# Navigation & Layout Redesign

## Purpose
Restructure the sidebar navigation and page layouts to match the client spec — separate New Leads from Prospects, add dedicated communication tools, and provide map+list toggle views.

## Changes

### 1. Sidebar Navigation (`nav-items.ts`, `sidebar-nav.tsx`)
Three sections now:

**Main:**
- Dashboard — Metrics overview (pipeline breakdown, recent activity)
- New Leads — Prospects with status `new_leads` (map + list view)
- Prospects — Prospects with status `prospects` only (map + list view)
- Appointments — Calendar (M5)
- Documents — File management (M5)

**Tools:**
- Phone — General dialer page for outbound calls
- SMS — Message composer for sending text messages
- Quick Email — Email composer with templates

**Admin:**
- Users, Analytics, Settings (unchanged)

### 2. Dashboard (`page.tsx`)
Restored to a proper metrics dashboard:
- Welcome greeting
- Metrics cards (Total Prospects, Today's Appointments, Notifications, Conversion Rate)
- Pipeline breakdown with per-status progress bars
- Recent activity feed

### 3. New Leads Page (`/new-leads/page.tsx`)
- Shows only prospects with `status = 'new_leads'`
- Map + List split view (toggleable)
- City filter, search, "Query Database" button
- "Load 60 More" additive pagination
- Anti-collision rotation applied

### 4. Prospects Page (`/prospects/page.tsx`)
- Shows only prospects with `status = 'prospects'`
- Same map + list split view as New Leads
- No status filter dropdown (already filtered)

### 5. Shared Prospect List View (`components/shared/prospect-list-view.tsx`)
Reusable component used by both New Leads and Prospects pages:

**Two view modes (toggle in toolbar):**
- **Map view**: Left panel (380px) with prospect cards + right panel with Google Maps using real coordinates from prospect data
- **List view**: Full-width table with columns: Name, Address, Status, Assigned, Hail, Home Value, Actions

**Action buttons per row:**
- Call (disabled if DNC)
- SMS (disabled if DNC)
- Email
- Schedule appointment
- Navigate
- Add note
- Flag

### 6. Prospect Map (`components/shared/prospect-map.tsx`)
- Parses PostgreSQL `point(lng, lat)` coordinates from prospect data
- Centers map on the average of all visible prospect coordinates
- Adjusts zoom based on number of visible prospects
- Falls back to Arkansas region when no coordinates available

### 7. Communication Pages
- `/phone` — Phone dialer with microphone select, number input, call button, call log
- `/sms` — SMS composer with recipient, message textarea, conversations panel
- `/email` — Email composer with template select, to/subject/body fields

All mark "Integration with Telnyx coming in M4."

## Files Created
- `apps/web/app/(dashboard)/new-leads/page.tsx`
- `apps/web/app/(dashboard)/phone/page.tsx`
- `apps/web/app/(dashboard)/phone/phone-dialer.tsx`
- `apps/web/app/(dashboard)/sms/page.tsx`
- `apps/web/app/(dashboard)/sms/sms-composer.tsx`
- `apps/web/app/(dashboard)/email/page.tsx`
- `apps/web/app/(dashboard)/email/email-composer.tsx`
- `apps/web/components/shared/prospect-list-view.tsx`
- `apps/web/components/shared/prospect-map.tsx`

## Files Modified
- `apps/web/app/(dashboard)/nav-items.ts` — Added 4 new nav items, 3 sections
- `apps/web/app/(dashboard)/sidebar-nav.tsx` — Renders 3 sections (Main, Tools, Admin)
- `apps/web/app/(dashboard)/page.tsx` — Restored to metrics dashboard
- `apps/web/app/(dashboard)/prospects/page.tsx` — Filtered to status=prospects only
