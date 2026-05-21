import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/di/injection_container.dart';
import '../../../../documents/domain/entities/document_entity.dart';
import '../../../../documents/domain/usecases/get_prospect_documents.dart';
import '../../../../inspection/presentation/pages/document_preview_page.dart';
import '../../../domain/entities/prospect_entity.dart';
import '../empty_state.dart';

/// "Documents" tab on the prospect detail page.
///
/// Lists every document this prospect has (any type — authorization,
/// contract, supplement, manual upload). RLS already filters by
/// tenant; a rufero sees the prospect's docs if they can see the
/// prospect (which after migration 029 includes prospects they have
/// an appointment for).
///
/// Tap any card → opens [DocumentPreviewPage] pinned to that exact
/// doc id, which handles signed / signable / not-generated states
/// uniformly. Signable docs route through the sign flow, signed ones
/// go straight to the "Already signed" view + "View signed document"
/// affordance.
class DocumentsTab extends StatefulWidget {
  final ProspectEntity prospect;

  const DocumentsTab({super.key, required this.prospect});

  @override
  State<DocumentsTab> createState() => _DocumentsTabState();
}

class _DocumentsTabState extends State<DocumentsTab> {
  late Future<List<DocumentEntity>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<DocumentEntity>> _load() async {
    final useCase = sl<GetProspectDocuments>();
    final result = await useCase(widget.prospect.id);
    return result.fold(
      (failure) => throw _LoadError(failure.message),
      (list) => list,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future.catchError((_) => <DocumentEntity>[]);
  }

  Future<void> _open(DocumentEntity doc) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DocumentPreviewPage(
          prospectId: widget.prospect.id,
          prospectName: widget.prospect.name,
          documentId: doc.id,
        ),
      ),
    );
    if (mounted) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<DocumentEntity>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          final msg = snap.error is _LoadError
              ? (snap.error as _LoadError).message
              : snap.error.toString();
          return _ErrorView(message: msg, onRetry: _refresh);
        }
        final docs = snap.data ?? const <DocumentEntity>[];
        return RefreshIndicator(
          onRefresh: _refresh,
          child: _Body(documents: docs, onOpen: _open),
        );
      },
    );
  }
}

class _Body extends StatelessWidget {
  final List<DocumentEntity> documents;
  final ValueChanged<DocumentEntity> onOpen;

  const _Body({required this.documents, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    if (documents.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 48),
          EmptyState(
            icon: Icons.description_outlined,
            title: 'No documents yet',
            description:
                'Once the office generates a document for this prospect, '
                'it will show up here.',
          ),
        ],
      );
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: documents.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (_, i) => _DocumentCard(
        document: documents[i],
        onTap: () => onOpen(documents[i]),
      ),
    );
  }
}

class _DocumentCard extends StatelessWidget {
  final DocumentEntity document;
  final VoidCallback onTap;

  const _DocumentCard({required this.document, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final status = _statusMeta(document.status, cs);

    return Card(
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: cs.outlineVariant),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 4,
                height: 56,
                decoration: BoxDecoration(
                  color: status.color,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _typeLabel(document.type),
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        _StatusChip(meta: status),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      DateFormat.yMMMMd()
                          .add_jm()
                          .format(document.createdAt),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: cs.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right,
                size: 22,
                color: cs.onSurfaceVariant.withValues(alpha: 0.5),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _typeLabel(String type) {
    switch (type) {
      case '3rd_party_auth':
        return '3rd Party Authorization';
      case 'acv_contract':
        return 'ACV Contract';
      case 'rcv_contract':
        return 'RCV Contract';
      case 'supplement':
        return 'Supplement Document';
      case 'upload':
        return 'Uploaded Document';
      default:
        return type;
    }
  }

  _StatusMeta _statusMeta(String status, ColorScheme cs) {
    switch (status) {
      case 'signed':
        return _StatusMeta('Signed', cs.primary);
      case 'awaiting_homeowner_signature':
        return _StatusMeta('Homeowner pending', cs.tertiary);
      case 'sent':
        return _StatusMeta('Sent', cs.secondary);
      case 'generated':
        return _StatusMeta('Ready to sign', cs.tertiary);
      case 'failed':
        return _StatusMeta('Failed', cs.error);
      case 'uploaded':
        return _StatusMeta('Uploaded', cs.outline);
      default:
        return _StatusMeta(status, cs.outline);
    }
  }
}

class _StatusMeta {
  final String label;
  final Color color;
  const _StatusMeta(this.label, this.color);
}

class _StatusChip extends StatelessWidget {
  final _StatusMeta meta;
  const _StatusChip({required this.meta});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: meta.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: meta.color.withValues(alpha: 0.35)),
      ),
      child: Text(
        meta.label,
        style: TextStyle(
          color: meta.color,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 64),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: theme.colorScheme.error,
          ),
          const SizedBox(height: 16),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

class _LoadError implements Exception {
  final String message;
  _LoadError(this.message);
  @override
  String toString() => message;
}
