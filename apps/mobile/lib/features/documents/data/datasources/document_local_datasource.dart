import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:hive_flutter/hive_flutter.dart';
import 'package:path_provider/path_provider.dart';

import '../../../../core/offline/hive_boxes.dart';

/// Local cache for document PDFs + pending homeowner signatures.
///
/// Two surfaces:
///   - PDF bytes (unsigned + signed) live on disk so the PDF viewer
///     can `open_filex` them while offline. A small Hive row tracks
///     which version we have (`unsigned` / `signed`) per document id.
///   - Signature PNGs captured offline live alongside, keyed by the
///     same document id, until the [embed_signature] sync op drains.
///
/// The Hive box stores a single JSON blob per document id; the
/// PDFs and signature PNGs are referenced by absolute path so the
/// viewer can pass them straight to the OS.
abstract class DocumentLocalDatasource {
  Future<void> init();

  /// Persist an unsigned PDF for [documentId]. Returns the absolute
  /// path so the caller can pass it to `open_filex` immediately.
  Future<String> cacheUnsignedPdf({
    required String documentId,
    required Uint8List bytes,
  });

  /// Persist a signed (embedded) PDF for [documentId].
  Future<String> cacheSignedPdf({
    required String documentId,
    required Uint8List bytes,
  });

  /// Absolute path to the unsigned PDF on disk, or null if not cached.
  Future<String?> unsignedPdfPath(String documentId);

  /// Absolute path to the signed PDF on disk, or null if not cached.
  Future<String?> signedPdfPath(String documentId);

  /// Persist a captured signature PNG that the [embed_signature] sync
  /// op will replay later. The PNG sticks around on disk until the
  /// drain finishes (or [clearPendingSignature] is called).
  Future<PendingSignature> savePendingSignature({
    required String documentId,
    required Uint8List pngBytes,
    required String signerName,
    required String deviceType,
  });

  /// Read the pending signature back for the sync drain. Null if there
  /// isn't one (i.e. the user already signed online, or the drain
  /// already finished).
  Future<PendingSignature?> getPendingSignature(String documentId);

  /// Remove the pending signature PNG + Hive marker after a successful
  /// embed.
  Future<void> clearPendingSignature(String documentId);
}

/// Snapshot of a captured-offline signature waiting to be embedded.
class PendingSignature {
  final String documentId;
  final String pngFilePath;
  final String signerName;
  final String deviceType;
  final DateTime capturedAt;

  const PendingSignature({
    required this.documentId,
    required this.pngFilePath,
    required this.signerName,
    required this.deviceType,
    required this.capturedAt,
  });
}

class DocumentLocalDatasourceImpl implements DocumentLocalDatasource {
  Box<String>? _box;
  Directory? _pdfsDir;
  Directory? _signaturesDir;

  @override
  Future<void> init() async {
    // Reuse the prospect_cache box for documents too — both are
    // small key-value caches and Hive boxes are cheap to share.
    // We namespace keys with `doc:` to keep them isolated.
    _box ??= await Hive.openBox<String>(HiveBoxes.prospectCache);
    if (_pdfsDir == null) {
      final docs = await getApplicationDocumentsDirectory();
      final dir = Directory('${docs.path}/documents');
      if (!await dir.exists()) await dir.create(recursive: true);
      _pdfsDir = dir;
    }
    if (_signaturesDir == null) {
      final docs = await getApplicationDocumentsDirectory();
      final dir = Directory('${docs.path}/signatures');
      if (!await dir.exists()) await dir.create(recursive: true);
      _signaturesDir = dir;
    }
  }

  Future<Box<String>> _opened() async {
    await init();
    return _box!;
  }

  Future<Directory> _pdfsDirectory() async {
    await init();
    return _pdfsDir!;
  }

  Future<Directory> _signaturesDirectory() async {
    await init();
    return _signaturesDir!;
  }

  String _docKey(String documentId) => 'doc:$documentId';

  @override
  Future<String> cacheUnsignedPdf({
    required String documentId,
    required Uint8List bytes,
  }) async {
    final dir = await _pdfsDirectory();
    final file = File('${dir.path}/$documentId.pdf');
    await file.writeAsBytes(bytes, flush: true);
    await _patch(documentId, unsignedPath: file.path);
    return file.path;
  }

  @override
  Future<String> cacheSignedPdf({
    required String documentId,
    required Uint8List bytes,
  }) async {
    final dir = await _pdfsDirectory();
    final file = File('${dir.path}/$documentId-signed.pdf');
    await file.writeAsBytes(bytes, flush: true);
    await _patch(documentId, signedPath: file.path);
    return file.path;
  }

  @override
  Future<String?> unsignedPdfPath(String documentId) async {
    final record = await _readRecord(documentId);
    final path = record?['unsigned_path'] as String?;
    if (path == null) return null;
    if (!await File(path).exists()) return null;
    return path;
  }

  @override
  Future<String?> signedPdfPath(String documentId) async {
    final record = await _readRecord(documentId);
    final path = record?['signed_path'] as String?;
    if (path == null) return null;
    if (!await File(path).exists()) return null;
    return path;
  }

  @override
  Future<PendingSignature> savePendingSignature({
    required String documentId,
    required Uint8List pngBytes,
    required String signerName,
    required String deviceType,
  }) async {
    final dir = await _signaturesDirectory();
    final file = File('${dir.path}/$documentId.png');
    await file.writeAsBytes(pngBytes, flush: true);
    final capturedAt = DateTime.now();
    await _patch(
      documentId,
      pendingSig: {
        'png_path': file.path,
        'signer_name': signerName,
        'device_type': deviceType,
        'captured_at': capturedAt.toIso8601String(),
      },
    );
    return PendingSignature(
      documentId: documentId,
      pngFilePath: file.path,
      signerName: signerName,
      deviceType: deviceType,
      capturedAt: capturedAt,
    );
  }

  @override
  Future<PendingSignature?> getPendingSignature(String documentId) async {
    final record = await _readRecord(documentId);
    final m = record?['pending_sig'] as Map<String, dynamic>?;
    if (m == null) return null;
    final path = m['png_path'] as String?;
    if (path == null || !await File(path).exists()) return null;
    return PendingSignature(
      documentId: documentId,
      pngFilePath: path,
      signerName: m['signer_name'] as String? ?? '',
      deviceType: m['device_type'] as String? ?? 'mobile_other',
      capturedAt: DateTime.parse(m['captured_at'] as String),
    );
  }

  @override
  Future<void> clearPendingSignature(String documentId) async {
    final record = await _readRecord(documentId);
    final m = record?['pending_sig'] as Map<String, dynamic>?;
    if (m != null) {
      final path = m['png_path'] as String?;
      if (path != null) {
        try {
          final f = File(path);
          if (await f.exists()) await f.delete();
        } catch (_) {
          // Best-effort cleanup; the Hive row update is the real signal.
        }
      }
    }
    await _patch(documentId, clearPendingSig: true);
  }

  // ── helpers ───────────────────────────────────────────────

  Future<Map<String, dynamic>?> _readRecord(String documentId) async {
    final box = await _opened();
    final raw = box.get(_docKey(documentId));
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// Read-modify-write a single document's cache row. Use named flags
  /// so callers can patch one field without disturbing the others.
  Future<void> _patch(
    String documentId, {
    String? unsignedPath,
    String? signedPath,
    Map<String, dynamic>? pendingSig,
    bool clearPendingSig = false,
  }) async {
    final box = await _opened();
    final current = await _readRecord(documentId) ?? <String, dynamic>{};
    if (unsignedPath != null) current['unsigned_path'] = unsignedPath;
    if (signedPath != null) current['signed_path'] = signedPath;
    if (pendingSig != null) current['pending_sig'] = pendingSig;
    if (clearPendingSig) current.remove('pending_sig');
    await box.put(_docKey(documentId), jsonEncode(current));
  }
}
