import '../../domain/entities/user_entity.dart';

sealed class AuthState {
  const AuthState();
}

class AuthInitial extends AuthState {
  const AuthInitial();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class AuthAuthenticated extends AuthState {
  final UserEntity user;

  const AuthAuthenticated(this.user);
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

class AuthError extends AuthState {
  final String message;

  const AuthError(this.message);
}

/// Distinct from [AuthError] so the UI can show an offline-specific affordance
/// (icon + retry hint) rather than treating connectivity failures as auth or
/// server errors. Emitted whenever a network-level failure interrupts an auth
/// flow (sign-in, session check, sign-out).
class AuthOffline extends AuthState {
  final String message;

  const AuthOffline(this.message);
}
