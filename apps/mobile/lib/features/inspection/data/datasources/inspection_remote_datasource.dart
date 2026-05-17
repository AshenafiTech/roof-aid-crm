import 'dart:async';
import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/network/network_error_detection.dart';
import '../../domain/entities/inspection_entity.dart';
import '../models/inspection_model.dart';
import '../models/photo_model.dart';

/// Raw shape returned by the `start_ad_hoc_inspection` RPC.
class AdHocInspectionResult {
  final String appointmentId;
  final String inspectionId;
  const AdHocInspectionResult({
    required this.appointmentId,
    required this.inspectionId,
  });
}

abstract class InspectionRemoteDatasource {
  Future<InspectionModel> getOrCreateForAppointment({
    required String appointmentId,
    required String prospectId,
  });

  /// Calls `start_ad_hoc_inspection(prospect_id)` RPC. Returns the
  /// freshly-created appointment + inspection ids.
  Future<AdHocInspectionResult> startAdHocInspection({
    required String prospectId,
  });

  Future<InspectionModel> saveDamageForm({
    required String inspectionId,
    required DamageFormData form,
  });

  Future<InspectionModel> markComplete(String inspectionId);

  Future<List<PhotoModel>> fetchPhotos(String inspectionId);

  Stream<List<PhotoModel>> watchPhotos(String inspectionId);

  Future<PhotoModel> uploadPhoto({
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? gpsLat,
    double? gpsLng,
    int? widthPx,
    int? heightPx,
  });

  Future<void> deletePhoto(String photoId);

  Future<PhotoModel> updatePhotoTags({
    required String photoId,
    required List<String> tags,
  });

  Future<String> getPhotoSignedUrl(String storagePath);

  Future<List<InspectionModel>> fetchForProspect(String prospectId);
}

class InspectionRemoteDatasourceImpl implements InspectionRemoteDatasource {
  final SupabaseClient client;
  final Uuid _uuid;

  InspectionRemoteDatasourceImpl(this.client, {Uuid? uuid})
      : _uuid = uuid ?? const Uuid();

  String _requireUid() {
    final uid = client.auth.currentUser?.id;
    if (uid == null) throw ServerException('Not authenticated');
    return uid;
  }

  Future<String> _tenantId(String uid) async {
    final me = await client
        .from('users')
        .select('tenant_id')
        .eq('id', uid)
        .single();
    return me['tenant_id'] as String;
  }

  @override
  Future<AdHocInspectionResult> startAdHocInspection({
    required String prospectId,
  }) async {
    _requireUid();
    try {
      final response = await client.rpc(
        'start_ad_hoc_inspection',
        params: {'p_prospect_id': prospectId},
      );

      if (response is! Map<String, dynamic>) {
        throw ServerException('Unexpected response from server.');
      }
      if (response['ok'] != true) {
        final err = response['error'];
        final code = err is Map ? err['code']?.toString() : null;
        final message = err is Map
            ? (err['message']?.toString() ?? 'Could not start inspection.')
            : 'Could not start inspection.';
        throw ServerException(
          code != null ? '$code: $message' : message,
        );
      }
      return AdHocInspectionResult(
        appointmentId: response['appointment_id'] as String,
        inspectionId: response['inspection_id'] as String,
      );
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to start inspection: $e');
    }
  }

  @override
  Future<InspectionModel> getOrCreateForAppointment({
    required String appointmentId,
    required String prospectId,
  }) async {
    final uid = _requireUid();
    try {
      final existing = await client
          .from('inspection_reports')
          .select()
          .eq('appointment_id', appointmentId)
          .maybeSingle();

      if (existing != null) {
        return InspectionModel.fromMap(existing);
      }

      final tenantId = await _tenantId(uid);
      final response = await client
          .from('inspection_reports')
          .insert({
            'tenant_id': tenantId,
            'prospect_id': prospectId,
            'appointment_id': appointmentId,
            'rufero_id': uid,
            'affected_areas': <String>[],
            'photo_count_expected': 0,
          })
          .select()
          .single();
      return InspectionModel.fromMap(response);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to start inspection: $e');
    }
  }

  @override
  Future<InspectionModel> saveDamageForm({
    required String inspectionId,
    required DamageFormData form,
  }) async {
    _requireUid();
    try {
      final response = await client
          .from('inspection_reports')
          .update({
            'roof_age_years': form.roofAgeYears,
            'roof_material': form.roofMaterial,
            'storm_date': form.stormDate?.toIso8601String().substring(0, 10),
            'affected_areas': form.affectedAreas,
            'severity': form.severity,
            'scope_notes': form.notes,
          })
          .eq('id', inspectionId)
          .select()
          .single();
      return InspectionModel.fromMap(response);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to save inspection: $e');
    }
  }

  @override
  Future<InspectionModel> markComplete(String inspectionId) async {
    _requireUid();
    try {
      final response = await client
          .from('inspection_reports')
          .update({'completed_at': DateTime.now().toUtc().toIso8601String()})
          .eq('id', inspectionId)
          .select()
          .single();
      return InspectionModel.fromMap(response);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to complete inspection: $e');
    }
  }

  @override
  Future<List<PhotoModel>> fetchPhotos(String inspectionId) async {
    _requireUid();
    try {
      final response = await client
          .from('photos')
          .select()
          .eq('inspection_id', inspectionId)
          .order('taken_at', ascending: true);
      return (response as List)
          .map((r) => PhotoModel.fromMap(r as Map<String, dynamic>))
          .toList(growable: false);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to load photos: $e');
    }
  }

  @override
  Stream<List<PhotoModel>> watchPhotos(String inspectionId) {
    final uid = client.auth.currentUser?.id;
    if (uid == null) return Stream.value(const []);

    final controller = StreamController<List<PhotoModel>>();

    Future<void> refetch() async {
      try {
        final list = await fetchPhotos(inspectionId);
        if (!controller.isClosed) controller.add(list);
      } catch (e) {
        if (!controller.isClosed) controller.addError(e);
      }
    }

    refetch();

    final channel = client
        .channel('photos_${inspectionId.substring(0, 8)}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'photos',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'inspection_id',
            value: inspectionId,
          ),
          callback: (_) => refetch(),
        )
        .subscribe();

    controller.onCancel = () => client.removeChannel(channel);
    return controller.stream;
  }

  @override
  Future<PhotoModel> uploadPhoto({
    required String inspectionId,
    required String prospectId,
    required Uint8List bytes,
    required List<String> tags,
    double? gpsLat,
    double? gpsLng,
    int? widthPx,
    int? heightPx,
  }) async {
    final uid = _requireUid();
    try {
      final tenantId = await _tenantId(uid);
      final photoId = _uuid.v4();
      final storagePath =
          '$tenantId/inspections/$inspectionId/$photoId.jpg';

      // 1. Storage upload first — if it fails, no row pollutes the DB.
      await client.storage.from('inspection-photos').uploadBinary(
            storagePath,
            bytes,
            fileOptions: const FileOptions(
              contentType: 'image/jpeg',
              upsert: false,
            ),
          );

      // 2. Row insert (uploaded_at set right away — storage upload
      //    already succeeded above).
      final now = DateTime.now().toUtc().toIso8601String();
      final response = await client
          .from('photos')
          .insert({
            'id': photoId,
            'tenant_id': tenantId,
            'inspection_id': inspectionId,
            'prospect_id': prospectId,
            'storage_path': storagePath,
            'tags': tags,
            'gps_lat': gpsLat,
            'gps_lng': gpsLng,
            'taken_at': now,
            'uploaded_at': now,
            'width_px': widthPx,
            'height_px': heightPx,
            'file_size_bytes': bytes.lengthInBytes,
            'created_by': uid,
          })
          .select()
          .single();

      return PhotoModel.fromMap(response);
    } on ServerException {
      rethrow;
    } on StorageException catch (e) {
      throw ServerException('Upload failed: ${e.message}');
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to upload photo: $e');
    }
  }

  @override
  Future<void> deletePhoto(String photoId) async {
    _requireUid();
    try {
      // Read the storage path so we can remove the binary as well.
      final existing = await client
          .from('photos')
          .select('storage_path')
          .eq('id', photoId)
          .maybeSingle();
      final storagePath = existing?['storage_path'] as String?;

      await client.from('photos').delete().eq('id', photoId);

      if (storagePath != null) {
        try {
          await client.storage
              .from('inspection-photos')
              .remove([storagePath]);
        } catch (_) {
          // Orphan file is recoverable; row delete is the primary action.
        }
      }
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to delete photo: $e');
    }
  }

  @override
  Future<List<InspectionModel>> fetchForProspect(String prospectId) async {
    _requireUid();
    try {
      final response = await client
          .from('inspection_reports')
          .select()
          .eq('prospect_id', prospectId)
          .order('created_at', ascending: false);
      return (response as List)
          .map((r) => InspectionModel.fromMap(r as Map<String, dynamic>))
          .toList(growable: false);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to load inspections: $e');
    }
  }

  @override
  Future<String> getPhotoSignedUrl(String storagePath) async {
    _requireUid();
    try {
      final url = await client.storage
          .from('inspection-photos')
          .createSignedUrl(storagePath, 60 * 60);
      return url;
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is StorageException) throw ServerException(e.message);
      throw ServerException('Failed to get photo link: $e');
    }
  }

  @override
  Future<PhotoModel> updatePhotoTags({
    required String photoId,
    required List<String> tags,
  }) async {
    _requireUid();
    try {
      final response = await client
          .from('photos')
          .update({'tags': tags})
          .eq('id', photoId)
          .select()
          .single();
      return PhotoModel.fromMap(response);
    } on ServerException {
      rethrow;
    } catch (e) {
      if (isNetworkError(e)) throw NetworkException(offlineMessage);
      if (e is PostgrestException) throw ServerException(e.message);
      throw ServerException('Failed to update tags: $e');
    }
  }
}
