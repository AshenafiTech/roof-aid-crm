# Stage 7b — Flutter Mobile Auth Integration

> Completed: 2026-04-09

## Purpose

Implement Supabase authentication for the Flutter mobile app following Clean Architecture (DDD) with BLoC state management, matching the web app's auth flow.

## What Was Done

### 1. Domain Layer (`features/auth/domain/`)

| File | Purpose |
|------|---------|
| `entities/user_entity.dart` | Pure Dart entity matching `users` table schema |
| `repositories/auth_repository.dart` | Abstract contract returning `Either<Failure, T>` |
| `usecases/sign_in.dart` | Sign in use case |
| `usecases/sign_out.dart` | Sign out use case |
| `usecases/get_current_user.dart` | Get current session user |

### 2. Data Layer (`features/auth/data/`)

| File | Purpose |
|------|---------|
| `models/user_model.dart` | Maps Supabase row → `UserEntity` |
| `datasources/auth_remote_datasource.dart` | Supabase `signInWithPassword`, `signOut`, profile fetch from `users` table |
| `repositories/auth_repository_impl.dart` | Catches `ServerException`, returns `Either<Failure, T>` |

**Key decisions:**
- Remote datasource fetches user profile from `users` table (not just JWT) for fresh role/active status
- Error messages mapped to user-friendly text (same mapping as web app)
- `fromMap` factory on `UserModel` for Supabase row deserialization

### 3. Presentation Layer (`features/auth/presentation/`)

| File | Purpose |
|------|---------|
| `bloc/auth_event.dart` | Sealed events: `AuthCheckRequested`, `AuthSignInRequested`, `AuthSignOutRequested` |
| `bloc/auth_state.dart` | Sealed states: `AuthInitial`, `AuthLoading`, `AuthAuthenticated`, `AuthUnauthenticated`, `AuthError` |
| `bloc/auth_bloc.dart` | Handles events, calls use cases, emits states |
| `pages/login_page.dart` | Production login UI with Material 3 |

**Login page features:**
- Form validation (email format, password min 6 chars)
- Show/hide password toggle
- Loading spinner with disabled button during submission
- Error display via floating SnackBar
- AutofillHints for credential managers
- Submit via keyboard (TextInputAction.done)

### 4. Dependency Injection (`core/di/injection_container.dart`)

Wired all auth dependencies into GetIt:
- `SupabaseClient` → lazy singleton
- Datasource → lazy singleton
- Repository → lazy singleton
- Use cases → lazy singletons
- `AuthBloc` → factory (new instance per widget tree)

### 5. App Routing (`app.dart`)

- `BlocProvider` at app root provides `AuthBloc`
- `GoRouter` with `refreshListenable` reacts to auth state changes
- Redirect logic: unauthenticated → `/login`, authenticated → `/dashboard`
- `GoRouterRefreshStream` bridges BLoC stream to GoRouter's `Listenable`
- Material 3 theme with input decoration styling
- Temporary dashboard placeholder with sign-out button

## Architecture

```
app.dart (BlocProvider + GoRouter)
  └── AuthBloc
        ├── SignIn (use case)
        ├── SignOut (use case)
        └── GetCurrentUser (use case)
              └── AuthRepository (interface)
                    └── AuthRepositoryImpl
                          └── AuthRemoteDatasource
                                └── SupabaseClient
```

## Verification

- `flutter analyze` — 0 issues

## Testing

To test on mobile:
1. Ensure Supabase env vars are set (via `--dart-define` or `.env`)
2. Run `flutter run` on a device/emulator
3. Login with the same credentials created for web testing
4. Verify: login → dashboard → sign out flow

## TODO

- [ ] Test full auth flow on device/emulator
- [ ] Add splash screen during `AuthCheckRequested`
- [ ] Add biometric/pin auth for returning users
- [ ] Add offline session caching with Hive
