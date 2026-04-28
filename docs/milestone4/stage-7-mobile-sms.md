# Stage 7 — Mobile SMS Reply

**Goal:** Bring the SMS thread + reply composer into the Flutter app for Ruferos. Same `send_sms` RPC contract as web. Real-time inbound delivery via Supabase Realtime. DNC + missing-phone enforcement reuses the `can_message` RPC. Unread badging on the SMS tab.

**Outcome:** A Rufero standing on a roof can reply to "is anyone there?" without leaving the field. Web and mobile share one source of truth for every message.

**Estimated time:** 1.5 days

**Platform note:** Android-only build target for now (no Mac/iOS device on the build machine). The Dart code is cross-platform — only Android-specific config is added.

---

## 1. Scope

| Feature | Where |
|---------|-------|
| `Sms` tab on prospect detail (replaces M3 placeholder) | Flutter prospect detail page |
| Threaded conversation | New widget; mirrors web's bubble layout |
| Compose + send via RPC | New `send_sms` use case |
| Real-time inbound updates | Realtime subscription, mirrored from existing notes pattern |
| Unread count on SMS tab | Tab bar badge using `sms_logs.read_at` |
| DNC / no-phone disables compose | Calls `can_message` on tab mount |

---

## 2. Domain layer

### Entity

`apps/mobile/lib/features/prospects/domain/entities/sms_message_entity.dart`:

```dart
class SmsMessageEntity {
  final String id;
  final String prospectId;
  final String direction;      // 'inbound' | 'outbound'
  final String body;
  final String? deliveryStatus;
  final DateTime sentAt;
  final String? agentName;     // null for inbound

  const SmsMessageEntity({
    required this.id,
    required this.prospectId,
    required this.direction,
    required this.body,
    this.deliveryStatus,
    required this.sentAt,
    this.agentName,
  });

  bool get isOutbound => direction == 'outbound';
  bool get isPending => deliveryStatus == 'queued' || deliveryStatus == 'sent';
  bool get isFailed => deliveryStatus == 'failed';
}
```

### Repository contract

```dart
abstract class SmsRepository {
  Future<Either<Failure, List<SmsMessageEntity>>> fetchForProspect(String prospectId);
  Stream<List<SmsMessageEntity>> watchForProspect(String prospectId);
  Future<Either<Failure, SmsMessageEntity>> send({
    required String prospectId,
    required String body,
  });
  Future<Either<Failure, CanMessageVerdict>> canMessage(String prospectId);
}
```

`CanMessageVerdict` is `({bool allowed, String reason})`.

---

## 3. Data layer

### Datasource

Mirror `note_remote_datasource.dart` shape: `fetchForProspect`, `watchForProspect`, `sendMessage`, `canMessage`. Apply the offline pattern from the auth-offline rollout (network errors → `NetworkException` → `NetworkFailure`).

```dart
@override
Future<SmsMessageModel> sendMessage({
  required String prospectId,
  required String body,
}) async {
  try {
    final id = await client.rpc('send_sms', params: {
      'p_prospect_id': prospectId,
      'p_body': body,
      'p_idempotency_key': const Uuid().v4(),
    });
    final row = await client.from('sms_logs').select().eq('id', id).single();
    return SmsMessageModel.fromMap(row);
  } on ServerException { rethrow; }
  on NetworkException { rethrow; }
  catch (e) {
    if (isNetworkError(e)) throw NetworkException(offlineMessage);
    if (e is PostgrestException && e.message.contains('sms_not_allowed')) {
      throw ServerException(_mapSendFailure(e.message));
    }
    throw ServerException('Failed to send. Try again.');
  }
}
```

### `canMessage` returns the verdict

```dart
@override
Future<CanMessageVerdict> canMessage(String prospectId) async {
  final res = await client.rpc('can_message', params: {'p_prospect_id': prospectId}) as Map<String, dynamic>;
  return (allowed: res['allowed'] as bool, reason: res['reason'] as String);
}
```

---

## 4. Bloc

`apps/mobile/lib/features/prospects/presentation/bloc/sms_bloc.dart` — same shape as `notes_bloc.dart`, with these states:

- `SmsInitial`
- `SmsLoading`
- `SmsLoaded(messages, isSubmitting, submitError, canSend, blockedReason)`
- `SmsError(message, isOffline)`

Events:
- `SmsLoadRequested(prospectId)` — load + verdict, then subscribe
- `SmsStreamUpdated(messages)` — Realtime delta
- `SmsSendRequested(body)` — calls `repo.send(...)`
- `SmsRefreshVerdictRequested` — re-checks `can_message` (after focus, e.g.)

Pattern: optimistically prepend the new message with `delivery_status: 'queued'` on submit, replace via Realtime when the row lands.

---

## 5. Presentation

### Tab integration

Replace the M3 placeholder in `prospect_detail_page.dart`:

```dart
BlocProvider<SmsBloc>(
  create: (_) => sl<SmsBloc>()..add(SmsLoadRequested(prospect.id)),
  child: const SmsTab(),
),
```

### `SmsTab`

```dart
class SmsTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SmsBloc, SmsState>(
      builder: (context, state) {
        if (state is SmsInitial || state is SmsLoading) {
          return const Center(child: CircularProgressIndicator());
        }
        if (state is SmsError) {
          return _ErrorView(message: state.message, isOffline: state.isOffline);
        }
        if (state is SmsLoaded) {
          return Column(
            children: [
              Expanded(child: _ThreadList(messages: state.messages)),
              _Composer(
                enabled: state.canSend && !state.isSubmitting,
                blockedReason: state.blockedReason,
                isSubmitting: state.isSubmitting,
                submitError: state.submitError,
              ),
            ],
          );
        }
        return const SizedBox.shrink();
      },
    );
  }
}
```

### `_ThreadList`

Renders newest-at-bottom, scrolls to bottom on insert. Bubbles:

- **Outbound**: right-aligned, `colorScheme.primary` tint, white text on primary if `delivery_status == 'delivered'`, slightly faded if `queued/sent`, red border + retry icon if `failed`
- **Inbound**: left-aligned, `surfaceContainer` background, `onSurface` text
- Below each bubble: timestamp + status icon (`done` / `done_all` / `error_outline` / `schedule`)

### `_Composer`

Same shape as `_NoteComposer` from `notes_tab.dart` for consistency: rounded text field on the left, send button on the right, error banner above when `submitError != null`. When `enabled: false`, swap the composer for a thin gray bar that reads, e.g.:

> _DNC flagged — replies blocked_

…or:

> _No phone number on file_

…depending on `blockedReason`.

---

## 6. Realtime subscription

```dart
final channel = client
  .channel('sms_realtime_$prospectId')
  .onPostgresChanges(
    event: PostgresChangeEvent.all,
    schema: 'public',
    table: 'sms_logs',
    callback: (_) => refetch(),
  )
  .subscribe();
```

Same pattern as notes; reuse the StreamController + onCancel cleanup.

---

## 7. Unread badge on the SMS tab

`sms_logs` doesn't have a `read_at` column today. Add one:

```sql
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
```

Inbound rows are unread until the SMS tab is opened. On `SmsLoadRequested`, the bloc calls a `mark_sms_read(prospect_id)` RPC that sets `read_at = now()` on all inbound rows for that prospect-user pair.

The tab bar in `prospect_detail_page.dart` shows a small red dot if any inbound rows have `read_at IS NULL`. Computed via a tiny `usecase` or directly off the loaded list.

---

## 8. DI registration

`apps/mobile/lib/core/di/injection_container.dart`:

```dart
sl.registerLazySingleton<SmsRemoteDatasource>(() => SmsRemoteDatasourceImpl(sl()));
sl.registerLazySingleton<SmsRepository>(() => SmsRepositoryImpl(sl()));
sl.registerFactory<SmsBloc>(() => SmsBloc(repository: sl()));
```

---

## 9. Acceptance checks

- [ ] Open an assigned prospect → SMS tab shows the conversation matching what's on web
- [ ] Type a message → tap send → bubble appears immediately (queued) → flips to sent/delivered as Telnyx confirms
- [ ] Reply from the QA homeowner phone → message lands on the mobile thread within 2 seconds
- [ ] Compose a message in mobile → web user sees it appear in real time
- [ ] DNC-flagged prospect → composer is replaced with a "DNC flagged" notice; the user cannot send
- [ ] Outside calling hours? **N/A for SMS** (only enforced for Call). SMS still allowed.
- [ ] No phone on prospect → "No phone number on file" notice
- [ ] Network drops mid-send → "Failed to send. Tap to retry." appears under the failed bubble
- [ ] When the user re-enters the SMS tab, the unread badge clears

---

## 10. Notes & gotchas

- **`tel:` and `sms:` hand-off vs in-app SMS coexistence**: M3's `QuickActionsBar` opens the device messaging app via `sms:` URI. Some Ruferos prefer that; we don't replace it, just add the in-app thread. The SMS tab is for context and convenience; the bottom-bar SMS button still does the device hand-off.
- **Realtime + offline**: Supabase Realtime tries to reconnect automatically. If the device is offline at tab open, the bloc emits `SmsError(isOffline: true)` and the existing offline view from M3 renders.
- **Send on Realtime echo**: when our own outbound message round-trips back via Realtime, dedupe by `id`. The bloc's optimistic insert assigns the same id as the server returns, so the Realtime `INSERT` event is a no-op replace.
- **Background notifications**: out of scope here — that's M6 push notifications via FCM. v1 in-app badge updates only when the app is foregrounded.
- **Mark-read on scroll vs on mount**: simpler to mark read on tab mount. Web does the same. If the user scrolls up to read older messages without sending, the read state is still settled from mount.
- **Idempotency UUID**: generated client-side with `package:uuid`. Pin the package version to avoid drift.
