import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injection_container.dart';
import '../../domain/entities/prospect_entity.dart';
import '../bloc/notes_bloc.dart';
import '../bloc/notes_event.dart';
import '../widgets/dnc_banner.dart';
import '../widgets/quick_actions_bar.dart';
import '../widgets/tabs/notes_tab.dart';
import '../widgets/tabs/overview_tab.dart';
import '../widgets/tabs/placeholder_tabs.dart';

/// The 7-tab prospect detail screen a Rufero lands on after tapping a row
/// on the list or an info window on the map. M3 only wires the Overview
/// tab — the other six show placeholders for data that ships in M4/M5.
class ProspectDetailPage extends StatelessWidget {
  final ProspectEntity prospect;

  const ProspectDetailPage({super.key, required this.prospect});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 7,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            prospect.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Calls'),
              Tab(text: 'SMS'),
              Tab(text: 'Appointments'),
              Tab(text: 'Documents'),
              Tab(text: 'Inspection'),
              Tab(text: 'Notes'),
            ],
          ),
        ),
        body: Column(
          children: [
            if (prospect.doNotCall) DncBanner(reason: prospect.doNotCallReason),
            Expanded(
              child: TabBarView(
                children: [
                  OverviewTab(prospect: prospect),
                  const CallsTab(),
                  const SmsTab(),
                  const AppointmentsTab(),
                  const DocumentsTab(),
                  const InspectionTab(),
                  BlocProvider<NotesBloc>(
                    create: (_) =>
                        sl<NotesBloc>()..add(NotesLoadRequested(prospect.id)),
                    child: const NotesTab(),
                  ),
                ],
              ),
            ),
          ],
        ),
        bottomNavigationBar: QuickActionsBar(prospect: prospect),
      ),
    );
  }
}
