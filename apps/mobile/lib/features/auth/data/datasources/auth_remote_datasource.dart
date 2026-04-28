import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_error_detection.dart';
import '../models/user_model.dart';

abstract class AuthRemoteDatasource {
  Future<UserModel> signIn({required String email, required String password});

  Future<void> signOut();

  Future<UserModel> getCurrentUser();
}

class AuthRemoteDatasourceImpl implements AuthRemoteDatasource {
  final SupabaseClient client;

  const AuthRemoteDatasourceImpl(this.client);

  @override
  Future<UserModel> signIn({
    required String email,
    required String password,
  }) async {
    try {
      final response = await client.auth.signInWithPassword(
        email: email,
        password: password,
      );

      if (response.user == null) {
        throw ServerException('Login failed. Please try again.');
      }

      return _fetchUserProfile(response.user!.id);
    } on ServerException {
      rethrow;
    } on NetworkException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is AuthException) {
        throw ServerException(_mapAuthError(e.message));
      }
      throw ServerException('Something went wrong. Please try again later.');
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await client.auth.signOut();
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is AuthException) {
        throw ServerException(e.message);
      }
      throw ServerException('Could not sign out. Please try again.');
    }
  }

  @override
  Future<UserModel> getCurrentUser() async {
    final session = client.auth.currentSession;
    if (session == null) {
      throw ServerException('No active session');
    }
    return _fetchUserProfile(session.user.id);
  }

  Future<UserModel> _fetchUserProfile(String userId) async {
    try {
      final data = await client
          .from('users')
          .select(
            'id, tenant_id, role, email, first_name, last_name, phone, is_active',
          )
          .eq('id', userId)
          .maybeSingle();

      if (data == null) {
        throw ServerException(
          'User profile not found. Please contact your administrator.',
        );
      }

      return UserModel.fromMap(data);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) {
        throw NetworkException(offlineMessage);
      }
      if (e is PostgrestException) {
        throw ServerException(e.message);
      }
      if (e is AuthException) {
        throw ServerException(_mapAuthError(e.message));
      }
      throw ServerException('Could not load your profile. Please try again.');
    }
  }

  String _mapAuthError(String message) {
    if (message.contains('Invalid login credentials')) {
      return 'Invalid email or password. Please try again.';
    }
    if (message.contains('Email not confirmed')) {
      return 'Please verify your email address before signing in.';
    }
    if (message.contains('rate limit') || message.contains('429')) {
      return 'Too many login attempts. Please wait a moment and try again.';
    }
    return 'Something went wrong. Please try again later.';
  }
}
