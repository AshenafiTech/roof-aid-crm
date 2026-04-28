import 'dart:async';
import 'dart:io';

/// Returns true when [error] looks like a connectivity / DNS / socket failure
/// rather than a real auth or server error.
///
/// Covers raw `SocketException` and `TimeoutException` from `dart:io` /
/// `dart:async`, plus a string-match fallback for the wrapped variants we see
/// from the Supabase SDK — `AuthRetryableFetchException` and `ClientException`
/// both stringify with the underlying socket failure inline. Strict typed
/// catches alone would miss those.
bool isNetworkError(Object error) {
  if (error is SocketException) return true;
  if (error is TimeoutException) return true;
  final s = error.toString().toLowerCase();
  return s.contains('socketexception') ||
      s.contains('failed host lookup') ||
      s.contains('clientexception') ||
      s.contains('authretryablefetch') ||
      s.contains('network is unreachable') ||
      s.contains('connection refused') ||
      s.contains('connection failed') ||
      s.contains('connection closed') ||
      s.contains('connection reset');
}

/// User-facing copy used everywhere we surface offline errors, so the
/// wording stays consistent across login, prospects list, notes, etc.
const String offlineMessage =
    'You appear to be offline. Check your internet connection and try again.';
