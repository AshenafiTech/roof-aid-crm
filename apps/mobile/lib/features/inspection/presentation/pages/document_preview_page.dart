import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/di/injection_container.dart';
import '../../../documents/domain/entities/document_entity.dart';
import '../../../documents/domain/repositories/document_repository.dart';
import '../../../documents/presentation/bloc/signature_bloc.dart';
import '../../../documents/presentation/bloc/signature_event.dart';
import '../../../documents/presentation/bloc/signature_state.dart';
import 'signature_capture_page.dart';

/// Step between the inspection page and the signature pad — the rufero
/// hands the phone to the homeowner so they can read the document
/// before signing. We pre-generate the unsigned PDF here and surface
/// an "Open document" affordance + a checkbox the homeowner ticks to
/// affirm they've reviewed it. Only then is the Continue button
/// enabled, which pushes the signature pad with the existing
/// `documentId` so we don't double-generate.
class DocumentPreviewPage extends StatelessWidget {
  final String prospectId;
  final String prospectName;
  final String templateKind;

  const DocumentPreviewPage({
    super.key,
    required this.prospectId,
    required this.prospectName,
    this.templateKind = 'authorization',
  });

  @override
  Widget build(BuildContext context) {
    return BlocProvider<SignatureBloc>(
      create: (_) => sl<SignatureBloc>()
        ..add(SignatureGenerateRequested(
          prospectId: prospectId,
          templateKind: templateKind,
        )),
      child: _DocumentPreviewView(
        prospectId: prospectId,
        prospectName: prospectName,
        templateKind: templateKind,
      ),
    );
  }
}

class _DocumentPreviewView extends StatefulWidget {
  final String prospectId;
  final String prospectName;
  final String templateKind;

  const _DocumentPreviewView({
    required this.prospectId,
    required this.prospectName,
    required this.templateKind,
  });

  @override
  State<_DocumentPreviewView> createState() => _DocumentPreviewViewState();
}

class _DocumentPreviewViewState extends State<_DocumentPreviewView> {
  bool _reviewed = false;
  bool _opening = false;

  String _templateTitle(String kind) {
    switch (kind) {
      case 'authorization':
        return '3rd Party Authorization';
      case 'acv_contract':
        return 'ACV Contract';
      case 'rcv_contract':
        return 'RCV Contract';
      default:
        return kind;
    }
  }

  Future<void> _openPdf(BuildContext context, DocumentEntity doc) async {
    if (doc.storagePath == null) return;
    setState(() => _opening = true);
    try {
      final repo = sl<DocumentRepository>();
      final result = await repo.getSignedUrl(doc.storagePath!);
      if (!context.mounted) return;
      await result.fold(
        (failure) async {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(failure.message)),
          );
        },
        (url) async {
          final uri = Uri.parse(url);
          final ok = await launchUrl(
            uri,
            mode: LaunchMode.externalApplication,
          );
          if (!ok && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('No PDF viewer available on this device.'),
              ),
            );
          }
        },
      );
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  void _continue(BuildContext context, DocumentEntity doc) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SignatureCapturePage(
          prospectId: widget.prospectId,
          prospectName: widget.prospectName,
          documentId: doc.id,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return BlocBuilder<SignatureBloc, SignatureState>(
      builder: (context, state) {
        final unsigned = state is SignatureGenerated ? state.unsignedDocument : null;
        final isGenerating = state is SignatureGenerating;
        final failed = state is SignatureFailed ? state : null;

        return Scaffold(
          appBar: AppBar(
            title: const Text('Review document'),
          ),
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(
                    Icons.description_outlined,
                    size: 64,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _templateTitle(widget.templateKind),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Have the homeowner read the document before signing.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),

                  const SizedBox(height: 24),
                  Card(
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: theme.colorScheme.outlineVariant,
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _MetaRow(
                            label: 'Homeowner',
                            value: widget.prospectName,
                          ),
                          const SizedBox(height: 8),
                          _MetaRow(
                            label: 'Date',
                            value: DateFormat.yMMMMd().format(DateTime.now()),
                          ),
                          const SizedBox(height: 8),
                          _MetaRow(
                            label: 'Status',
                            value: isGenerating
                                ? 'Generating…'
                                : failed != null
                                    ? 'Failed'
                                    : 'Ready to review',
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),
                  FilledButton.tonalIcon(
                    onPressed: unsigned == null || _opening
                        ? null
                        : () => _openPdf(context, unsigned),
                    icon: _opening
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child:
                                CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.open_in_new),
                    label: Text(_opening ? 'Opening…' : 'Open document'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Opens in your device\'s PDF viewer.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),

                  if (failed != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.errorContainer
                            .withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        failed.message,
                        style: TextStyle(color: theme.colorScheme.error),
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => context.read<SignatureBloc>().add(
                            SignatureGenerateRequested(
                              prospectId: widget.prospectId,
                              templateKind: widget.templateKind,
                            ),
                          ),
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry'),
                    ),
                  ],

                  const SizedBox(height: 28),
                  CheckboxListTile(
                    value: _reviewed,
                    onChanged: unsigned == null
                        ? null
                        : (v) => setState(() => _reviewed = v ?? false),
                    title: const Text(
                      'I\'ve reviewed this document with the homeowner.',
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ),
            ),
          ),
          bottomNavigationBar: SafeArea(
            minimum: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Material(
              color: Colors.transparent,
              child: FilledButton.icon(
                onPressed: unsigned != null && _reviewed
                    ? () => _continue(context, unsigned)
                    : null,
                icon: const Icon(Icons.draw_outlined),
                label: const Text('Continue to sign'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(54),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _MetaRow extends StatelessWidget {
  final String label;
  final String value;
  const _MetaRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 96,
          child: Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}
