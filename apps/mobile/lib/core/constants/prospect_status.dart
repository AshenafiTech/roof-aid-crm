import 'package:flutter/material.dart';

/// Canonical prospect statuses.
///
/// Keep this list in sync with the web app and the DB `prospects.status`
/// column. The string values are the DB values (snake_case).
class ProspectStatus {
  static const String newLeads = 'new_leads';
  static const String contacted = 'contacted';
  static const String appointmentSet = 'appointment_set';
  static const String inspected = 'inspected';
  static const String signed = 'signed';
  static const String notInterested = 'not_interested';

  static const List<String> all = [
    newLeads,
    contacted,
    appointmentSet,
    inspected,
    signed,
    notInterested,
  ];

  /// Human-readable label for a status value.
  static String label(String status) {
    switch (status) {
      case newLeads:
        return 'New Lead';
      case contacted:
        return 'Contacted';
      case appointmentSet:
        return 'Appointment Set';
      case inspected:
        return 'Inspected';
      case signed:
        return 'Signed';
      case notInterested:
        return 'Not Interested';
      default:
        return status;
    }
  }

  /// Accent color for a status badge. Mirrors the web palette.
  static Color color(String status) {
    switch (status) {
      case newLeads:
        return const Color(0xFF2563EB); // blue-600
      case contacted:
        return const Color(0xFF7C3AED); // violet-600
      case appointmentSet:
        return const Color(0xFFD97706); // amber-600
      case inspected:
        return const Color(0xFF0891B2); // cyan-600
      case signed:
        return const Color(0xFF16A34A); // green-600
      case notInterested:
        return const Color(0xFF6B7280); // gray-500
      default:
        return const Color(0xFF6B7280);
    }
  }
}
