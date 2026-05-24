import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/di/injection_container.dart';
import '../../../documents/domain/entities/document_entity.dart';
import '../../../documents/domain/repositories/document_repository.dart';
import '../../../documents/domain/usecases/get_prospect_documents.dart';
import 'signature_capture_page.dart';

/// Document review step.
///
/// **Mobile is a viewer, not a generator** — documents are created by
/// the office on the web. This page fetches the latest unsigned
/// document of the requested template kind for this prospect and
/// shows it for the homeowner to review before signing. If no
/// unsigned document of that kind exists yet, the rufero sees a
/// "Document not generated" message and cannot proceed to the
/// signature pad until the office generates one.
class DocumentPreviewPage extends StatefulWidget {
  final String prospectId;
  final String prospectName;
  /// Must match `documents.type` values written by `generate-pdf` on
  /// the web. The four canonical kinds are:
  ///   - '3rd_party_auth'  (default — the on-site Authorization)
  ///   - 'acv_contract'
  ///   - 'rcv_contract'
  ///   - 'supplement'
  ///
  /// Ignored when [documentId] is supplied — we then open exactly
  /// that doc regardless of its type.
  final String templateKind;

  /// When set, the page opens *this specific* document instead of
  /// "the latest of this kind for this prospect". Used when the user
  /// taps a card on the Documents tab / list.
  final String? documentId;

  const DocumentPreviewPage({
    super.key,
    required this.prospectId,
    required this.prospectName,
    this.templateKind = '3rd_party_auth',
    this.documentId,
  });

  @override
  State<DocumentPreviewPage> createState() => _DocumentPreviewPageState();
}

/// Three possible outcomes of looking up the latest document of the
/// requested template kind for this prospect:
///   - `signable`: an unsigned PDF the homeowner can review + sign
///   - `latestSigned`: nothing signable, but there IS a signed copy
///     (e.g. the office signed it on the web, or a previous rufero
///     visit signed it already). Show "already signed" state.
///   - both null: no document of this kind exists yet — the office
///     hasn't generated one.
class _DocumentLookup {
  final DocumentEntity? signable;
  final DocumentEntity? latestSigned;

  /// True when a signature was captured locally for this document but
  /// the embed call hasn't drained yet. Drives a "Signature captured ·
  /// syncing when online" indicator in the UI.
  final bool pendingSignature;

  const _DocumentLookup({
    this.signable,
    this.latestSigned,
    this.pendingSignature = false,
  });
  bool get isEmpty => signable == null && latestSigned == null;
}

class _DocumentPreviewPageState extends State<DocumentPreviewPage> {
  late Future<_DocumentLookup> _docFuture;
  bool _reviewed = false;
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    _docFuture = _fetchLookup();
  }

  /// Statuses where the homeowner can still add their signature on
  /// mobile. `awaiting_homeowner_signature` is the explicit "company
  /// already signed, homeowner pending" state (migration 030).
  /// `generated` / `sent` cover the no-company-sig-yet path (mobile
  /// homeowner sign + later web embed) and the office-emailed path.
  static const _signableStatuses = {
    'generated',
    'sent',
    'awaiting_homeowner_signature',
  };

  Future<_DocumentLookup> _fetchLookup() async {
    final useCase = sl<GetProspectDocuments>();
    final repo = sl<DocumentRepository>();
    final result = await useCase(widget.prospectId);

    return await result.fold(
      (failure) async {
        // Offline fallback: if the user just signed locally, surface
        // a synthetic "already signed" view so we don't dump them on
        // a red error screen seconds after they handed the pen back
        // to the homeowner.
        final pinId = widget.documentId;
        if (pinId != null && await repo.hasPendingSignature(pinId)) {
          return _DocumentLookup(
            latestSigned: _localOnlyDoc(pinId),
            pendingSignature: true,
          );
        }
        throw _PreviewError(failure.message);
      },
      (docs) async {
        // Specific-doc mode (tap-from-list): find that exact id,
        // ignore template kind, and place it in the right bucket
        // based on its own status. If the id isn't in the list at
        // all (RLS hid it, or stale tap), fall back to empty so the
        // page shows "Document not generated".
        final pinId = widget.documentId;
        if (pinId != null) {
          final pending = await repo.hasPendingSignature(pinId);
          for (final d in docs) {
            if (d.id != pinId) continue;
            if (d.status == 'signed' || pending) {
              return _DocumentLookup(
                latestSigned: d,
                pendingSignature: pending,
              );
            }
            if (_signableStatuses.contains(d.status) &&
                d.storagePath != null) {
              return _DocumentLookup(signable: d);
            }
            return const _DocumentLookup();
          }
          // Doc not in server list but a local sig exists — still
          // surface a synthetic "already signed".
          if (pending) {
            return _DocumentLookup(
              latestSigned: _localOnlyDoc(pinId),
              pendingSignature: true,
            );
          }
          return const _DocumentLookup();
        }

        // Default mode: walk newest-first, find the latest signable
        // + latest signed of the requested template kind in one pass.
        //
        // Don't infer "signed" from `signedStoragePath != null`: a
        // partially-signed doc (company done, homeowner pending) also
        // has a signed_storage_path — pointing to the company-only
        // copy. Trust `status` as the source of truth.
        DocumentEntity? signable;
        DocumentEntity? latestSigned;
        for (final d in docs) {
          if (d.type != widget.templateKind) continue;
          if (d.status == 'signed') {
            latestSigned ??= d;
          } else if (_signableStatuses.contains(d.status) &&
              d.storagePath != null) {
            signable ??= d;
          }
          if (signable != null && latestSigned != null) break;
        }
        final docIdForCheck = latestSigned?.id ?? signable?.id;
        final pending = docIdForCheck != null
            ? await repo.hasPendingSignature(docIdForCheck)
            : false;
        return _DocumentLookup(
          signable: signable,
          latestSigned: latestSigned,
          pendingSignature: pending,
        );
      },
    );
  }

  /// Synthetic placeholder for the rare "user signed offline AND we
  /// couldn't fetch the server list" case. Status is forced to 'signed'
  /// so the existing _AlreadySignedBody renders; the actual local PDF
  /// (if cached) and the pending-signature badge come from elsewhere.
  DocumentEntity _localOnlyDoc(String id) {
    final now = DateTime.now();
    return DocumentEntity(
      id: id,
      tenantId: '',
      prospectId: widget.prospectId,
      type: widget.templateKind,
      status: 'signed',
      createdAt: now,
      updatedAt: now,
    );
  }

  Future<void> _retry() async {
    setState(() {
      _docFuture = _fetchLookup();
      _reviewed = false;
    });
  }

  String _templateTitle(String kind) {
    switch (kind) {
      // Web canonical names (must match generate-pdf TEMPLATE_TITLES).
      case '3rd_party_auth':
        return '3rd Party Authorization';
      case 'acv_contract':
        return 'ACV Contract';
      case 'rcv_contract':
        return 'RCV Contract';
      case 'supplement':
        return 'Supplement Document';
      // Legacy / aliases tolerated for safety — older mobile code
      // before the rename used 'authorization'.
      case 'authorization':
        return '3rd Party Authorization';
      default:
        return kind;
    }
  }

  Future<void> _openPdf(DocumentEntity doc) async {
    // Prefer the signed copy when it exists — that's what the rufero
    // wants to view in the "already signed" state. Fall back to the
    // unsigned PDF for the review-before-signing flow.
    final remotePath = doc.signedStoragePath ?? doc.storagePath;
    setState(() => _opening = true);
    try {
      final repo = sl<DocumentRepository>();

      // 1. Try the local cache first; fetch + cache on demand if it
      //    isn't there yet. Covers two paths:
      //      - Offline: returns cached path, opens straight from disk.
      //      - Online + sign just drained: the drain's PDF download
      //        may have failed silently — this gives the cache a
      //        second chance to fill so the viewer sees the embedded
      //        signature instead of the older unsigned copy.
      //    open_filex hands the file to the system PDF viewer through
      //    Android's FileProvider, so the user gets the native viewer
      //    they're used to.
      if (remotePath != null) {
        final localPath = await repo.ensureLocalPdfPath(
          documentId: doc.id,
          storagePath: remotePath,
          signed: doc.signedStoragePath != null,
          // doc.updatedAt is the server's row timestamp. ensureLocal
          // re-fetches whenever this is newer than our cached_at —
          // the only reliable way to spot the two-party-sign case
          // where the same storage path holds different bytes.
          serverUpdatedAt: doc.updatedAt,
        );
        if (localPath != null) {
          final result =
              await OpenFilex.open(localPath, type: 'application/pdf');
          if (!mounted) return;
          if (result.type == ResultType.done) return;
          // Fall through to the remote path if the OS couldn't open
          // it (e.g. no PDF app installed). The snackbar below
          // explains.
        }
      }

      // 2. No cache — fetch the signed URL from the server and hand
      //    the URL to the system browser / PDF app.
      if (remotePath == null) return;
      final result = await repo.getSignedUrl(remotePath);
      if (!mounted) return;
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
          if (!ok && mounted) {
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

  Future<void> _continue(DocumentEntity doc) async {
    final signed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => SignatureCapturePage(
          prospectId: widget.prospectId,
          prospectName: widget.prospectName,
          documentId: doc.id,
        ),
      ),
    );
    if (!mounted) return;

    // Sign succeeded → re-fetch so the page flips to the
    // "Already signed" state automatically. The Continue button
    // disappears (it only renders in _ReadyBody, not _AlreadySignedBody).
    if (signed == true) {
      setState(() {
        _docFuture = _fetchLookup();
        _reviewed = false;
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: const Row(
              children: [
                Icon(Icons.check_circle, color: Colors.white),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Document signed and saved.',
                  ),
                ),
              ],
            ),
            backgroundColor: Theme.of(context).colorScheme.primary,
            duration: const Duration(seconds: 4),
            behavior: SnackBarBehavior.floating,
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review document')),
      body: FutureBuilder<_DocumentLookup>(
        future: _docFuture,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            final msg = snap.error is _PreviewError
                ? (snap.error as _PreviewError).message
                : snap.error.toString();
            return _ErrorBody(message: msg, onRetry: _retry);
          }
          final lookup = snap.data ?? const _DocumentLookup();
          if (lookup.isEmpty) {
            return _NotGeneratedBody(
              templateTitle: _templateTitle(widget.templateKind),
              onRetry: _retry,
            );
          }
          // Signable doc takes priority — that's what the rufero
          // actually needs to do on-site. If there's only a signed
          // copy, show the "already signed" state instead.
          if (lookup.signable != null) {
            final doc = lookup.signable!;
            return _ReadyBody(
              document: doc,
              templateTitle: _templateTitle(widget.templateKind),
              prospectName: widget.prospectName,
              reviewed: _reviewed,
              opening: _opening,
              onReviewedChanged: (v) => setState(() => _reviewed = v),
              onOpen: () => _openPdf(doc),
              onContinue: () => _continue(doc),
            );
          }
          return _AlreadySignedBody(
            document: lookup.latestSigned!,
            templateTitle: _templateTitle(widget.templateKind),
            opening: _opening,
            pendingSignature: lookup.pendingSignature,
            onOpen: () => _openPdf(lookup.latestSigned!),
            onRetry: _retry,
          );
        },
      ),
    );
  }
}

// ── Ready state ───────────────────────────────────────────────────

class _ReadyBody extends StatelessWidget {
  final DocumentEntity document;
  final String templateTitle;
  final String prospectName;
  final bool reviewed;
  final bool opening;
  final ValueChanged<bool> onReviewedChanged;
  final VoidCallback onOpen;
  final VoidCallback onContinue;

  const _ReadyBody({
    required this.document,
    required this.templateTitle,
    required this.prospectName,
    required this.reviewed,
    required this.opening,
    required this.onReviewedChanged,
    required this.onOpen,
    required this.onContinue,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Expanded(
          child: SafeArea(
            bottom: false,
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
                    templateTitle,
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
                          _MetaRow(label: 'Homeowner', value: prospectName),
                          const SizedBox(height: 8),
                          _MetaRow(
                            label: 'Generated',
                            value: DateFormat.yMMMMd()
                                .add_jm()
                                .format(document.createdAt),
                          ),
                          const SizedBox(height: 8),
                          _MetaRow(
                            label: 'Status',
                            value: document.status ==
                                    'awaiting_homeowner_signature'
                                ? 'Company signed · homeowner pending'
                                : 'Ready to review',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.tonalIcon(
                    onPressed: opening ? null : onOpen,
                    icon: opening
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child:
                                CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.open_in_new),
                    label: Text(opening ? 'Opening…' : 'Open document'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "Opens in your device's PDF viewer.",
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 24),
                  CheckboxListTile(
                    value: reviewed,
                    onChanged: (v) => onReviewedChanged(v ?? false),
                    title: const Text(
                      "I've reviewed this document with the homeowner.",
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ),
            ),
          ),
        ),
        SafeArea(
          minimum: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: FilledButton.icon(
            onPressed: reviewed ? onContinue : null,
            icon: const Icon(Icons.draw_outlined),
            label: const Text('Continue to sign'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(54),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Already-signed state ─────────────────────────────────────────

class _AlreadySignedBody extends StatelessWidget {
  final DocumentEntity document;
  final String templateTitle;
  final bool opening;
  final bool pendingSignature;
  final VoidCallback onOpen;
  final VoidCallback onRetry;

  const _AlreadySignedBody({
    required this.document,
    required this.templateTitle,
    required this.opening,
    required this.onOpen,
    required this.onRetry,
    this.pendingSignature = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final signedOn =
        DateFormat.yMMMMd().add_jm().format(document.updatedAt);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              pendingSignature ? Icons.sync_outlined : Icons.verified_outlined,
              size: 72,
              color: pendingSignature
                  ? theme.colorScheme.tertiary
                  : theme.colorScheme.primary,
            ),
            const SizedBox(height: 20),
            Text(
              pendingSignature
                  ? 'Signature captured'
                  : 'Document already signed',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              pendingSignature
                  ? "The homeowner's signature has been saved on this "
                      "device and will be applied to the document the "
                      "next time you have a connection. You can hand "
                      "the phone back — they're done."
                  : 'A $templateTitle was signed on $signedOn. '
                      "If you need a new copy signed, ask the office to "
                      "generate a fresh document and tap Retry.",
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 28),
            FilledButton.tonalIcon(
              onPressed: opening ? null : onOpen,
              icon: opening
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.open_in_new),
              label: Text(opening ? 'Opening…' : 'View signed document'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Check again'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
              ),
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Back'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Not-generated state ──────────────────────────────────────────

class _NotGeneratedBody extends StatelessWidget {
  final String templateTitle;
  final VoidCallback onRetry;

  const _NotGeneratedBody({
    required this.templateTitle,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.description_outlined,
              size: 72,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 20),
            Text(
              'Document not generated yet',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'There is no $templateTitle ready for this prospect. '
              'Ask the office to generate it on the web dashboard, '
              "then come back and tap Retry.",
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 28),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Back'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Generic load-failure state ───────────────────────────────────

class _ErrorBody extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorBody({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 64),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 56, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(
              'Could not load document',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
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

class _PreviewError implements Exception {
  final String message;
  _PreviewError(this.message);
  @override
  String toString() => message;
}
