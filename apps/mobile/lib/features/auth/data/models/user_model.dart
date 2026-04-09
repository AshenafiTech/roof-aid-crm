import '../../domain/entities/user_entity.dart';

class UserModel extends UserEntity {
  const UserModel({
    required super.id,
    required super.tenantId,
    required super.role,
    required super.email,
    super.firstName,
    super.lastName,
    super.phone,
    super.isActive,
  });

  factory UserModel.fromMap(Map<String, dynamic> map) {
    return UserModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      role: map['role'] as String,
      email: map['email'] as String,
      firstName: map['first_name'] as String?,
      lastName: map['last_name'] as String?,
      phone: map['phone'] as String?,
      isActive: map['is_active'] as bool? ?? true,
    );
  }
}
