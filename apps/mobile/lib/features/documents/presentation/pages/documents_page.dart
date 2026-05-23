import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/di/injection_container.dart';
import '../../../inspection/presentation/pages/document_preview_page.dart';
import '../../domain/entities/document_entity.dart';
import '../../domain/usecases/get_my_documents.dart';

/// Bottom-nav "Documents" screen.
///
/// Cross-prospect view of every document the caller can see (RLS
/// gates per role + the prospects visibility rule from migration
/// 029). Bucketed into two sections so the rufero immediately sees
/// what needs their attention vs what's already done:
///
///   - Needs signature: statuses `awaiting_homeowner_signature`,
///     `generated`, `sent` — anything the rufero can sign on-site.
///   - All documents: everything else (signed / failed / uploaded
///     copies for reference).
///
/// Tap any card → opens [DocumentPreviewPage] pinned to that doc id.
class DocumentsPage extends StatefulWidget {
  const DocumentsPage({super.key});

  @override
  State<DocumentsPage> createState() => DocumentsPageState();
}

class DocumentsPageState extends State<DocumentsPage> {
  static const _needsSignatureStatuses = {
    'awaiting_homeowner_signature',
    'generated',
    'sent',
  };

  late Future<List<DocumentWithProspect>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<DocumentWithProspect>> _load() async {
    final useCase = sl<GetMyDocuments>();
    final result = await useCase();
    return result.fold(
      (failure) => throw _LoadError(failure.message),
      (list) => list,
    );
  }

  Future<void> refresh() async {
    setState(() => _future = _load());
    await _future.catchError((_) => <DocumentWithProspect>[]);
  }

  Future<void> _open(DocumentWithProspect row) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DocumentPreviewPage(
          prospectId: row.document.prospectId,
          prospectName: row.prospectName,
          documentId: row.document.id,
        ),
      ),
    );
    if (mounted) refresh();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<DocumentWithProspect>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          final msg = snap.error is _LoadError
              ? (snap.error as _LoadError).message
              : snap.error.toString();
          return _ErrorView(message: msg, onRetry: refresh);
        }
        final rows = snap.data ?? const <DocumentWithProspect>[];

        final needsSig = rows
            .where((r) => _needsSignatureStatuses.contains(r.document.status))
            .toList();
        final everythingElse = rows
            .where((r) => !_needsSignatureStatuses.contains(r.document.status))
            .toList();

        return RefreshIndicator(
          onRefresh: refresh,
          child: rows.isEmpty
              ? _emptyState(context)
              : ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  children: [
                    if (needsSig.isNotEmpty) ...[
                      _SectionLabel(
                        'Needs signature · ${needsSig.length}',
                      ),
                      for (final r in needsSig)
                        _DocumentCard(row: r, onTap: () => _open(r)),
                      const SizedBox(height: 16),
                    ],
                    if (everythingElse.isNotEmpty) ...[
                      _SectionLabel(
                        'All documents · ${everythingElse.length}',
                      ),
                      for (final r in everythingElse)
                        _DocumentCard(row: r, onTap: () => _open(r)),
                    ],
                  ],
                ),
        );
      },
    );
  }

  Widget _emptyState(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 96),
      children: [
        Icon(
          Icons.description_outlined,
          size: 64,
          color: theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(height: 16),
        Text(
          'No documents yet',
          textAlign: TextAlign.center,
          style: theme.textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        Text(
          'When the office generates a contract or authorization for one '
          "of your prospects, it will appear here.",
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 8, 0, 8),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 1.0,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
      ),
    );
  }
}

class _DocumentCard extends StatelessWidget {
  final DocumentWithProspect row;
  final VoidCallback onTap;

  const _DocumentCard({required this.row, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final status = _statusMeta(row.document.status, cs);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
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
                  height: 64,
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
                              row.prospectName,
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          _StatusChip(meta: status),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _typeLabel(row.document.type),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        DateFormat.yMMMMd()
                            .add_jm()
                            .format(row.document.createdAt),
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
