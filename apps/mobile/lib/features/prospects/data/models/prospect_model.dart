import '../../domain/entities/prospect_entity.dart';

class ProspectModel extends ProspectEntity {
  const ProspectModel({
    required super.id,
    required super.tenantId,
    required super.name,
    required super.status,
    required super.createdAt,
    required super.updatedAt,
    super.address,
    super.city,
    super.state,
    super.zip,
    super.phones,
    super.email,
    super.assignedTo,
    super.hailSize,
    super.homeValue,
    super.doNotCall,
  });

  factory ProspectModel.fromMap(Map<String, dynamic> map) {
    return ProspectModel(
      id: map['id'] as String,
      tenantId: map['tenant_id'] as String,
      name: map['name'] as String,
      status: (map['status'] as String?) ?? 'new_leads',
      createdAt: _parseDate(map['created_at']) ?? DateTime.now(),
      updatedAt: _parseDate(map['updated_at']) ?? DateTime.now(),
      address: map['address'] as String?,
      city: map['city'] as String?,
      state: map['state'] as String?,
      zip: map['zip'] as String?,
      phones: _parseStringList(map['phones']),
      email: map['email'] as String?,
      assignedTo: map['assigned_to'] as String?,
      hailSize: _parseDouble(map['hail_size']),
      homeValue: _parseDouble(map['home_value']),
      doNotCall: (map['do_not_call'] as bool?) ?? false,
    );
  }

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  static double? _parseDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  static List<String> _parseStringList(dynamic value) {
    if (value == null) return const [];
    if (value is List) {
      return value.whereType<String>().toList(growable: false);
    }
    return const [];
  }
}
