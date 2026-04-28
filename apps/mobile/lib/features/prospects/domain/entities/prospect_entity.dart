class ProspectEntity {
  final String id;
  final String tenantId;
  final String name;
  final String? address;
  final String? city;
  final String? state;
  final String? zip;
  final List<String> phones;
  final String? email;
  final String status;
  final String? assignedTo;
  final double? hailSize;
  final double? homeValue;
  final bool doNotCall;
  final String? doNotCallReason;
  final double? latitude;
  final double? longitude;
  final DateTime createdAt;
  final DateTime updatedAt;

  const ProspectEntity({
    required this.id,
    required this.tenantId,
    required this.name,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.address,
    this.city,
    this.state,
    this.zip,
    this.phones = const [],
    this.email,
    this.assignedTo,
    this.hailSize,
    this.homeValue,
    this.doNotCall = false,
    this.doNotCallReason,
    this.latitude,
    this.longitude,
  });

  bool get hasCoordinates => latitude != null && longitude != null;

  /// Formatted single-line address for list rows.
  String get displayAddress {
    final parts = [
      address,
      city,
      state,
    ].where((p) => p != null && p.trim().isNotEmpty).toList();
    return parts.join(', ');
  }

  /// Primary phone number — first entry in the phones array, or null.
  String? get primaryPhone => phones.isNotEmpty ? phones.first : null;
}
