import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../../../core/offline/sync_op.dart';
import '../../../../core/offline/sync_worker.dart';
import '../../domain/entities/document_entity.dart';
import '../../domain/repositories/document_repository.dart';
import '../datasources/document_local_datasource.dart';
import '../datasources/document_remote_datasource.dart';

/// Repository for the documents feature. Offline behavior:
///
/// - **PDF viewing**: [getSignedUrl] returns a `file://` URI when the
///   document is already cached on disk (most common case during a
///   day-in-the-field session). On a cache miss it fetches the signed
///   URL and kicks off a background download so subsequent opens are
///   instant.
/// - **Signature embedding**: [embedSignature] writes the captured PNG
///   to disk + queues an [embed_signature] sync op. The drain handler
///   replays the call against the Edge Function and caches the signed
///   PDF on success.
class DocumentRepositoryImpl implements DocumentRepository {
  final DocumentRemoteDatasource remote;
  final DocumentLocalDatasource local;
  final SyncWorker syncWorker;

  DocumentRepositoryImpl({
    required this.remote,
    required this.local,
    required this.syncWorker,
  }) {
    // Drain handler: replay the captured signature against the Edge
    // Function. On success we cache the signed PDF locally so the
    // preview page can open it offline immediately afterwards.
    syncWorker.registerHandler(
      SyncOpKind.embedSignature,
      (op) async {
        final documentId = op.payload['document_id'] as String;
        final pending = await local.getPendingSignature(documentId);
        if (pending == null) return; // user cleared it, or already drained
        final pngBytes = await File(pending.pngFilePath).readAsBytes();
        final base64Png = base64Encode(pngBytes);
        final signed = await remote.embedSignature(
          documentId: documentId,
          signaturePngBase64: base64Png,
          signerName: pending.signerName,
          deviceType: pending.deviceType,
        );
        // Cache the newly-signed PDF so a follow-up "View signed
        // document" tap can serve from disk.
        final signedPath = signed.signedStoragePath;
        if (signedPath != null) {
          try {
            final bytes = await remote.downloadPdf(signedPath);
            await local.cacheSignedPdf(documentId: documentId, bytes: bytes);
          } catch (_) {
            // Best-effort — the row is updated server-side already.
          }
        }
        await local.clearPendingSignature(documentId);
      },
    );
  }

  @override
  Future<Either<Failure, List<DocumentWithProspect>>> getMyDocuments() async {
    try {
      final list = await remote.fetchMyDocuments();
      return Right(
        list
            .map((r) => DocumentWithProspect(
                  document: r.document,
                  prospectName: r.prospectName,
                ))
            .toList(growable: false),
      );
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, List<DocumentEntity>>> getForProspect(
    String prospectId,
  ) async {
    try {
      final list = await remote.fetchForProspect(prospectId);
      // Cache the metadata list so an offline reopen of this prospect
      // can still resolve the signable / signed document buckets
      // without a server round-trip.
      await local.cacheDocList(prospectId, list);
      // Fire-and-forget background pre-cache of unsigned + signed PDFs
      // for this prospect's docs. The rufero who pulls up a prospect
      // in the morning with signal will have everything on disk for
      // an offline afternoon.
      unawaited(_warmCacheForList(list));
      return Right(list);
    } on NetworkException catch (_) {
      // Offline — fall back to the cached metadata list. Empty if the
      // rufero has never loaded this prospect online, in which case
      // the caller will show "Document not generated".
      final cached = await local.getCachedDocList(prospectId);
      return Right(cached);
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, DocumentEntity>> generatePdf({
    required String prospectId,
    required String templateKind,
    Map<String, dynamic>? fields,
  }) async {
    try {
      final d = await remote.generatePdf(
        prospectId: prospectId,
        templateKind: templateKind,
        fields: fields,
      );
      return Right(d);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, DocumentEntity>> embedSignature({
    required String documentId,
    required String signaturePngBase64,
    required String signerName,
    required String deviceType,
  }) async {
    // Persist the signature locally up front so a drain attempt (now
    // or hours from now after reconnect) has a stable source.
    final pngBytes = base64Decode(signaturePngBase64);
    await local.savePendingSignature(
      documentId: documentId,
      pngBytes: pngBytes,
      signerName: signerName,
      deviceType: deviceType,
    );

    try {
      final d = await remote.embedSignature(
        documentId: documentId,
        signaturePngBase64: signaturePngBase64,
        signerName: signerName,
        deviceType: deviceType,
      );
      // Cache the freshly-signed PDF for offline review.
      final signedPath = d.signedStoragePath;
      if (signedPath != null) {
        try {
          final bytes = await remote.downloadPdf(signedPath);
          await local.cacheSignedPdf(documentId: documentId, bytes: bytes);
        } catch (_) {
          // Cache miss is fine — the row is correct server-side.
        }
      }
      await local.clearPendingSignature(documentId);
      return Right(d);
    } on NetworkException catch (_) {
      // Offline — leave the PNG in place, queue the embed.
      await syncWorker.enqueue(
        kind: SyncOpKind.embedSignature,
        payload: {'document_id': documentId},
        dedupKey: documentId,
      );
      // Return a synthetic doc with status flipped so the UI shows
      // "signed locally · syncing" without a hard refresh. The next
      // fetch (or drain) will overwrite it with the real server row.
      return Right(_pendingSignatureSurrogate(documentId));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<Either<Failure, String>> getSignedUrl(String storagePath) async {
    // Hit local cache by absolute storage path. We track caches per
    // document id, so we can only short-circuit when the caller
    // looks up by a known cached path. Try documentId match by
    // scanning the path — server paths look like
    // `{tenant}/{prospect}/{doc}.pdf` or `{tenant}/{doc}-signed.pdf`.
    // The simpler and safer way: let callers pass documentId through
    // dedicated APIs (see [openLocalUnsigned]/[openLocalSigned]).
    // Here we just go through to the server.
    try {
      final url = await remote.getSignedUrl(storagePath);
      return Right(url);
    } on NetworkException catch (e) {
      return Left(NetworkFailure(e.message));
    } on ServerException catch (e) {
      return Left(ServerFailure(e.message));
    }
  }

  @override
  Future<String?> localUnsignedPdfPath(String documentId) =>
      local.unsignedPdfPath(documentId);

  @override
  Future<String?> localSignedPdfPath(String documentId) =>
      local.signedPdfPath(documentId);

  @override
  Future<bool> hasPendingSignature(String documentId) async {
    final pending = await local.getPendingSignature(documentId);
    return pending != null;
  }

  @override
  Future<String?> ensureLocalPdfPath({
    required String documentId,
    required String storagePath,
    required bool signed,
    DateTime? serverUpdatedAt,
  }) async {
    final cached = signed
        ? await local.signedPdfPath(documentId)
        : await local.unsignedPdfPath(documentId);
    final cachedAt = signed
        ? await local.signedCachedAt(documentId)
        : await local.unsignedCachedAt(documentId);

    // 1. Cache hit AND fresh — the common path. "Fresh" means we
    //    cached it at or after the server's updated_at. Two cases
    //    where the cache is considered stale:
    //      (a) Server's updated_at is newer than our cached_at.
    //          Covers the two-party-sign scenario where the same
    //          signed_storage_path holds the company-only PDF first
    //          and the fully-signed PDF after the homeowner signs.
    //      (b) cached_at is null. This happens for PDFs cached by
    //          an older app version that didn't track the timestamp
    //          — we have no proof the file matches the server, so
    //          re-fetch to be safe (one-time cost per legacy file).
    final isStale = serverUpdatedAt != null &&
        (cachedAt == null || serverUpdatedAt.isAfter(cachedAt));
    if (cached != null && !isStale) return cached;

    // 2. Cache miss or stale — fetch on demand. Covers:
    //      - Missing cache (warm-up hasn't run, or drain swallowed the
    //        downloadPdf step).
    //      - Stale cache (homeowner just signed; bytes changed even
    //        though signed_storage_path didn't).
    try {
      final bytes = await remote.downloadPdf(storagePath);
      final path = signed
          ? await local.cacheSignedPdf(documentId: documentId, bytes: bytes)
          : await local.cacheUnsignedPdf(
              documentId: documentId, bytes: bytes);
      return path;
    } on NetworkException catch (_) {
      // Stale-but-online-fetch-failed → at least return the stale
      // copy so the user can see *something*. The next online open
      // will retry.
      return cached;
    } on ServerException catch (_) {
      return cached;
    }
  }

  // ── helpers ───────────────────────────────────────────────

  /// Background pre-cache. Errors are swallowed — this is a "nice to
  /// have"; the real read path falls back to the server. Re-downloads
  /// when the cache is missing OR stale (cached before the server's
  /// last update — important for the two-party signing case).
  Future<void> _warmCacheForList(List<DocumentEntity> docs) async {
    for (final d in docs) {
      try {
        final unsignedPath = d.storagePath;
        if (unsignedPath != null &&
            await _shouldRefresh(d.id, d.updatedAt, signed: false)) {
          final bytes = await remote.downloadPdf(unsignedPath);
          await local.cacheUnsignedPdf(documentId: d.id, bytes: bytes);
        }
        final signedPath = d.signedStoragePath;
        if (signedPath != null &&
            await _shouldRefresh(d.id, d.updatedAt, signed: true)) {
          final bytes = await remote.downloadPdf(signedPath);
          await local.cacheSignedPdf(documentId: d.id, bytes: bytes);
        }
      } catch (_) {
        // Network blip, RLS deny, malformed path — skip and move on.
      }
    }
  }

  /// True when the local cache is missing OR older than the server's
  /// last update. Mirrors the staleness rule in [ensureLocalPdfPath]
  /// so the warm-up and the on-demand paths agree on what "fresh"
  /// means.
  Future<bool> _shouldRefresh(
    String documentId,
    DateTime serverUpdatedAt, {
    required bool signed,
  }) async {
    final path = signed
        ? await local.signedPdfPath(documentId)
        : await local.unsignedPdfPath(documentId);
    if (path == null) return true;
    final cachedAt = signed
        ? await local.signedCachedAt(documentId)
        : await local.unsignedCachedAt(documentId);
    if (cachedAt == null) return true;
    return serverUpdatedAt.isAfter(cachedAt);
  }

  /// Synthetic [DocumentEntity] returned to the UI after an offline
  /// signature capture. status='signed' so the existing flow shows
  /// "Already signed" affordances; signed/unsigned paths are left
  /// null so the preview falls back to the local cache.
  DocumentEntity _pendingSignatureSurrogate(String documentId) {
    final now = DateTime.now();
    return DocumentEntity(
      id: documentId,
      tenantId: '',
      prospectId: '',
      type: 'unknown',
      status: 'signed',
      createdAt: now,
      updatedAt: now,
    );
  }
}
