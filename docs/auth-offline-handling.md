# Auth offline handling

## Problem

Two distinct symptoms when the device couldn't reach Supabase:

1. **Sign-in / session-check showed a generic "Something went wrong" error** instead of telling the user they were offline. Cause: the auth datasource only caught `AuthException` and `PostgrestException`; raw `SocketException` and Supabase's `AuthRetryableFetchException` (thrown when the SDK's internal token refresh fails) escaped untyped.
2. **The app sometimes showed a red error screen** with `Unhandled Exception: AuthRetryableFetchException(... Failed host lookup ...)`. Cause: Supabase's background token-refresh timer fires independently of any user action; when it fails offline, the resulting future-error is unhandled and surfaces at the runtime.

## Fix — six small changes

### 1. New `NetworkException` and `NetworkFailure`

`core/error/exceptions.dart` and `core/error/failures.dart` now expose a network-specific type. Distinct from `ServerException` / `ServerFailure` so the bloc can branch on them.

### 2. Datasource catches network errors explicitly

[`auth_remote_datasource.dart`](../apps/mobile/lib/features/auth/data/datasources/auth_remote_datasource.dart) now uses a `_looksLikeNetworkFailure(error)` helper that detects:

- `SocketException`, `TimeoutException` (typed)
- Anything whose `toString()` contains `socketexception`, `failed host lookup`, `clientexception`, `authretryablefetch`, `network is unreachable`, `connection refused / failed / closed / reset`

Each method (`signIn`, `signOut`, `_fetchUserProfile`) now does:

```dart
try { ... }
on ServerException { rethrow; }
on NetworkException { rethrow; }
catch (e) {
  if (_looksLikeNetworkFailure(e)) throw NetworkException(_offlineMessage);
  if (e is AuthException)         throw ServerException(_mapAuthError(e.message));
  if (e is PostgrestException)    throw ServerException(e.message);
  throw ServerException('Something went wrong. Please try again later.');
}
```

The string-match fallback is intentional: Supabase wraps the underlying socket failure inside `AuthRetryableFetchException`, which subclasses `AuthException`, so a strict `on SocketException` would miss it.

### 3. Repository maps the new exception

[`auth_repository_impl.dart`](../apps/mobile/lib/features/auth/data/repositories/auth_repository_impl.dart) catches `NetworkException` before `ServerException` and returns `NetworkFailure`.

### 4. New `AuthOffline` state

[`auth_state.dart`](../apps/mobile/lib/features/auth/presentation/bloc/auth_state.dart) — distinct from `AuthError`. The bloc emits it whenever a `NetworkFailure` interrupts sign-in, sign-out, or session check. **Notably, `_onCheckRequested` no longer collapses network failures into `AuthUnauthenticated`** — that was lying to the user (their session may still be valid; we just can't verify it offline).

### 5. Login page renders an offline-specific snackbar

[`login_page.dart`](../apps/mobile/lib/features/auth/presentation/pages/login_page.dart) listens for `AuthOffline` and shows a floating snackbar with a `wifi_off` icon and a **Retry** action that re-submits the form. Plain `AuthError` keeps its existing simple snackbar.

### 6. Top-level error guard for background refresh failures

[`main.dart`](../apps/mobile/lib/main.dart) wraps `runApp` in `runZonedGuarded` plus configures `PlatformDispatcher.instance.onError` and `FlutterError.onError`. **The guard is intentionally narrow** — it only swallows errors whose stringification matches the network-error patterns. Anything else still crashes loudly in dev so real bugs aren't masked.

## Behavior matrix

| Scenario | Before | After |
|---|---|---|
| Sign in while offline | "Something went wrong. Please try again later." | "You appear to be offline. Check your internet connection and try again." + Retry button |
| App opens with stale session, network down | Treated as unauthenticated → kicked to login | `AuthOffline` state held; user keeps current screen state |
| Background token refresh fails | Red error screen | Logged silently; app keeps running |
| Wrong password | "Invalid email or password" (unchanged) | "Invalid email or password" (unchanged) |
| Real server error (500, RLS denial, etc.) | Generic ServerFailure (unchanged) | Generic ServerFailure (unchanged) |

## Rollout to prospects + notes

The same pattern was extended after the auth pass:

- The local `_looksLikeNetworkFailure` helper was promoted to a shared module: [`core/network/network_error_detection.dart`](../apps/mobile/lib/core/network/network_error_detection.dart) exports `isNetworkError(error)` and `offlineMessage`. Every datasource and `main.dart` now imports from there — no copy-pasted heuristics.
- [`prospect_remote_datasource.dart`](../apps/mobile/lib/features/prospects/data/datasources/prospect_remote_datasource.dart) and [`note_remote_datasource.dart`](../apps/mobile/lib/features/prospects/data/datasources/note_remote_datasource.dart) now throw `NetworkException` on connectivity errors instead of swallowing them inside a generic `ServerException`.
- The corresponding repositories map `NetworkException` → `NetworkFailure`.
- `ProspectsError` and `NotesError` gained an `isOffline` bool. The blocs set it from `failure is NetworkFailure` for `Failure` paths, and `isNetworkError(event.message)` for stream-error paths (where the error has been stringified before reaching the bloc).
- The two `_ErrorView` widgets (in `prospects_page.dart` and `notes_tab.dart`) now branch on `isOffline` to render `Icons.wifi_off_rounded` with a softer onSurfaceVariant tint and a friendlier "You're offline" headline. Real server errors still show the red error icon.

## Snackbar dismissal on retry success

`MaterialApp` provides an app-level `ScaffoldMessenger`, so a snackbar shown on the login page survives navigation to `/dashboard`. The `BlocListener` in [`login_page.dart`](../apps/mobile/lib/features/auth/presentation/pages/login_page.dart) now explicitly calls `hideCurrentSnackBar()` whenever auth flips to `AuthLoading` (retry started) or `AuthAuthenticated` (sign-in succeeded), before any navigation can happen.

## Future work

- Promote `Failure → ErrorView` translation into a tiny shared widget so we don't keep duplicating the `isOffline ? ... : ...` icon ladder in every feature module.
- Add a global `OfflineBanner` (above the app shell) that listens for any `*Offline` state and shows a persistent dismissible bar — beats per-page error views when the user is offline for a while.
