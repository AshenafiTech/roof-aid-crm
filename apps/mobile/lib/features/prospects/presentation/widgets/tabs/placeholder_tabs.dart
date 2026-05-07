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

class AppointmentsTab extends StatelessWidget {
  const AppointmentsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const EmptyState(
      icon: Icons.event_outlined,
      title: 'No appointments scheduled',
      description:
          'Upcoming and past appointments will show here once scheduling ships (M5).',
    );
  }
}

class DocumentsTab extends StatelessWidget {
  const DocumentsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const EmptyState(
      icon: Icons.description_outlined,
      title: 'No documents on file',
      description:
          'Contracts and authorizations will appear here after they are generated (M5).',
    );
  }
}

class InspectionTab extends StatelessWidget {
  const InspectionTab({super.key});

  @override
  Widget build(BuildContext context) {
    return const EmptyState(
      icon: Icons.home_repair_service_outlined,
      title: 'No inspection recorded',
      description:
          'The inspection report and photo grid will appear here after the on-site visit (M5).',
    );
  }
}

