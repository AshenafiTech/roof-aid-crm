class UserEntity {
  final String id;
  final String tenantId;
  final String role;
  final String email;
  final String? firstName;
  final String? lastName;
  final String? phone;
  final bool isActive;

  const UserEntity({
    required this.id,
    required this.tenantId,
    required this.role,
    required this.email,
    this.firstName,
    this.lastName,
    this.phone,
    this.isActive = true,
  });

  String get displayName {
    if (firstName != null && lastName != null) {
      return '$firstName $lastName';
    }
    return email;
  }
}
