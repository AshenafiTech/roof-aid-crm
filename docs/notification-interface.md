# Notification Interface Implementation

## Purpose

Implements a full notification system for the Roof-Aid CRM, allowing users to receive, view, filter, and manage notifications about key events (lead assignments, status changes, inbound communications, etc.).

## What Was Done

### 1. Notification Constants & Types
- **File:** `apps/web/lib/constants/notification-types.ts`
- Defines the 6 notification types matching the database schema: `appointment_assigned`, `document_signed`, `inbound_call`, `inbound_sms`, `lead_assigned`, `system_alert`
- Each type maps to a label, icon (Lucide), and color for consistent UI rendering
- `getNotificationMeta()` helper safely resolves type metadata with a fallback

### 2. Notification Queries
- **File:** `apps/web/lib/queries/notifications.ts`
- `listNotifications(userId, opts)` — paginated list (20 per page) with optional type and unread-only filters
- `getRecentNotifications(userId, limit)` — fetches the latest N notifications for the dropdown bell

### 3. Server Actions
- **File:** `apps/web/app/(dashboard)/notifications/actions.ts`
- `markAsRead({ id })` — marks a single notification as read
- `markAllAsRead()` — marks all unread notifications as read for the current user
- `deleteNotification({ id })` — permanently deletes a notification
- All actions validate input with Zod and scope mutations to the authenticated user

### 4. Notification Creation Helper
- **File:** `apps/web/lib/notifications/create.ts`
- `createNotification(supabase, params)` — inserts a notification for a single user
- `createNotificationForMany(supabase, userIds, params)` — batch insert for multiple recipients
- Used by server actions to trigger notifications on key events

### 5. Notification Bell Dropdown (Upgraded)
- **File:** `apps/web/app/(dashboard)/notification-bell.tsx`
- Upgraded from a simple badge to a full dropdown menu
- Compact single-line rows: icon + title + relative timestamp (no body text in dropdown)
- Clicking any notification opens a detail dialog popup with full info, type badge, body, exact timestamp, and action buttons (View details / Delete)
- Mark-all-read button in dropdown header
- "View all notifications" link at the bottom
- Real-time updates via Supabase postgres_changes subscription

### 6. Notifications Full Page
- **File:** `apps/web/app/(dashboard)/notifications/page.tsx`
- Server component that fetches paginated notifications
- Filter bar with type-based and unread-only filters
- **File:** `apps/web/app/(dashboard)/notifications/notification-filters.tsx`
- Client component with URL-based filter state
- **File:** `apps/web/app/(dashboard)/notifications/notification-list.tsx`
- Compact single-line rows: unread dot + icon + title + timestamp, clickable to open detail dialog
- Detail dialog popup shows icon, title, type badge, unread badge, body, exact timestamp, "View details" link, and delete button
- Full numbered pagination with previous/next buttons, page numbers, ellipsis for large page counts, and "Showing X–Y of Z" summary
- Mark-as-read on click, hover mark-read button, mark-all-read
- Empty state handling

### 7. Sidebar Navigation
- **File:** `apps/web/app/(dashboard)/nav-items.ts`
- Added "Notifications" nav item under the main section, accessible to all roles

### 8. Notification Triggers Wired into Existing Actions
- **File:** `apps/web/app/(dashboard)/prospects/[id]/actions.ts`
- `assignProspect` — notifies the newly assigned user with type `lead_assigned`
- `changeStatus` — notifies the assigned user (if different from actor) with type `system_alert`

## Architecture Decisions

- **URL-based filter state** for the notifications page (instead of client state) so filters are shareable and persist on refresh
- **Server actions** for all mutations following the existing pattern in the codebase
- **Notification creation is a utility function** (not a server action) so it can be called from within other server actions that already have an authenticated Supabase client
- **Real-time via existing Supabase channel** — the bell already had real-time; the dropdown was layered on top without adding extra subscriptions
- **`date-fns`** added as a dependency for relative time formatting (`formatDistanceToNow`)

## Database

The `notifications` table and RLS policies already existed in the schema (migration `002_core_tables.sql` and `006_rls.sql`). Realtime was already enabled in `007_enable_realtime.sql`. No database changes were needed.

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/lib/constants/notification-types.ts` | Type definitions, labels, icons, colors |
| `apps/web/lib/queries/notifications.ts` | Query functions for listing notifications |
| `apps/web/lib/notifications/create.ts` | Notification creation utility |
| `apps/web/app/(dashboard)/notifications/actions.ts` | Server actions (mark read, delete) |
| `apps/web/app/(dashboard)/notifications/page.tsx` | Notifications page |
| `apps/web/app/(dashboard)/notifications/notification-list.tsx` | Notification list component |
| `apps/web/app/(dashboard)/notifications/notification-filters.tsx` | Filter bar component |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/app/(dashboard)/notification-bell.tsx` | Upgraded to dropdown with recent notifications |
| `apps/web/app/(dashboard)/dashboard-shell.tsx` | Passes `recentNotifications` prop |
| `apps/web/app/(dashboard)/layout.tsx` | Fetches recent notifications on load |
| `apps/web/app/(dashboard)/nav-items.ts` | Added Notifications nav item |
| `apps/web/app/(dashboard)/prospects/[id]/actions.ts` | Added notification triggers for assignment and status changes |
