import 'package:flutter/material.dart';

import '../empty_state.dart';

/// Tab stubs shown in the prospect detail page for data sources that exist
/// in the schema but aren't yet wired to the mobile client. Each becomes
/// its own file (with real queries + models) in the milestone noted below.

class CallsTab extends StatelessWidget {
  const CallsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const EmptyState(
      icon: Icons.phone_in_talk_outlined,
      title: 'No call history yet',
      description:
          'Call logs will appear here once Telnyx calling is live (M4).',
    );
  }
}

// AppointmentsTab now lives in `appointments_tab.dart` — real
// scrollable list of upcoming + past appointments for the prospect.

// DocumentsTab now lives in `documents_tab.dart` — real list of
// per-prospect documents with tap-to-open / tap-to-sign.

// InspectionTab now lives in `inspection_tab.dart` — it's the entry
// point for ad-hoc / walk-in inspections (M5 follow-up, Option B).

