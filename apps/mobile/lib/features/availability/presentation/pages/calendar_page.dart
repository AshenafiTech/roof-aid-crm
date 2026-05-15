import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injection_container.dart';
import '../../../appointments/presentation/bloc/appointments_bloc.dart';
import '../../../appointments/presentation/bloc/appointments_event.dart';
import '../bloc/calendar_bloc.dart';
import '../bloc/calendar_event.dart' as cal;
import '../widgets/calendar_tab_view.dart';
import '../widgets/list_tab_view.dart';
import 'block_editor_page.dart';
import 'working_hours_page.dart';

/// The rufero's "Calendar" tab — Google-style hour grid with a List
/// subtab, plus a FAB to add an availability block and an entry into
/// the personal working-hours editor.
class CalendarPage extends StatelessWidget {
  const CalendarPage({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<CalendarBloc>(
          create: (_) =>
              sl<CalendarBloc>()..add(const cal.CalendarLoadRequested()),
        ),
        BlocProvider<AppointmentsBloc>(
          create: (_) => sl<AppointmentsBloc>()
            ..add(const AppointmentsLoadRequested()),
        ),
      ],
      child: const _CalendarPageBody(),
    );
  }
}

class _CalendarPageBody extends StatefulWidget {
  const _CalendarPageBody();

  @override
  State<_CalendarPageBody> createState() => _CalendarPageBodyState();
}

class _CalendarPageBodyState extends State<_CalendarPageBody>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          elevation: 0,
          child: Row(
            children: [
              Expanded(
                child: TabBar(
                  controller: _tabs,
                  tabs: const [
                    Tab(
                      icon: Icon(Icons.calendar_view_day_outlined),
                      text: 'Calendar',
                    ),
                    Tab(
                      icon: Icon(Icons.view_list_outlined),
                      text: 'List',
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'My working hours',
                icon: const Icon(Icons.schedule_outlined),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const WorkingHoursPage(),
                  ),
                ),
              ),
              const SizedBox(width: 4),
            ],
          ),
        ),
        Expanded(
          child: Stack(
            children: [
              TabBarView(
                controller: _tabs,
                children: const [
                  CalendarTabView(),
                  ListTabView(),
                ],
              ),
              if (_tabs.index == 0)
                Positioned(
                  right: 16,
                  bottom: 16,
                  child: FloatingActionButton.extended(
                    heroTag: 'block-fab',
                    onPressed: () => _openBlockEditor(context),
                    icon: const Icon(Icons.event_busy_outlined),
                    label: const Text('Block time'),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _openBlockEditor(BuildContext context) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const BlockEditorPage(),
      ),
    );
  }
}
