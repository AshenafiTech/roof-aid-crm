import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injection_container.dart';
import '../../domain/entities/prospect_entity.dart';
import '../bloc/notes_bloc.dart';
import '../bloc/notes_event.dart';
import '../bloc/sms_bloc.dart';
import '../bloc/sms_event.dart';
import '../widgets/dnc_banner.dart';
import '../widgets/quick_actions_bar.dart';
import '../widgets/tabs/appointments_tab.dart';
import '../widgets/tabs/documents_tab.dart';
import '../widgets/tabs/inspection_tab.dart';
import '../widgets/tabs/notes_tab.dart';
import '../widgets/tabs/overview_tab.dart';
import '../widgets/tabs/placeholder_tabs.dart';
import '../widgets/tabs/sms_tab.dart';

/// The 7-tab prospect detail screen a Rufero lands on after tapping a row
/// on the list or an info window on the map. M3 only wires the Overview
/// tab — the other six show placeholders for data that ships in M4/M5.
class ProspectDetailPage extends StatelessWidget {
  final ProspectEntity prospect;

  /// Tab to open on first paint. 0=Overview, 1=Appointments, 2=Calls,
  /// 3=SMS, 4=Documents, 5=Inspection, 6=Notes. Used by the Messages tab
  /// inbox to land the user directly on the SMS thread.
  final int initialTabIndex;

  const ProspectDetailPage({
    super.key,
    required this.prospect,
    this.initialTabIndex = 0,
  });

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 7,
      initialIndex: initialTabIndex,
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
              Tab(text: 'Appointments'),
              Tab(text: 'Calls'),
              Tab(text: 'SMS'),
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
                  AppointmentsTab(prospect: prospect),
                  const CallsTab(),
                  BlocProvider<SmsBloc>(
                    create: (_) =>
                        sl<SmsBloc>()..add(SmsLoadRequested(prospect.id)),
                    child: const SmsTab(),
                  ),
                  DocumentsTab(prospect: prospect),
                  InspectionTab(prospect: prospect),
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
