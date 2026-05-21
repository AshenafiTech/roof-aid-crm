# Stage 5 — My Schedule Screen

**Depends on:** Stage 1 (offline appointments cache), Stage 4 (push deep-links here). M5 Stage 9 (mobile availability calendar) already exists; this stage adds the **agenda-style schedule view** complementary to that calendar.
**Estimated:** 1 day.

## Purpose

Give the rufero a fast, scannable list of "what's next" — driving between jobs, the calendar grid is overkill. They want today's appointments at the top, upcoming below, with one-tap actions for everything they do all day: navigate, call, mark complete.

## Scope

### 5.1 Agenda list

`apps/mobile/lib/features/appointments/presentation/pages/my_schedule_page.dart`:

- Top: horizontal date strip (today highlighted, next 14 days). Tap → scroll to section.
- Body: scrollable list grouped by date headers:
  - **Today** (sticky header)
  - **Tomorrow**
  - **Wed, May 27**
  - …
- Each item card:
  - Time (left, bold)
  - Prospect name + address (center)
  - Status pill (right)
  - Tap → appointment detail
- Empty state for a day: "No appointments — open availability."

Source: Stage 1's offline appointment stream filtered to `assigned_to == currentUser.id` and `scheduled_at >= today`.

### 5.2 Appointment detail

`appointment_detail_page.dart` — already exists in skeleton from M5, finalized here:

- Prospect block: name, address, phone, email, hail size, home value
- Notes section
- Action grid:
  - **Navigate** (Stage 6) — opens Maps with directions
  - **Call homeowner** — softphone (or `tel:` deep-link on mobile if Telnyx WebRTC unavailable)
  - **SMS homeowner** — opens M4 SMS thread
  - **Start Inspection** — M5 flow
- Status buttons, role-gated:
  - Rufero: **Complete**, **No-show**
  - Telefonista (rare on mobile): **Confirm**, **Cancel (reason)**
  - All: **Reschedule** opens M5 scheduler modal

All status changes write a `PendingStatusUpdate` (Stage 1) → optimistic UI → server sync.

### 5.3 Cross-link with the calendar (M5 Stage 9)

The bottom-tab labelled **Schedule** opens a top-level toggle:
- [Agenda] | [Calendar]

Both views read the same Hive box. Agenda is a list, Calendar is the grid view shipped in M5 Stage 9. They share the same appointment-detail screen. No data duplication.

### 5.4 Pull-to-refresh

Pull → force a Stage 1 fetch + flush. Indicator at top reflects sync state.

### 5.5 Push deep-link entry point

Stage 4's `PushRouter` routes `appointment_assigned` and `appointment_reminder` to this screen's detail page. On cold start via push, the agenda is rendered behind the detail so back-press lands on a usable surface.

## Verification

1. Rufero with 3 appointments today + 2 tomorrow → agenda shows Today (3 items) then Tomorrow (2 items)
2. Tap date 4 days out → list scrolls to that section (empty state visible)
3. Tap appointment → detail shows prospect info + actions
4. Mark **Complete** offline → status updates locally → header pill: "Syncing 1 item" → "All synced"
5. Push notification arrives for new appointment → tap → app opens on the new appointment's detail → back → agenda shows the new appointment
6. Tap Agenda/Calendar toggle → switches view; selected day persists across toggles

## Files

### Created
- `apps/mobile/lib/features/appointments/presentation/pages/my_schedule_page.dart`
- `apps/mobile/lib/features/appointments/presentation/widgets/agenda_section.dart`
- `apps/mobile/lib/features/appointments/presentation/widgets/agenda_card.dart`
- `apps/mobile/lib/features/appointments/presentation/widgets/date_strip.dart`
- `apps/mobile/lib/features/appointments/presentation/widgets/schedule_view_toggle.dart`

### Modified
- `apps/mobile/lib/features/appointments/presentation/pages/appointment_detail_page.dart` — finalize action grid + offline status updates
- `apps/mobile/lib/features/shell/presentation/widgets/bottom_nav.dart` — Schedule tab routes to `my_schedule_page` with view toggle
- `apps/mobile/lib/features/appointments/data/repositories/appointments_repository.dart` — `watchUpcomingForUser()` stream

## Out of scope
- Drag-to-reschedule from agenda → M7+ polish
- Multi-day expand/collapse → not needed; chronological list is the right primitive
- Predictive scheduling suggestions → M-future
