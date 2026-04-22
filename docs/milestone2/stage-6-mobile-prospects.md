# Stage 6 — Mobile: Assigned Prospects List + Real-time Sync

**Goal:** Ship the first real feature screen on mobile — Ruferos see their assigned prospects, pull to refresh, tap to view (placeholder) detail, and get real-time updates.

**Outcome:** When the Rufero opens the Flutter app after login, they land on a list of their assigned prospects. Changes made in the web dashboard show up on their phone within seconds.

**Estimated time:** 1.5 days

---

## 1. Feature folder structure (DDD, matching auth feature)

```
apps/mobile/lib/features/prospects/
├── domain/
│   ├── entities/
│   │   └── prospect_entity.dart
│   ├── repositories/
│   │   └── prospect_repository.dart
│   └── usecases/
│       ├── get_assigned_prospects.dart
│       └── watch_assigned_prospects.dart
├── data/
│   ├── models/
│   │   └── prospect_model.dart
│   ├── datasources/
│   │   └── prospect_remote_datasource.dart
│   └── repositories/
│       └── prospect_repository_impl.dart
└── presentation/
    ├── bloc/
    │   ├── prospects_bloc.dart
    │   ├── prospects_event.dart
    │   └── prospects_state.dart
    ├── pages/
    │   └── prospects_page.dart
    └── widgets/
        └── prospect_list_tile.dart
```

---

## 2. Domain layer

### 2.1 Entity

**File:** `domain/entities/prospect_entity.dart`

```dart
class ProspectEntity {
  final String id;
  final String tenantId;
  final String name;
  final String? address;
  final String? city;
  final String? state;
  final String? phone;
  final String? email;
  final String status;
  final String? assignedTo;
  final double? hailSize;
  final double? homeValue;
  final DateTime createdAt;

  const ProspectEntity({
    required this.id,
    required this.tenantId,
    required this.name,
    required this.status,
    required this.createdAt,
    this.address,
    this.city,
    this.state,
    this.phone,
    this.email,
    this.assignedTo,
    this.hailSize,
    this.homeValue,
  });

  String get displayAddress {
    final parts = [address, city, state].where((p) => p != null && p.isNotEmpty).toList();
    return parts.join(", ");
  }
}
```

### 2.2 Repository contract

```dart
abstract class ProspectRepository {
  Future<Either<Failure, List<ProspectEntity>>> getAssignedProspects();
  Stream<List<ProspectEntity>> watchAssignedProspects();
}
```

### 2.3 Use cases

```dart
class GetAssignedProspects {
  final ProspectRepository repository;
  GetAssignedProspects(this.repository);
  Future<Either<Failure, List<ProspectEntity>>> call() => repository.getAssignedProspects();
}

class WatchAssignedProspects {
  final ProspectRepository repository;
  WatchAssignedProspects(this.repository);
  Stream<List<ProspectEntity>> call() => repository.watchAssignedProspects();
}
```

---

## 3. Data layer

### 3.1 Model

**File:** `data/models/prospect_model.dart`

Extends `ProspectEntity`, adds `fromMap` factory to convert Supabase row → entity. Handle nullable types and DateTime parsing carefully.

### 3.2 Remote datasource

**File:** `data/datasources/prospect_remote_datasource.dart`

```dart
class ProspectRemoteDataSource {
  final SupabaseClient _supabase;
  ProspectRemoteDataSource(this._supabase);

  Future<List<ProspectModel>> fetchAssigned() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) throw ServerException("Not authenticated");

    try {
      final response = await _supabase
          .from("prospects")
          .select()
          .eq("assigned_to", userId)
          .order("created_at", ascending: false);

      return (response as List).map((row) => ProspectModel.fromMap(row)).toList();
    } catch (e) {
      throw ServerException(e.toString());
    }
  }

  Stream<List<ProspectModel>> watchAssigned() {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return Stream.value([]);

    return _supabase
        .from("prospects")
        .stream(primaryKey: ["id"])
        .eq("assigned_to", userId)
        .order("created_at", ascending: false)
        .map((rows) => rows.map((r) => ProspectModel.fromMap(r)).toList());
  }
}
```

> Supabase's `.stream()` handles the realtime subscription + initial fetch + updates in one stream. No manual `onPostgresChanges` wiring needed.

### 3.3 Repository impl

Wraps the datasource, converts exceptions → `Failure`, returns `Either` for the Future method. The stream method passes through directly (streams in DDD are less dogmatic — `Either` per event is painful).

---

## 4. BLoC

### 4.1 Events

**File:** `presentation/bloc/prospects_event.dart`

```dart
sealed class ProspectsEvent {}
class ProspectsLoadRequested extends ProspectsEvent {}
class ProspectsRefreshRequested extends ProspectsEvent {}
class ProspectsStreamUpdated extends ProspectsEvent {
  final List<ProspectEntity> prospects;
  ProspectsStreamUpdated(this.prospects);
}
```

### 4.2 States

```dart
sealed class ProspectsState {}
class ProspectsInitial extends ProspectsState {}
class ProspectsLoading extends ProspectsState {}
class ProspectsLoaded extends ProspectsState {
  final List<ProspectEntity> prospects;
  ProspectsLoaded(this.prospects);
}
class ProspectsError extends ProspectsState {
  final String message;
  ProspectsError(this.message);
}
```

### 4.3 BLoC

**File:** `presentation/bloc/prospects_bloc.dart`

```dart
class ProspectsBloc extends Bloc<ProspectsEvent, ProspectsState> {
  final GetAssignedProspects _getAssigned;
  final WatchAssignedProspects _watchAssigned;
  StreamSubscription? _subscription;

  ProspectsBloc({
    required GetAssignedProspects getAssigned,
    required WatchAssignedProspects watchAssigned,
  })  : _getAssigned = getAssigned,
        _watchAssigned = watchAssigned,
        super(ProspectsInitial()) {
    on<ProspectsLoadRequested>(_onLoad);
    on<ProspectsRefreshRequested>(_onRefresh);
    on<ProspectsStreamUpdated>((event, emit) => emit(ProspectsLoaded(event.prospects)));
  }

  Future<void> _onLoad(ProspectsLoadRequested event, Emitter<ProspectsState> emit) async {
    emit(ProspectsLoading());
    final result = await _getAssigned();
    result.fold(
      (failure) => emit(ProspectsError(failure.message)),
      (prospects) {
        emit(ProspectsLoaded(prospects));
        // Start watching after initial load
        _subscription?.cancel();
        _subscription = _watchAssigned().listen(
          (prospects) => add(ProspectsStreamUpdated(prospects)),
        );
      },
    );
  }

  Future<void> _onRefresh(ProspectsRefreshRequested event, Emitter<ProspectsState> emit) async {
    final result = await _getAssigned();
    result.fold(
      (failure) => emit(ProspectsError(failure.message)),
      (prospects) => emit(ProspectsLoaded(prospects)),
    );
  }

  @override
  Future<void> close() {
    _subscription?.cancel();
    return super.close();
  }
}
```

> `close()` is critical — without cancelling the stream, you leak subscriptions every time the BLoC is recreated.

---

## 5. UI: Prospects page

**File:** `presentation/pages/prospects_page.dart`

```dart
class ProspectsPage extends StatelessWidget {
  const ProspectsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => sl<ProspectsBloc>()..add(ProspectsLoadRequested()),
      child: Scaffold(
        appBar: AppBar(title: const Text("My Prospects")),
        body: BlocBuilder<ProspectsBloc, ProspectsState>(
          builder: (context, state) {
            if (state is ProspectsLoading || state is ProspectsInitial) {
              return const Center(child: CircularProgressIndicator());
            }
            if (state is ProspectsError) {
              return _ErrorView(message: state.message);
            }
            if (state is ProspectsLoaded) {
              if (state.prospects.isEmpty) return const _EmptyView();
              return RefreshIndicator(
                onRefresh: () async {
                  context.read<ProspectsBloc>().add(ProspectsRefreshRequested());
                  await context.read<ProspectsBloc>().stream.firstWhere(
                    (s) => s is ProspectsLoaded || s is ProspectsError,
                  );
                },
                child: ListView.separated(
                  itemCount: state.prospects.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) => ProspectListTile(prospect: state.prospects[i]),
                ),
              );
            }
            return const SizedBox();
          },
        ),
      ),
    );
  }
}
```

---

## 6. List tile

**File:** `presentation/widgets/prospect_list_tile.dart`

```dart
class ProspectListTile extends StatelessWidget {
  final ProspectEntity prospect;
  const ProspectListTile({super.key, required this.prospect});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(prospect.name, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(prospect.displayAddress),
      trailing: _StatusChip(status: prospect.status),
      onTap: () {
        // TODO(M3): navigate to detail page
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Detail view ships in M3")),
        );
      },
    );
  }
}
```

Status chip uses the same 6 statuses as web with matching colors (keep the color map in a shared constants file).

---

## 7. Routing update

Update `apps/mobile/lib/app.dart`:

- Replace the `_DashboardPlaceholder` with `ProspectsPage`
- When `authenticated`, redirect `/login` → `/prospects`
- Default route for authenticated users: `/prospects`

```dart
GoRoute(path: "/prospects", builder: (_, __) => const ProspectsPage()),
```

---

## 8. DI registration

Update `apps/mobile/lib/core/di/injection_container.dart`:

```dart
// Data sources
sl.registerLazySingleton(() => ProspectRemoteDataSource(sl()));

// Repository
sl.registerLazySingleton<ProspectRepository>(
  () => ProspectRepositoryImpl(sl()),
);

// Use cases
sl.registerLazySingleton(() => GetAssignedProspects(sl()));
sl.registerLazySingleton(() => WatchAssignedProspects(sl()));

// BLoC
sl.registerFactory(() => ProspectsBloc(
  getAssigned: sl(),
  watchAssigned: sl(),
));
```

---

## 9. Acceptance criteria

- [ ] Rufero logs in → lands on Prospects page showing assigned prospects
- [ ] Pull to refresh works and shows a loading indicator
- [ ] Empty state shows when no prospects assigned
- [ ] Error state shows with retry button on failure
- [ ] Updating a prospect's status in the web dashboard → mobile list updates within 2 seconds
- [ ] Reassigning away from the rufero → the prospect disappears from their list
- [ ] Reassigning to the rufero → the prospect appears
- [ ] RLS verified: rufero from tenant B cannot see any tenant A prospects
- [ ] Navigating away and back to the page does not leak subscriptions (check Supabase realtime tab)
- [ ] BLoC `close()` cancels the stream subscription

---

## 10. Pitfalls to avoid

- **Don't** use two separate mechanisms for initial fetch + watch — Supabase's `.stream()` covers both. Use it as the primary path; keep `fetchAssigned` only for pull-to-refresh
- **Don't** forget to cancel the `StreamSubscription` in `close()` — memory leak + duplicate emissions
- **Don't** emit a new state on every keystroke-like realtime update — batch them if needed (not an issue at M2 scale)
- **Don't** use `!` on nullable fields from Supabase — handle null carefully in `ProspectModel.fromMap`
- **Don't** hardcode color maps in multiple files — put them in `core/constants/prospect_status.dart` and import everywhere
