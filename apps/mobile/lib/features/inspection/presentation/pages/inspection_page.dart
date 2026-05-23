import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/constants/photo_tags.dart';
import '../../domain/entities/photo_entity.dart';
import '../../domain/repositories/inspection_repository.dart';
import '../bloc/inspection_bloc.dart';
import '../bloc/inspection_event.dart';
import '../bloc/inspection_state.dart';
import '../widgets/damage_form.dart';
import '../widgets/photo_grid.dart';
import '../widgets/photo_tag_selector.dart';
import 'document_preview_page.dart';
import 'photo_capture_page.dart';
import 'photo_viewer_page.dart';

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
    // SignatureBloc lives on SignatureCapturePage now — it provides
    // its own so the pushed-route subtree can find it.
    return BlocProvider<InspectionBloc>(
      create: (_) => sl<InspectionBloc>()
        ..add(InspectionLoadRequested(
          appointmentId: appointmentId,
          prospectId: prospectId,
        )),
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
        return SafeArea(
          child: Scaffold(
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
          ),
        );
      },
    );
  }
}

class _ReadyBody extends StatefulWidget {
  final InspectionReady state;
  final String prospectId;
  final String prospectName;

  const _ReadyBody({
    required this.state,
    required this.prospectId,
    required this.prospectName,
  });

  @override
  State<_ReadyBody> createState() => _ReadyBodyState();
}

class _ReadyBodyState extends State<_ReadyBody> {
  // Flips true the first time the user taps Save & Continue with an
  // invalid form. Drives inline errors on the damage form + a tinted
  // photo hint. Stays true until the page is popped on success.
  bool _attemptedSave = false;

  @override
  Widget build(BuildContext context) {
    final state = widget.state;
    final theme = Theme.of(context);
    // Repository lookup is fine here — it's a lazy singleton; we don't
    // need to thread a use case through DI just for a 1-line signed URL.
    final repo = sl<InspectionRepository>();
    Future<String?> signedUrlFor(String path) async {
      final r = await repo.getPhotoSignedUrl(path);
      return r.fold((_) => null, (u) => u);
    }

    final photoIssues = _photoIssues(state.photos);
    final showPhotoErrors = _attemptedSave && photoIssues.isNotEmpty;

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
              // Tap → full-screen viewer.  Long-press → action sheet.
              onPhotoTap: (p) => _openViewer(context, p, signedUrlFor),
              onPhotoLongPress: (p) => _showPhotoSheet(context, p),
              signedUrlFor: signedUrlFor,
            ),
            const SizedBox(height: 8),
            Text(
              _photoHint(state.photos, photoIssues),
              style: theme.textTheme.bodySmall?.copyWith(
                color: showPhotoErrors
                    ? theme.colorScheme.error
                    : theme.colorScheme.onSurfaceVariant,
                fontWeight: showPhotoErrors ? FontWeight.w600 : null,
              ),
            ),

            const SizedBox(height: 24),
            _SectionHeader('Damage report'),
            const SizedBox(height: 8),
            DamageForm(
              initial: state.form,
              showErrors: _attemptedSave,
              onChanged: (next) =>
                  context.read<InspectionBloc>().add(InspectionFormChanged(next)),
            ),

            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed:
                  state.isSaving ? null : () => _onSavePressed(context),
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

  /// Validates on tap. If anything's missing, surfaces inline errors
  /// on the damage form + a snackbar listing the missing pieces.
  /// The button is always tappable (other than while saving) so the
  /// user gets clear feedback instead of a silently-disabled control.
  void _onSavePressed(BuildContext context) {
    final state = widget.state;
    final missing = <String>[];

    if (state.form.roofMaterial == null) missing.add('Roof material');
    if (state.form.affectedAreas.isEmpty) missing.add('Affected areas');
    if (state.form.severity == null) missing.add('Severity');
    missing.addAll(_photoIssues(state.photos));

    if (missing.isEmpty) {
      _saveAndSign(context);
      return;
    }

    setState(() => _attemptedSave = true);

    final summary = missing.length == 1
        ? '${missing.first} is required.'
        : 'Please complete: ${missing.join(', ')}.';
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(summary)));
  }

  List<String> _photoIssues(List<PhotoEntity> photos) {
    final hasOverview =
        photos.any((p) => p.tags.contains(PhotoTags.overview));
    final hasDamage =
        photos.any((p) => p.tags.contains(PhotoTags.closeUpDamage));
    final issues = <String>[];
    if (photos.length < 3) {
      issues.add('At least 3 photos (have ${photos.length})');
    }
    if (!hasOverview) issues.add('An Overview photo');
    if (!hasDamage) issues.add('A Close-up damage photo');
    return issues;
  }

  String _photoHint(List<PhotoEntity> photos, List<String> issues) {
    if (issues.isEmpty) return 'Photo set looks good.';
    return issues.join(' · ');
  }

  Future<void> _openViewer(
    BuildContext context,
    PhotoEntity photo,
    Future<String?> Function(String) signedUrlFor,
  ) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PhotoViewerPage(
          photo: photo,
          signedUrlFor: signedUrlFor,
        ),
      ),
    );
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
    // Route through the preview page — the homeowner reviews the
    // unsigned PDF before the signature pad opens.
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DocumentPreviewPage(
          prospectId: widget.prospectId,
          prospectName: widget.prospectName,
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
