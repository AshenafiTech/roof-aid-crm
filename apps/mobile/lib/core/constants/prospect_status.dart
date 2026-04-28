import 'package:flutter/material.dart';

/// Canonical prospect statuses.
///
/// Mirrors `apps/web/lib/constants/prospect-status.ts` exactly — values,
/// labels, and bar/accent colors. Keep this list in sync with the web
/// app and the DB `prospects.status` column.
class ProspectStatus {
  static const String newLeads = 'new_leads';
  static const String prospects = 'prospects';
  static const String contacted = 'contacted';
  static const String scheduled = 'scheduled';
  static const String closedCustomer = 'closed_customer';
  static const String notViable = 'not_viable';

  /// All statuses in workflow order (entry → terminal).
  static const List<String> all = [
    newLeads,
    prospects,
    contacted,
    scheduled,
    closedCustomer,
    notViable,
  ];

  /// `not_viable` is terminal — prospects cannot transition out of it.
  /// Web applies a muted row background for these; mobile can mirror that
  /// visual treatment at the tile level if desired.
  static bool isTerminal(String status) => status == notViable;

  /// Human-readable label.
  static String label(String status) {
    switch (status) {
      case newLeads:
        return 'New Leads';
      case prospects:
        return 'Prospects';
      case contacted:
        return 'Contacted';
      case scheduled:
        return 'Scheduled';
      case closedCustomer:
        return 'Closed Customer';
      case notViable:
        return 'Not Viable';
      default:
        return status;
    }
  }

  /// Accent color for a status badge / indicator bar. Hex values map to the
  /// tailwind classes the web app uses (`bg-blue-500`, `bg-sky-400`, …).
  static Color color(String status) {
    switch (status) {
      case newLeads:
        return const Color(0xFF3B82F6); // blue-500
      case prospects:
        return const Color(0xFF60A5FA); // blue-400
      case contacted:
        return const Color(0xFF0EA5E9); // sky-500
      case scheduled:
        return const Color(0xFF38BDF8); // sky-400
      case closedCustomer:
        return const Color(0xFF10B981); // emerald-500
      case notViable:
        return const Color(0xFF9CA3AF); // gray-400 (slightly darker than web's 300 for legibility)
      default:
        return const Color(0xFF9CA3AF);
    }
  }
}
