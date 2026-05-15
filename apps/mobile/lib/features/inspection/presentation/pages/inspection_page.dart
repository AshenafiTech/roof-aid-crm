import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/constants/photo_tags.dart';
import '../../../documents/presentation/bloc/signature_bloc.dart';
import '../../domain/entities/photo_entity.dart';
import '../bloc/inspection_bloc.dart';
import '../bloc/inspection_event.dart';
import '../bloc/inspection_state.dart';
import '../widgets/damage_form.dart';
import '../widgets/photo_grid.dart';
import '../widgets/photo_tag_selector.dart';
import 'photo_capture_page.dart';
import 'signature_capture_page.dart';

class InspectionPage extends StatelessWidget {
  final String appointmentId;
  final String prospectId;
  final String prospectName;
  final DateTime scheduledAt;

  const InspectionPage({
    super.key,
    required this.appointmentId,
    required this.prospectId,
    required this.prospectName,
    required this.scheduledAt,
  });

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<InspectionBloc>(
          create: (_) => sl<InspectionBloc>()
            ..add(InspectionLoadRequested(
              appointmentId: appointmentId,
              prospectId: prospectId,
            )),
        ),
        BlocProvider<SignatureBloc>(
          create: (_) => sl<SignatureBloc>(),
        ),
      ],
      child: _InspectionView(
        prospectName: prospectName,
        prospectId: prospectId,
        scheduledAt: scheduledAt,
      ),
    );
  }
}

class _InspectionView extends StatelessWidget {
  final String prospectName;
  final String prospectId;
  final DateTime scheduledAt;

  const _InspectionView({
    required this.prospectName,
    required this.prospectId,
    required this.scheduledAt,
  });

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<InspectionBloc, InspectionState>(
      listener: (context, state) {
        if (state is InspectionReady && state.lastError != null) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text(state.lastError!)));
        }
      },
      builder: (context, state) {
        return Scaffold(
          appBar: AppBar(
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(prospectName),
                Text(
                  DateFormat('h:mm a · MMM d').format(scheduledAt),
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          body: switch (state) {
            InspectionInitial() ||
            InspectionLoading() =>
              const Center(child: CircularProgressIndicator()),
            InspectionError(:final message, :final isOffline) =>
              _ErrorView(
                message: message,
                isOffline: isOffline,
                onRetry: () {
                  // We can't recreate the load event params from here —
                  // simplest is to pop and reopen. Surface a hint instead.
                },
              ),
            InspectionReady() => _ReadyBody(
                state: state,
                prospectId: prospectId,
                prospectName: prospectName,
              ),
            InspectionSaved() =>
              const Center(child: CircularProgressIndicator()),
          },
        );
      },
    );
  }
}

class _ReadyBody extends StatelessWidget {
  final InspectionReady state;
  final String prospectId;
  final String prospectName;

  const _ReadyBody({
    required this.state,
    required this.prospectId,
    required this.prospectName,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader('Photos (${state.photos.length})'),
            const SizedBox(height: 8),
            PhotoGrid(
              photos: state.photos,
              onAddTap: () => _addPhoto(context),
              onPhotoTap: (p) => _showPhotoSheet(context, p),
              onPhotoLongPress: (p) => _showPhotoSheet(context, p),
              signedUrlFor: (path) async => null, // Online viewing not wired; thumbnails show placeholder
            ),
            const SizedBox(height: 8),
            Text(
              _photoHint(state.photos),
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),

            const SizedBox(height: 24),
            _SectionHeader('Damage report'),
            const SizedBox(height: 8),
            DamageForm(
              initial: state.form,
              onChanged: (next) =>
                  context.read<InspectionBloc>().add(InspectionFormChanged(next)),
            ),

            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: state.canSave && !state.isSaving
                  ? () => _saveAndSign(context)
                  : null,
              icon: state.isSaving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.arrow_forward),
              label: Text(state.isSaving ? 'Saving…' : 'Save & Continue'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _photoHint(List<PhotoEntity> photos) {
    final hasOverview =
        photos.any((p) => p.tags.contains(PhotoTags.overview));
    final hasDamage =
        photos.any((p) => p.tags.contains(PhotoTags.closeUpDamage));
    final tips = <String>[];
    if (photos.length < 3) {
      tips.add('Need at least 3 photos (have ${photos.length})');
    }
    if (!hasOverview) tips.add('Add an Overview photo');
    if (!hasDamage) tips.add('Add a Close-up damage photo');
    if (tips.isEmpty) return 'Photo set looks good.';
    return tips.join(' · ');
  }

  Future<void> _addPhoto(BuildContext context) async {
    final inspectionBloc = context.read<InspectionBloc>();
    final result = await Navigator.of(context).push<PhotoCaptureResult>(
      MaterialPageRoute(builder: (_) => const PhotoCapturePage()),
    );
    if (result == null) return;
    inspectionBloc.add(
      InspectionPhotoAddRequested(
        bytes: result.bytes,
        tags: result.tags,
        widthPx: result.widthPx,
        heightPx: result.heightPx,
        gpsLat: result.gpsLat,
        gpsLng: result.gpsLng,
      ),
    );
  }

  Future<void> _showPhotoSheet(BuildContext context, PhotoEntity p) async {
    final action = await showModalBottomSheet<_PhotoAction>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.label_outline),
              title: const Text('Change tags'),
              onTap: () => Navigator.of(ctx).pop(_PhotoAction.changeTags),
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Delete'),
              onTap: () => Navigator.of(ctx).pop(_PhotoAction.delete),
            ),
          ],
        ),
      ),
    );
    if (action == _PhotoAction.delete && context.mounted) {
      context.read<InspectionBloc>().add(InspectionPhotoDeleted(p.id));
    } else if (action == _PhotoAction.changeTags && context.mounted) {
      var working = p.tags.toSet();
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (ctx) => Padding(
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            16 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: StatefulBuilder(
            builder: (ctx2, setSheet) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Tags',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                PhotoTagSelector(
                  selected: working,
                  onChanged: (next) => setSheet(() => working = next),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: working.isEmpty
                      ? null
                      : () {
                          context.read<InspectionBloc>().add(
                                InspectionPhotoTagsChanged(
                                  p.id,
                                  working.toList(),
                                ),
                              );
                          Navigator.of(ctx2).pop();
                        },
                  child: const Text('Save tags'),
                ),
              ],
            ),
          ),
        ),
      );
    }
  }

  Future<void> _saveAndSign(BuildContext context) async {
    final inspectionBloc = context.read<InspectionBloc>();
    inspectionBloc.add(const InspectionSaveRequested());
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => SignatureCapturePage(
          prospectId: prospectId,
          prospectName: prospectName,
        ),
      ),
    );
    if (result == true && context.mounted) {
      Navigator.of(context).pop(true);
    }
  }
}

enum _PhotoAction { changeTags, delete }

class _SectionHeader extends StatelessWidget {
  final String label;
  const _SectionHeader(this.label);

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final bool isOffline;
  final VoidCallback onRetry;

  const _ErrorView({
    required this.message,
    required this.isOffline,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isOffline ? Icons.cloud_off_outlined : Icons.error_outline,
              size: 48,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.arrow_back),
              label: const Text('Back'),
            ),
          ],
        ),
      ),
    );
  }
}
