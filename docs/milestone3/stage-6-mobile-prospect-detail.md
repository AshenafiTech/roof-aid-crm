# Stage 6 — Mobile Prospect Detail with Tabs

**Goal:** Ship a mobile prospect detail screen that mirrors the web's profile — Overview, Calls, SMS, Appointments, Documents, Inspection, Notes. M3 is read-only everywhere except Notes (which allows adding).

**Outcome:** A Rufero arriving at a job site can open the prospect, see everything the office has (call history, prior SMS thread, documents to sign), call the homeowner, and navigate — all without leaving the app.

**Estimated time:** 1.5 days

---

## 1. Route + navigation

Add to [app.dart](apps/mobile/lib/app.dart) routes:

```dart
GoRoute(
  path: '/prospects/:id',
  builder: (context, state) => ProspectDetailPage(id: state.pathParameters['id']!),
),
```

From the list tile and the map info window, navigate with:

```dart
context.push('/prospects/${prospect.id}');
```

> Use `push` not `go` so the back button returns to the list.

---

## 2. Feature folder structure

Extend the existing `prospects` feature:

```
features/prospects/
├── domain/
│   ├── entities/
│   │   ├── prospect_entity.dart          # already exists
│   │   ├── call_log_entity.dart          # NEW
│   │   ├── sms_log_entity.dart           # NEW
│   │   ├── appointment_entity.dart       # NEW
│   │   ├── document_entity.dart          # NEW
│   │   ├── inspection_entity.dart        # NEW
│   │   └── note_entity.dart              # NEW
│   ├── repositories/
│   │   └── prospect_repository.dart      # extend
│   └── usecases/
│       ├── get_prospect_detail.dart      # NEW
│       └── add_note.dart                 # NEW
├── data/
│   ├── models/                           # NEW models for each entity
│   ├── datasources/
│   │   └── prospect_remote_datasource.dart  # extend
│   └── repositories/
│       └── prospect_repository_impl.dart    # extend
└── presentation/
    ├── bloc/
    │   ├── prospect_detail_bloc.dart     # NEW
    │   ├── prospect_detail_event.dart    # NEW
    │   └── prospect_detail_state.dart    # NEW
    ├── pages/
    │   └── prospect_detail_page.dart     # NEW
    └── widgets/
        ├── tabs/
        │   ├── overview_tab.dart
        │   ├── calls_tab.dart
        │   ├── sms_tab.dart
        │   ├── appointments_tab.dart
        │   ├── documents_tab.dart
        │   ├── inspection_tab.dart
        │   └── notes_tab.dart
        └── quick_actions_bar.dart
```

Yes that's a lot of files — but each is tiny and matching one table. Adding a new tab later is mechanical.

---

## 3. Data layer

### 3.1 Detail payload

Fetch all tab data in a single datasource method:

```dart
// prospect_remote_datasource.dart
Future<ProspectDetailModel> getProspectDetail(String id) async {
  final futures = await Future.wait([
    _supabase.from('prospects').select('*, assigned_user:users!assigned_to(*)').eq('id', id).maybeSingle(),
    _supabase.from('call_logs').select('*, agent:users(first_name, last_name)').eq('prospect_id', id).order('started_at', ascending: false).limit(50),
    _supabase.from('sms_logs').select('*').eq('prospect_id', id).order('sent_at').limit(200),
    _supabase.from('appointments').select('*').eq('prospect_id', id).order('scheduled_at', ascending: false).limit(20),
    _supabase.from('documents').select('*').eq('prospect_id', id).order('created_at', ascending: false).limit(50),
    _supabase.from('inspection_reports').select('*').eq('prospect_id', id).maybeSingle(),
    _supabase.from('notes').select('*, author:users(first_name, last_name)').eq('prospect_id', id).order('created_at', ascending: false),
  ]);

  return ProspectDetailModel.fromResponses(
    prospect: futures[0] as Map<String, dynamic>?,
    calls: futures[1] as List<dynamic>,
    sms: futures[2] as List<dynamic>,
    appointments: futures[3] as List<dynamic>,
    documents: futures[4] as List<dynamic>,
    inspection: futures[5] as Map<String, dynamic>?,
    notes: futures[6] as List<dynamic>,
  );
}
```

Seven parallel queries. Supabase PostgREST handles them on one HTTP/2 connection.

### 3.2 Add note mutation

```dart
Future<NoteModel> addNote({ required String prospectId, required String body }) async {
  final user = _supabase.auth.currentUser;
  final row = await _supabase.from('notes').insert({
    'prospect_id': prospectId,
    'tenant_id': user!.userMetadata!['tenant_id'],
    'author_id': user.id,
    'body': body,
  }).select('*, author:users(first_name, last_name)').single();
  return NoteModel.fromJson(row);
}
```

---

## 4. BLoC

**File:** `presentation/bloc/prospect_detail_bloc.dart`

States:

```dart
sealed class ProspectDetailState {}
class ProspectDetailInitial extends ProspectDetailState {}
class ProspectDetailLoading extends ProspectDetailState {}
class ProspectDetailError extends ProspectDetailState { final String message; ... }
class ProspectDetailLoaded extends ProspectDetailState { final ProspectDetailEntity detail; ... }
```

Events: `ProspectDetailRequested(id)`, `NoteAdded(body)`, `DetailRefreshRequested`.

Handler outline:

```dart
ProspectDetailBloc({
  required GetProspectDetail getDetail,
  required AddNote addNote,
}) : ... {
  on<ProspectDetailRequested>(_onRequested);
  on<NoteAdded>(_onNoteAdded);
  on<DetailRefreshRequested>(_onRefresh);
}

Future<void> _onNoteAdded(NoteAdded event, Emitter emit) async {
  if (state is! ProspectDetailLoaded) return;
  final current = state as ProspectDetailLoaded;
  final result = await _addNote(prospectId: current.detail.prospect.id, body: event.body);
  result.fold(
    (fail) => emit(current),   // could emit a transient error snackbar via stream
    (note) => emit(ProspectDetailLoaded(current.detail.copyWith(
      notes: [note, ...current.detail.notes],
    ))),
  );
}
```

Register in `injection_container.dart` as a `factory` — fresh instance per detail page.

---

## 5. Detail page scaffold

**File:** `presentation/pages/prospect_detail_page.dart`

```dart
class ProspectDetailPage extends StatelessWidget {
  final String id;
  const ProspectDetailPage({super.key, required this.id});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => sl<ProspectDetailBloc>()..add(ProspectDetailRequested(id)),
      child: const _DetailView(),
    );
  }
}

class _DetailView extends StatelessWidget {
  const _DetailView();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ProspectDetailBloc, ProspectDetailState>(
      builder: (context, state) {
        return switch (state) {
          ProspectDetailInitial() || ProspectDetailLoading() =>
            const Scaffold(body: Center(child: CircularProgressIndicator())),
          ProspectDetailError(:final message) =>
            Scaffold(appBar: AppBar(), body: _ErrorView(message: message)),
          ProspectDetailLoaded(:final detail) => _DetailScaffold(detail: detail),
          _ => const SizedBox.shrink(),
        };
      },
    );
  }
}

class _DetailScaffold extends StatelessWidget {
  final ProspectDetailEntity detail;
  const _DetailScaffold({required this.detail});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 7,
      child: Scaffold(
        appBar: AppBar(
          title: Text(detail.prospect.name, maxLines: 1, overflow: TextOverflow.ellipsis),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Calls'),
              Tab(text: 'SMS'),
              Tab(text: 'Appointments'),
              Tab(text: 'Documents'),
              Tab(text: 'Inspection'),
              Tab(text: 'Notes'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            OverviewTab(detail: detail),
            CallsTab(calls: detail.calls),
            SmsTab(messages: detail.sms, prospect: detail.prospect),
            AppointmentsTab(appointments: detail.appointments),
            DocumentsTab(documents: detail.documents),
            InspectionTab(inspection: detail.inspection),
            NotesTab(notes: detail.notes),
          ],
        ),
        bottomNavigationBar: QuickActionsBar(prospect: detail.prospect),
      ),
    );
  }
}
```

`TabBar(isScrollable: true)` because 7 tabs won't fit side-by-side on phones.

---

## 6. Quick Actions Bar (bottom)

**File:** `presentation/widgets/quick_actions_bar.dart`

Fixed bottom bar with Call, SMS, Navigate — the three actions a Rufero needs standing on a driveway.

```dart
class QuickActionsBar extends StatelessWidget {
  final ProspectEntity prospect;
  const QuickActionsBar({super.key, required this.prospect});

  @override
  Widget build(BuildContext context) {
    final canContact = !prospect.doNotCall;
    final hasPhone = prospect.primaryPhone != null && prospect.primaryPhone!.isNotEmpty;
    final hasCoords = prospect.latitude != null && prospect.longitude != null;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: FilledButton.tonalIcon(
                icon: const Icon(Icons.phone),
                label: const Text('Call'),
                onPressed: (canContact && hasPhone) ? () => _launchDialer(prospect.primaryPhone!) : null,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.tonalIcon(
                icon: const Icon(Icons.sms),
                label: const Text('SMS'),
                onPressed: (canContact && hasPhone) ? () => _launchSms(prospect.primaryPhone!) : null,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.icon(
                icon: const Icon(Icons.directions),
                label: const Text('Navigate'),
                onPressed: hasCoords
                    ? () => MapsLauncher.navigateTo(
                          lat: prospect.latitude!,
                          lng: prospect.longitude!,
                          label: prospect.name,
                        )
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _launchDialer(String phone) => launchUrl(Uri.parse('tel:$phone'));
  Future<void> _launchSms(String phone) => launchUrl(Uri.parse('sms:$phone'));
}
```

Call and SMS here just launch the **native dialer / messages app** in M3. Telnyx in-app calling lands in M4. That's deliberate — a Rufero in the field wants the phone to ring, not wait for a softphone.

---

## 7. Tabs — key implementation notes

Patterns are nearly identical to the web (Stage 4), but in Flutter. Summary table of what to mirror:

| Tab | Widget summary |
|-----|---------------|
| **Overview** | `ListView` of key/value `ListTile`s: name, address, phones, email, hail size, home value, status, assignment. Read-only in M3 — edit comes later |
| **Calls** | `ListView.separated` of call log tiles (agent name, relative time, duration, disposition chip). Empty state when no calls |
| **SMS** | Chat-style `ListView` bubbles. Outbound right, inbound left. No compose input in M3 — "Reply coming in M4" footer |
| **Appointments** | Upcoming card (if any) + list of past. Status badges. No schedule button |
| **Documents** | List with icon + title + date + download IconButton. Download calls a usecase that returns a signed URL → `launchUrl` |
| **Inspection** | If null → empty state. Else summary of fields (roof_age, storm_date, severity, scope_notes). No photo grid in M3 |
| **Notes** | `Column` with `TextField` + Send button at top, `ListView` of existing notes below. Dispatches `NoteAdded` event |

Every tab uses the shared `EmptyState` widget from the Overview folder for consistency:

```dart
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  const EmptyState({super.key, required this.icon, required this.title, required this.description});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
              child: Icon(icon, size: 36, color: theme.colorScheme.primary.withValues(alpha: 0.5)),
            ),
            const SizedBox(height: 16),
            Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(description, textAlign: TextAlign.center,
                 style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.5)),
          ],
        ),
      ),
    );
  }
}
```

---

## 8. DNC indicator

If `prospect.doNotCall == true`, show a red warning strip at the top of the detail page:

```dart
Container(
  color: theme.colorScheme.errorContainer,
  padding: const EdgeInsets.all(12),
  child: Row(
    children: [
      Icon(Icons.do_not_disturb, color: theme.colorScheme.onErrorContainer),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          'DNC — do not contact. ${prospect.doNotCallReason ?? ""}',
          style: TextStyle(color: theme.colorScheme.onErrorContainer),
        ),
      ),
    ],
  ),
)
```

Quick Actions Call + SMS buttons are already disabled when `doNotCall` is true — this banner just makes the *reason* visible.

---

## 9. Document download flow

```dart
// usecase
Future<Either<Failure, String>> call(String documentId) async {
  return repository.getDocumentSignedUrl(documentId);
}

// datasource
Future<String> getDocumentSignedUrl(String documentId) async {
  final doc = await _supabase.from('documents').select('storage_path').eq('id', documentId).single();
  final signed = await _supabase.storage.from('documents').createSignedUrl(doc['storage_path'], 3600);
  return signed;
}

// tab
IconButton(
  icon: const Icon(Icons.download),
  onPressed: () async {
    final url = await sl<GetDocumentSignedUrl>().call(doc.id);
    url.fold(
      (fail) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(fail.message))),
      (u) => launchUrl(Uri.parse(u), mode: LaunchMode.externalApplication),
    );
  },
)
```

Opens in the device's PDF viewer (Preview/Drive/Chrome). In-app viewer lands in M6.

---

## 10. DI registration

Add to `injection_container.dart`:

```dart
// Use cases
sl.registerLazySingleton(() => GetProspectDetail(sl()));
sl.registerLazySingleton(() => AddNote(sl()));
sl.registerLazySingleton(() => GetDocumentSignedUrl(sl()));

// BLoC
sl.registerFactory(
  () => ProspectDetailBloc(
    getDetail: sl(),
    addNote: sl(),
  ),
);
```

---

## 11. Verification

- [ ] Tap a row from the prospect list → detail screen opens with tab bar
- [ ] Tap an info window pin on the map → same detail screen
- [ ] Call button opens native dialer with the prospect's number pre-filled
- [ ] SMS button opens native Messages with number pre-filled
- [ ] Navigate opens Google Maps / Apple Maps with turn-by-turn to the address
- [ ] DNC prospect → red banner visible, Call + SMS buttons disabled
- [ ] Notes tab: add a note → appears at top of list immediately
- [ ] Documents tab: tap download → PDF opens in external viewer
- [ ] Empty tabs (e.g. no appointments) → show EmptyState, not blank
- [ ] Pull-to-refresh on any tab → re-fetches the whole detail payload
- [ ] Back button returns to list/map tab the user came from

---

## 12. Known limits (fixed in later milestones)

| Limit | Fixed in |
|-------|----------|
| Call goes through native dialer, not in-app Telnyx | M4 |
| SMS uses native Messages, not in-app Telnyx | M4 |
| No appointment scheduling | M5 |
| No inspection photo capture | M5 |
| No signature pad | M5 |
| No offline caching | M6 |
| No push notifications | M6 |

Every one of those is a deliberate M3 scope cut — don't let them creep in.

---

## 13. M3 completion checkpoint

Once Stage 6 ships and the success-demo script in [README.md](README.md) §9 passes end-to-end with two real test users on web and mobile, M3 is done. Hand off to the client for acceptance and start M4 planning.

---

## 14. Implementation log — 2026-04-22 (first pass)

**Shipped in this session** (branch `feat/mobile-prospects-module`, `flutter analyze` clean):

- `flutter pub add url_launcher` → [apps/mobile/pubspec.yaml](../../apps/mobile/pubspec.yaml) now carries `url_launcher: ^6.3.2`.
- [apps/mobile/lib/features/prospects/domain/entities/prospect_entity.dart](../../apps/mobile/lib/features/prospects/domain/entities/prospect_entity.dart) — added `doNotCallReason` (nullable).
- [apps/mobile/lib/features/prospects/data/models/prospect_model.dart](../../apps/mobile/lib/features/prospects/data/models/prospect_model.dart) — parses `do_not_call_reason` from PostgREST.
- **Shared widgets** under [apps/mobile/lib/features/prospects/presentation/widgets/](../../apps/mobile/lib/features/prospects/presentation/widgets/):
  - `empty_state.dart` — reusable icon + title + description placeholder used by every stub tab.
  - `dnc_banner.dart` — red strip on the detail page when `doNotCall == true`, surfaces the reason if present.
  - `quick_actions_bar.dart` — Call / SMS / Navigate. Call + SMS disabled when DNC or no phone. Navigate disabled without coords. Uses `tel:` / `sms:` / `geo:` with a Google Maps fallback.
- **Tab widgets** under [apps/mobile/lib/features/prospects/presentation/widgets/tabs/](../../apps/mobile/lib/features/prospects/presentation/widgets/tabs/):
  - `overview_tab.dart` — real data: status pill, Contact (name + phones + email), Property (address + hail size + home value + coords), Record (created/updated). Card sections, no extra queries.
  - `placeholder_tabs.dart` — `CallsTab`, `SmsTab`, `AppointmentsTab`, `DocumentsTab`, `InspectionTab`, `NotesTab` all render `EmptyState` with the milestone they ship in. Bundled into one file deliberately — each gets promoted to its own file when real data wiring lands (see §15).
- [apps/mobile/lib/features/prospects/presentation/pages/prospect_detail_page.dart](../../apps/mobile/lib/features/prospects/presentation/pages/prospect_detail_page.dart) — `DefaultTabController(length: 7)`, scrollable `TabBar`, DNC banner above the `TabBarView`, `QuickActionsBar` as `bottomNavigationBar`. Accepts the full `ProspectEntity` so no extra fetch is needed on entry.
- [apps/mobile/lib/app.dart](../../apps/mobile/lib/app.dart) — new `GoRoute('/prospects/:id')` that reads the entity off `state.extra`. Deep-link fallback is a friendly "open from list or map" scaffold (deferred until push notifications / fetch-by-id land).
- [apps/mobile/lib/features/prospects/presentation/pages/prospects_page.dart](../../apps/mobile/lib/features/prospects/presentation/pages/prospects_page.dart) — list rows now call `context.push('/prospects/${p.id}', extra: p)`, replacing the "detail coming soon" snackbar.
- [apps/mobile/lib/features/prospects/presentation/pages/prospects_map_view.dart](../../apps/mobile/lib/features/prospects/presentation/pages/prospects_map_view.dart) — `InfoWindow.onTap` navigates to the same route.

**Deliberate scope cuts** (vs the plan in §1–§10):

- **No `ProspectDetailBloc`, no new datasource method, no new use cases.** The entity already carries everything Overview needs, and the other six tabs render static empty states. We'll add the bloc + detail fetch when the first of those tabs is wired to real data.
- **Notes tab is UI-only — no composer, no fetch, no add-note mutation yet.** Ship alongside the first real tab build-out.
- **No document download flow** (§9) — deferred with the Documents tab.
- **iOS `LSApplicationQueriesSchemes` and `NSLocationWhenInUseUsageDescription`** not added yet; Android-only test target for now.

**Manual verification checklist** (for when the device build is up):

- [ ] Tap a row in List view → detail opens with tab bar visible
- [ ] Tap a marker on Map → info window; tap the info window → same detail page
- [ ] Back button returns to whichever view (list/map) launched the detail page
- [ ] DNC banner appears for a DNC-flagged prospect; Call + SMS buttons are disabled
- [ ] Call button opens the native dialer pre-filled with `primaryPhone`
- [ ] SMS button opens native Messages pre-filled
- [ ] Navigate opens Google Maps with turn-by-turn to the coords
- [ ] Tabs Calls / SMS / Appointments / Documents / Inspection / Notes all show a readable EmptyState (no blanks, no crashes)

## 15. Follow-ups (next passes, scope-by-tab)

When real data wiring begins, split `placeholder_tabs.dart` into per-tab files and wire as follows — each is a vertical slice (entity → model → datasource method → tab widget):

| Tab | Wire-up blocker | Earliest milestone |
|-----|------------------|---------------------|
| Notes | Needs compose TextField + `add_note` mutation; pure CRUD | Late M3 (can ship standalone) |
| Calls | Telnyx call_log rows don't exist until M4 | M4 |
| SMS | Telnyx sms_log rows don't exist until M4 | M4 |
| Appointments | Scheduling flow (and seed rows) ship in M5 | M5 |
| Documents | Contract generation + storage_path + signed URL ship in M5 | M5 |
| Inspection | Inspection capture (damage_data + photos) ships in M5 | M5 |

Adding a `ProspectDetailBloc` is the natural trigger for the first real tab — at that point consolidate into the 7-query batch described in §3.1.
