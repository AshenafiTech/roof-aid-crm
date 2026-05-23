import 'package:flutter/material.dart';

/// Canonical appointment statuses.
///
/// Keep the DB values + colors + labels in sync with the web app's
/// `apps/web/lib/constants/appointment-status.ts`. Locked in
/// `docs/milestone5/web-dependencies-for-mobile.md` §3.1.
class AppointmentStatus {
  static const String pending = 'pending';
  static const String confirmed = 'confirmed';
  static const String completed = 'completed';
  static const String cancelled = 'cancelled';
  static const String noShow = 'no_show';
  static const String rescheduled = 'rescheduled';

  static const List<String> all = [
    pending,
    confirmed,
    completed,
    cancelled,
    noShow,
    rescheduled,
  ];

  /// Terminal states the BLoC cannot transition away from.
  static const Set<String> terminal = {
    completed,
    cancelled,
    noShow,
    rescheduled,
  };

  static String label(String status) {
    switch (status) {
      case pending:
        return 'Pending';
      case confirmed:
        return 'Confirmed';
      case completed:
        return 'Completed';
      case cancelled:
        return 'Cancelled';
      case noShow:
        return 'No-show';
      case rescheduled:
        return 'Rescheduled';
      default:
        return status;
    }
  }

  static Color color(String status) {
    switch (status) {
      case pending:
        return const Color(0xFF9CA3AF); // gray-400
      case confirmed:
        return const Color(0xFF2563EB); // blue-600
      case completed:
        return const Color(0xFF16A34A); // green-600
      case cancelled:
        return const Color(0xFFDC2626); // red-600
      case noShow:
        return const Color(0xFFEA580C); // orange-600
      case rescheduled:
        return const Color(0xFF7C3AED); // violet-600
      default:
        return const Color(0xFF6B7280);
    }
  }
}
