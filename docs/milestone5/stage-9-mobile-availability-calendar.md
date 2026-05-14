# Stage 9 — Mobile Availability Calendar

**Goal:** A single mobile screen — **Calendar** — that's the rufero's home for everything time-bound. Google-Calendar-style Day / Week / Month views show their assigned appointments and their own availability blocks side by side. An in-page tab toggle lets them flip to a List view (the old "My Schedule" — grouped by day, fast to scan while driving). A "+" FAB creates availability blocks; tapping an empty slot pre-fills the start time. A separate "My working hours" page lets them set per-day hours that override the tenant default.

**Outcome:** Ruferos open one screen and instantly understand "my day, my week, my upcoming work." Telefonistas booking them get refused on busy blocks. The platform becomes coherent for the field team.

**Estimated time:** 2.5 days

---

## 1. Why this stage matters

Without Stage 9, the rufero's mobile experience is fragmented:

- They see their assigned **prospects** on the Prospects tab.
- They see their assigned **appointments** as a list (old "My Schedule").
- They have **no way** to mark themselves unavailable except calling the office.

Stage 9 unifies time-bound state on mobile, mirrors how every other modern scheduling product works (Calendly, Google Calendar, Jobber), and lets the platform stop relying on Telefonista clairvoyance about whether a rufero is actually free Tuesday morning.

---

## 2. Database — no schema changes

Everything Stage 9 needs landed in Stage 1:

- `appointments.scheduled_range` + `rufero_id` + status (existing)
- `rufero_availability_blocks` (new in Stage 1 §2.1)
- `users.working_hours` (new in Stage 1 §2.1)
- `can_schedule()` RPC consults all of the above (Stage 1 §2.2)

Stage 9 is pure mobile + a couple of read queries.

---

## 3. Mobile — feature folder

```
apps/mobile/lib/features/availability/
├── domain/
│   ├── entities/
│   │   ├── availability_block_entity.dart
│   │   ├── working_hours_entity.dart
│   │   └── recurrence_preset.dart
│   ├── repositories/
│   │   └── availability_repository.dart
│   └── usecases/
│       ├── get_my_availability_blocks.dart
│       ├── watch_my_availability_blocks.dart
│       ├── create_availability_block.dart
│       ├── update_availability_block.dart
│       ├── delete_availability_block.dart
│       ├── get_my_working_hours.dart
│       └── update_my_working_hours.dart
├── data/
│   ├── models/
│   │   ├── availability_block_model.dart
│   │   └── working_hours_model.dart
│   ├── datasources/
│   │   └── availability_remote_datasource.dart
│   └── repositories/
│       └── availability_repository_impl.dart
└── presentation/
    ├── bloc/
    │   ├── calendar_bloc.dart                # owns the Calendar page state
    │   ├── calendar_event.dart
    │   ├── calendar_state.dart
    │   ├── block_editor_bloc.dart            # owns the block-editor page state
    │   └── working_hours_bloc.dart
    ├── pages/
    │   ├── calendar_page.dart                # the main entry
    │   ├── block_editor_page.dart
    │   └── working_hours_page.dart
    └── widgets/
        ├── calendar_tab_view.dart            # the [Calendar] tab content
        ├── list_tab_view.dart                # the [List] tab content
        ├── day_week_grid.dart                # hour-grid renderer
        ├── month_overview.dart               # month with busy/event dots
        ├── view_switcher.dart                # Day / Week / Month chips
        ├── now_indicator.dart                # red line at current local time
        ├── event_card.dart                   # appointment OR block tile
        ├── appointment_list_card.dart        # list-tab card (with Call / Navigate)
        ├── block_editor_form.dart
        ├── recurrence_picker.dart
        └── reason_chips.dart                 # Sick / PTO / Office / Personal / Other
```

The existing `features/appointments/` folder (planned in Stage 2 but never built — that stage moved its mobile work here) is **subsumed** by `features/availability/` + reusing the appointments query from the existing prospects feature pattern. To keep the boundary clean:

- `features/appointments/` (new, small): owns the `appointments` read queries (`get_my_appointments`, `watch_my_appointments`) and entity. No UI.
- `features/availability/`: owns the `rufero_availability_blocks` queries + the **Calendar page** UI that composes both BLoCs.

This way both feature modules stay single-responsibility, and the Calendar page is the integration point.

---

## 4. Bottom-tab change

The app's bottom nav goes from current (`Prospects` / `Messages` / `Profile`) to:

```
[ Prospects ]  [ Calendar ]  [ Messages ]  [ Profile ]
```

`Calendar` becomes the rufero's default landing tab after login (was Prospects). Telefonistas / admins logging in on mobile still land on Prospects — they don't have a meaningful calendar of their own. Easiest gate: `if (user.role == 'rufero') initialIndex = 1` in the bottom-nav scaffold.

---

## 5. Calendar page — top-level structure

```dart
// apps/mobile/lib/features/availability/presentation/pages/calendar_page.dart

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key});
  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => sl<CalendarBloc>()..add(CalendarLoadRequested())),
        BlocProvider(create: (_) => sl<AppointmentsBloc>()..add(AppointmentsLoadRequested())),
      ],
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Calendar'),
          bottom: TabBar(
            controller: _tabs,
            tabs: const [
              Tab(icon: Icon(Icons.calendar_view_day_outlined), text: 'Calendar'),
              Tab(icon: Icon(Icons.view_list_outlined), text: 'List'),
            ],
          ),
        ),
        body: TabBarView(
          controller: _tabs,
          children: const [
            CalendarTabView(),
            ListTabView(),
          ],
        ),
        floatingActionButton: AnimatedBuilder(
          animation: _tabs,
          builder: (_, __) => _tabs.index == 0
              ? FloatingActionButton.extended(
                  onPressed: () => _openBlockEditor(context),
                  icon: const Icon(Icons.event_busy_outlined),
                  label: const Text('Block time'),
                )
              : const SizedBox.shrink(),
        ),
      ),
    );
  }
}
```

> The FAB is only visible on the Calendar tab. On the List tab the page is consumption-only.

---

## 6. Calendar tab — Google-Calendar-style

### 6.1 Library

Use **`calendar_view`** (pub.dev, MIT).

```yaml
# pubspec.yaml additions
dependencies:
  calendar_view: ^1.4.0
```

This gives Day, Week, and Month views with hour grids. We wrap them with our own header (date label, view switcher) and our own event renderer.

### 6.2 View switcher

A 3-chip segmented control under the app bar — Day / Week / Month. Persists last choice in `shared_preferences`.

### 6.3 Day view layout

```
+--------------------------------------------------+
| ←  Tue, May 14, 2026                  Day▾       |
+--------------------------------------------------+
| 7  |                                              |
| 8  |  ┌──────────────────────────────────────┐   |
| 9  |  │ 9:00 — Jane Smith • confirmed        │   |
|10  |  │ 123 Main St                          │   |
|11  |  └──────────────────────────────────────┘   |
|12  |  ┌── BLOCKED ─────────────── 12:00–13:00 ┐ |
|    |  │  Lunch                                 │ |
|    |  └────────────────────────────────────────┘ |
| ─━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ now (13:42) ━━ |
|14  |  ┌──────────────────────────────────────┐   |
|15  |  │ 14:00 — Carlos Ramirez • pending     │   |
|    |  │ 456 Oak Ave                          │   |
|    |  └──────────────────────────────────────┘   |
|16  |                                              |
|17  |                                              |
|18  | (outside working hours — column shaded)      |
+--------------------------------------------------+
```

**Event types and their visual treatment:**

| Type | Background | Border | Text |
|------|------------|--------|------|
| Appointment — pending | `#9CA3AF`@15% | `#9CA3AF` | gray-900 |
| Appointment — confirmed | `#2563EB`@15% | `#2563EB` | blue-900 |
| Appointment — completed | `#16A34A`@15% | `#16A34A` | green-900 |
| Block — busy | red-orange diagonal stripes (`#EA580C`@22%) | none | the `reason` chip |
| Block — available_extra | green-tint dotted border | `#16A34A` dashed | "Working" |
| Outside working hours | column tint `surfaceContainerLowest` | — | — |

### 6.4 Week view

Seven columns of 30-minute slots; swipe between weeks. Each column is a compressed Day view. Tap a slot → opens block editor with start time pre-filled.

### 6.5 Month view

Standard 6×7 grid. Each day cell shows:
- Up to 3 small colored bars (one per appointment, color = status)
- A red-orange diagonal bar across the bottom if any busy block intersects that day
- Day number in the top-left, today highlighted

Tap a day → switches to Day view focused on that date.

### 6.6 Gestures

- **Swipe left/right** on the grid → previous / next day (Day view), week (Week), month (Month)
- **Tap empty slot** → opens `BlockEditorPage` with start time pre-filled + duration default 60 min
- **Tap appointment** → opens existing prospect/appointment side sheet from Stage 7 (or M3 detail)
- **Tap block** → opens bottom sheet: **Edit** / **Delete** / **Make available** (the last one flips kind from `busy` to `available_extra`; rarely needed)
- **Long-press** anything → context menu with the same options
- *(deferred to M7 polish)* drag-to-move blocks, pinch to zoom hour height

### 6.7 "Now" indicator

A 2px red horizontal line at the current local time, only in Day and Week views. Updates every minute via a `Timer.periodic` in `CalendarBloc`. Hidden on days that aren't today.

### 6.8 Data flow

`CalendarBloc` owns:

```dart
sealed class CalendarState {}
class CalendarInitial extends CalendarState {}
class CalendarLoading extends CalendarState {}
class CalendarLoaded extends CalendarState {
  final DateTimeRange visibleRange;
  final List<AppointmentEntity> appointments;
  final List<AvailabilityBlockEntity> blocks;
  final WorkingHoursEntity effectiveWorkingHours;   // user override OR tenant default
  final CalendarViewMode mode;                       // day | week | month
  final DateTime cursor;                             // the day currently centered
}
class CalendarError extends CalendarState { final String message; final bool isOffline; }
```

Events:
- `CalendarLoadRequested()` — initial load
- `CalendarCursorChanged(DateTime)` — user swiped
- `CalendarViewModeChanged(mode)` — Day/Week/Month switch
- `CalendarBlockCreated(AvailabilityBlockEntity)` — optimistic insert
- `CalendarBlockUpdated(...)`, `CalendarBlockDeleted(id)` — optimistic edits
- `CalendarRefreshRequested()` — pull-to-refresh

On `CalendarLoadRequested`, BLoC fetches:
1. `appointments` for the visible range (3-week window around cursor)
2. `rufero_availability_blocks` for the same range (master + expanded recurrences — see §7.3)
3. Effective working hours

Then subscribes to realtime channels (`appointments` + `rufero_availability_blocks` filtered to `rufero_id = me`). Pattern matches the existing prospects feature (realtime + 5s safety poll).

---

## 7. Block editor page

### 7.1 Page

`BlockEditorPage` opens with optional `initial: AvailabilityBlockEntity?` (null = create, populated = edit).

```
+----------------------------------------------+
|  ← New block                          [Save] |
+----------------------------------------------+
|  📅 Date:    [ Tue, May 14, 2026 ]           |
|                                              |
|  ⏰ Starts:  [ 12:00 ▾]                      |
|     Ends:   [ 13:00 ▾]                       |
|     ☐  All day                               |
|                                              |
|  Reason                                      |
|  ( Sick )  ( PTO )  ( Office )                |
|  ( Personal )  ( Other )                      |
|                                              |
|  Notes                                       |
|  [_______________________________________]   |
|                                              |
|  🔁 Repeat                                   |
|  ◉ Does not repeat                           |
|  ○ Every weekday (Mon–Fri)                   |
|  ○ Weekly on Tue                             |
|                                              |
|                                              |
|         [ Delete ]            [ Save block ] |  ← Delete visible only in edit mode
+----------------------------------------------+
```

### 7.2 Form validation

- Date required.
- Start time required.
- End time required, must be > start.
- All-day overrides start/end → 00:00–23:59 of the selected date.
- Reason required (one chip).
- Notes optional, ≤ 500 chars.
- Recurrence: one of the three presets.

Save button disabled until valid.

### 7.3 Recurrence — three presets only (M5)

| Preset label | RRULE stored |
|--------------|--------------|
| Does not repeat | (null) |
| Every weekday (Mon–Fri) | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Weekly on {day-of-start} | `FREQ=WEEKLY;BYDAY={day}` (auto-set from selected date) |

The master row is stored with `starts_at` / `ends_at` for the first occurrence and the `recurrence_rule` set. The mobile client expands occurrences in-memory for rendering using the `rrule` Dart package:

```yaml
dependencies:
  rrule: ^0.2.16
```

```dart
final occurrences = RecurrenceRule.fromString(block.recurrenceRule!)
    .getInstances(start: block.startsAt)
    .takeWhile((d) => d.isBefore(visibleRangeEnd));
```

> The web side may need the same in-memory expansion when rendering FullCalendar's view, or it can compute occurrences in SQL via a view. Either is fine — the *data model* is the same iCal RRULE string.

### 7.4 Save flow

```dart
// CreateAvailabilityBlock use case
Future<Either<Failure, AvailabilityBlockEntity>> call(CreateBlockInput input) async {
  // Optimistic: emit the block locally for immediate UI feedback.
  final tempBlock = AvailabilityBlockEntity.draft(input);
  _localBus.emit(BlockCreated(tempBlock));

  final result = await _repository.create(input);
  return result.fold(
    (failure) {
      _localBus.emit(BlockCreateFailed(tempBlock.id, failure.message));
      return Left(failure);
    },
    (saved) {
      _localBus.emit(BlockConfirmed(tempBlock.id, saved));
      return Right(saved);
    },
  );
}
```

On EXCLUDE-constraint violation (server returns Postgres error code `23P01`), datasource maps to `BlockOverlapException`. UI surfaces "You already have a block at this time."

### 7.5 Delete flow

Confirm modal: "Delete this block? It will become available again." For recurring blocks: "Delete only this occurrence" / "Delete all future occurrences." M5 only supports "all" — single-occurrence delete from a recurrence is an M7 follow-up (requires storing an `exdate` exception list).

---

## 8. List tab — fast scan view

The List tab inside the Calendar page renders the same `AppointmentsBloc` state as the old "My Schedule" plan from Stage 2.

```
+----------------------------------------------+
|  Today                                       |
|   9:00 AM  ┌────────────────────────────────┐|
|            │ Jane Smith  ●confirmed         ││ ← color dot = status
|            │ 123 Main St, Dallas             ││
|            │ [📞 Call]  [🧭 Navigate]        ││
|            └────────────────────────────────┘|
|                                              |
|  14:00 PM  ┌────────────────────────────────┐|
|            │ Carlos Ramirez  ●pending       ││
|            │ 456 Oak Ave, Dallas             ││
|            │ [📞 Call]  [🧭 Navigate]        ││
|            └────────────────────────────────┘|
|                                              |
|  Tomorrow                                    |
|   ...                                        |
+----------------------------------------------+
```

Sections collapse by day. Card actions:
- **Call** → `tel:` deep-link (M4 dial intent reused)
- **Navigate** → Google Maps / Apple Maps deep-link with prospect address (M3 maps reused)
- **Tap card body** → opens AppointmentDetail sheet with **Mark complete** / **No-show** action buttons (calls `transition_appointment` RPC defined in Stage 2)

The List tab does **not** show availability blocks. It's purely "what client work do I have today."

Pull-to-refresh on the list calls `AppointmentsRefreshRequested`.

---

## 9. Personal working hours page

Accessed from **Profile → My working hours**. Not in the Calendar page itself — keeps the Calendar page focused.

```
+--------------------------------------------------+
|  ← My working hours                        [Save]|
+--------------------------------------------------+
|  Mon    [ 08:00 ] — [ 17:00 ]                    |
|  Tue    [ 08:00 ] — [ 17:00 ]                    |
|  Wed    ☐ Off                                    |
|  Thu    [ 08:00 ] — [ 17:00 ]                    |
|  Fri    [ 08:00 ] — [ 14:00 ]                    |
|  Sat    ☐ Off                                    |
|  Sun    ☐ Off                                    |
|                                                  |
|  ⓘ These hours override your tenant's default.   |
|    Telefonistas can't book you outside these     |
|    hours unless you add a one-off "Working"      |
|    block on the Calendar page.                   |
+--------------------------------------------------+
```

Save writes the same JSON shape `tenants.working_hours` uses to `users.working_hours`:

```jsonc
{
  "mon": { "start": "08:00", "end": "17:00" },
  "tue": { "start": "08:00", "end": "17:00" },
  "wed": null,
  "thu": { "start": "08:00", "end": "17:00" },
  "fri": { "start": "08:00", "end": "14:00" },
  "sat": null,
  "sun": null
}
```

Edit via a single server-action update on `users.working_hours`. The same row is read by `can_schedule()` immediately (no caching to invalidate).

A "Reset to tenant default" button at the bottom NULLs the column.

---

## 10. Repository / datasource

```dart
// data/datasources/availability_remote_datasource.dart
abstract class AvailabilityRemoteDatasource {
  Future<List<AvailabilityBlockModel>> fetchMyBlocks({DateTime? from, DateTime? to});
  Stream<List<AvailabilityBlockModel>> watchMyBlocks();
  Future<AvailabilityBlockModel> create(CreateBlockInput input);
  Future<AvailabilityBlockModel> update(String id, UpdateBlockInput input);
  Future<void> delete(String id);
  Future<WorkingHoursModel?> fetchMyWorkingHours();
  Future<WorkingHoursModel?> updateMyWorkingHours(WorkingHoursModel hours);
}
```

Implementation:

```dart
@override
Future<List<AvailabilityBlockModel>> fetchMyBlocks({DateTime? from, DateTime? to}) async {
  final userId = client.auth.currentUser?.id;
  if (userId == null) throw ServerException('Not authenticated');

  var query = client
      .from('rufero_availability_blocks')
      .select()
      .eq('rufero_id', userId);

  if (from != null) query = query.gte('ends_at', from.toIso8601String());
  if (to != null) query = query.lte('starts_at', to.toIso8601String());

  final response = await query.order('starts_at', ascending: true);
  return (response as List)
      .map((r) => AvailabilityBlockModel.fromMap(r as Map<String, dynamic>))
      .toList(growable: false);
}

@override
Stream<List<AvailabilityBlockModel>> watchMyBlocks() {
  // Same realtime + safety-poll pattern as prospects feature.
  // ...
}

@override
Future<AvailabilityBlockModel> create(CreateBlockInput input) async {
  try {
    final response = await client.from('rufero_availability_blocks').insert({
      'tenant_id': await _getTenantId(),
      'rufero_id': client.auth.currentUser!.id,
      'starts_at': input.startsAt.toIso8601String(),
      'ends_at': input.endsAt.toIso8601String(),
      'all_day': input.allDay,
      'kind': input.kind.name,                    // 'busy' | 'available_extra'
      'reason': input.reason?.name,
      'notes': input.notes,
      'recurrence_rule': input.recurrenceRule,
    }).select().single();

    return AvailabilityBlockModel.fromMap(response);
  } on PostgrestException catch (e) {
    if (e.code == '23P01') throw BlockOverlapException('Already blocked at this time');
    throw ServerException(e.message);
  }
}
```

---

## 11. DI registration

```dart
// apps/mobile/lib/core/di/injection_container.dart additions
sl.registerLazySingleton<AvailabilityRemoteDatasource>(
  () => AvailabilityRemoteDatasourceImpl(sl()),
);
sl.registerLazySingleton<AvailabilityRepository>(
  () => AvailabilityRepositoryImpl(sl()),
);
sl.registerLazySingleton(() => GetMyAvailabilityBlocks(sl()));
sl.registerLazySingleton(() => WatchMyAvailabilityBlocks(sl()));
sl.registerLazySingleton(() => CreateAvailabilityBlock(sl()));
sl.registerLazySingleton(() => UpdateAvailabilityBlock(sl()));
sl.registerLazySingleton(() => DeleteAvailabilityBlock(sl()));
sl.registerLazySingleton(() => GetMyWorkingHours(sl()));
sl.registerLazySingleton(() => UpdateMyWorkingHours(sl()));

sl.registerFactory(() => CalendarBloc(
  getBlocks: sl(),
  watchBlocks: sl(),
  getAppointments: sl(),
  watchAppointments: sl(),
  getWorkingHours: sl(),
));
sl.registerFactory(() => BlockEditorBloc(create: sl(), update: sl(), delete: sl()));
sl.registerFactory(() => WorkingHoursBloc(get: sl(), update: sl()));
```

---

## 12. Acceptance criteria

### Calendar tab
- [ ] Rufero logs in → Calendar is the default landing tab
- [ ] Day view defaults to today; Week view defaults to today's week; Month view defaults to today's month
- [ ] Switching views persists across app restart
- [ ] Day view renders appointments + blocks + a now-indicator + shaded outside-hours columns
- [ ] Tapping an empty 14:30 slot → block editor opens with `starts_at = today 14:30`, `ends_at = today 15:30`
- [ ] Creating a busy block → appears in the grid within 1s; reappears after app restart (real DB write)
- [ ] Creating an overlapping busy block → server returns 23P01 → UI shows "You already have a block at this time" toast; no row created
- [ ] Tapping an existing block → bottom sheet with Edit / Delete / Make available
- [ ] Tapping an appointment → existing appointment side sheet opens (reuses Stage 7 / M3 detail)

### List tab
- [ ] List tab shows the same assigned appointments grouped by day (Today, Tomorrow, then weekday names)
- [ ] Each card has Call + Navigate buttons that work
- [ ] Tap card body → AppointmentDetail sheet with Mark complete / No-show
- [ ] Mark complete → calls `transition_appointment` RPC → status flips → card disappears (filtered) → realtime updates web's calendar
- [ ] No-show → reason input required → submit → same flow
- [ ] Cancelled / rescheduled / completed appointments don't show in the list
- [ ] Pull-to-refresh works

### Personal working hours page
- [ ] Profile → My working hours opens the editor
- [ ] Default form is populated from `users.working_hours`; if NULL, the form shows tenant defaults with an "(inherited)" hint
- [ ] Marking Wednesday Off → save → Telefonista trying to book Wednesday gets "outside_working_hours"
- [ ] Reset to tenant default → NULLs the column → next render shows "(inherited)" again

### Cross-cutting
- [ ] RLS: rufero querying another rufero's blocks → 0 rows
- [ ] EXCLUDE constraint verified by attempting two concurrent overlapping inserts
- [ ] Recurrence preset "Every weekday" → block visible Mon–Fri for the next 8 weeks (mobile expands client-side)
- [ ] Web admin's "Block this rufero's time" (Stage 2) → block appears in this rufero's mobile Calendar within 2s (realtime)
- [ ] Offline: viewing the Calendar still renders cached blocks (last-loaded data); creating a block while offline → "Saved locally, will sync when online" + queues via the existing M6/Stage 8 pattern (if shipped)
- [ ] BLoCs cancel subscriptions in `close()` — no leaks

---

## 13. Pitfalls to avoid

- **Don't** keep two parallel sources of truth for "my day." The Calendar page and the List tab read from the same BLoCs; the List tab is just a filtered view of the appointments BLoC. Don't fork the data path.
- **Don't** ship 3 recurrence presets as 3 hardcoded strings on the client. Store the iCal RRULE on the server; the presets are *labels for known strings*. M7's custom builder will produce other valid RRULEs the renderer must already handle.
- **Don't** call `can_schedule()` from mobile. That RPC is for the *scheduler* (web). Mobile reads its own blocks + appointments directly; the conflict check happens on the web side when a Telefonista tries to book.
- **Don't** put working hours validation on the client only. Force per-day `start < end` in a CHECK constraint or trigger if you want defense in depth (M5 optional; the form validation is enough for v1).
- **Don't** auto-shrink the hour grid to "fit." A Day view should always start at 06:00 and end at 22:00 regardless of working hours — outside-hours just gets shaded. Hour rows shifting day-to-day disorients the user.
- **Don't** show today's appointments in the Calendar **and** show the same data in the List in a different order. Both should sort by `scheduled_at` ascending.
- **Don't** load 12 months of blocks at once. Load a 3-week window around the cursor + lazy-load on swipe. Recurring rules expand cheaply at render time; keep the DB query bounded.
- **Don't** delete the recurrence master row when the user picks "Delete only this occurrence" in M7. Use an `exdate` exception column added later. For M5 we just don't expose that option.
- **Don't** allow blocks longer than 30 days (sanity cap). PTO longer than that is a rare event and should be modeled as a series of weekly recurring blocks anyway. Catch it in form validation; explain why.
- **Don't** mix `kind='available_extra'` blocks into the busy stripe color. They visually communicate the opposite concept and confuse the rufero. Give them a dotted-green border treatment, not stripes.
- **Don't** block the Calendar page first-paint on the working-hours fetch. Fetch in parallel; render the grid as soon as appointments + blocks arrive.

---

## 14. Web dependencies

This stage depends on the web team having:

1. **Stage 1 migration merged** — `rufero_availability_blocks` table + `users.working_hours` column + `can_schedule()` updated. Mobile is fully stubbable until this lands.
2. **`rufero_availability_blocks` realtime enabled** on Supabase (toggle in dashboard or migration). Required for the "admin blocks my time" → mobile-sees-it case.

That's it. Stage 9 does not consume any Edge Function or web server action — pure direct Supabase access from Flutter.

---

## 15. What ships at end of Stage 9

- 2 mobile feature folders: `features/availability/` (new), `features/appointments/` (new, small)
- 1 main page: `CalendarPage` with [Calendar] | [List] tab toggle + FAB
- 1 editor page: `BlockEditorPage`
- 1 working-hours page: `WorkingHoursPage` accessed from Profile
- 3 BLoCs: `CalendarBloc`, `BlockEditorBloc`, `WorkingHoursBloc`
- 9 use cases (listed in §3)
- Shared `availability_kind.dart`, `block_reason.dart`, `recurrence_preset.dart` constants
- New deps: `calendar_view: ^1.4.0`, `rrule: ^0.2.16`
- Bottom-tab refactor: 4 tabs with rufero-default `Calendar`
- DI registrations in `injection_container.dart`

End of mobile M5 deliverables. Combined with Stages 7–8 (inspection + offline), this completes the field-team experience for the milestone.
