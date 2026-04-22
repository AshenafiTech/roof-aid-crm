import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/error/exceptions.dart';
import '../models/user_model.dart';

abstract class AuthRemoteDatasource {
  Future<UserModel> signIn({
    required String email,
    required String password,
  });

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
    } on AuthException catch (e) {
      throw ServerException(_mapAuthError(e.message));
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await client.auth.signOut();
    } on AuthException catch (e) {
      throw ServerException(e.message);
    }
  }

  @override
  Future<UserModel> getCurrentUser() async {
    final session = client.auth.currentSession;
    if (session == null) {
      throw ServerException('No active session');
    }

    final userId = session.user.id;
    return _fetchUserProfile(userId);
  }

  Future<UserModel> _fetchUserProfile(String userId) async {
    try {
      final data = await client
          .from('users')
          .select('id, tenant_id, role, email, first_name, last_name, phone, is_active')
          .eq('id', userId)
          .maybeSingle();

      if (data == null) {
        throw ServerException(
          'User profile not found. Please contact your administrator.',
        );
      }

      return UserModel.fromMap(data);
    } on PostgrestException catch (e) {
      throw ServerException(e.message);
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
