import '../../../../core/constants/photo_tags.dart';
import '../../domain/entities/inspection_entity.dart';
import '../../domain/entities/photo_entity.dart';

sealed class InspectionState {
  const InspectionState();
}

class InspectionInitial extends InspectionState {
  const InspectionInitial();
}

class InspectionLoading extends InspectionState {
  const InspectionLoading();
}

class InspectionReady extends InspectionState {
  final InspectionEntity draft;
  final DamageFormData form;
  final List<PhotoEntity> photos;
  final bool isSaving;
  final String? lastError;

  const InspectionReady({
    required this.draft,
    required this.form,
    required this.photos,
    this.isSaving = false,
    this.lastError,
  });

  /// Save & Continue gating rules:
  /// - Form's required fields set (material + at least one affected area + severity)
  /// - At least 3 photos, including one tagged `overview` and one `close_up_damage`
  bool get canSave {
    if (!form.isValid) return false;
    if (photos.length < 3) return false;
    final hasOverview =
        photos.any((p) => p.tags.contains(PhotoTags.overview));
    final hasDamage =
        photos.any((p) => p.tags.contains(PhotoTags.closeUpDamage));
    return hasOverview && hasDamage;
  }

  InspectionReady copyWith({
    InspectionEntity? draft,
    DamageFormData? form,
    List<PhotoEntity>? photos,
    bool? isSaving,
    String? Function()? lastError,
  }) {
    return InspectionReady(
      draft: draft ?? this.draft,
      form: form ?? this.form,
      photos: photos ?? this.photos,
      isSaving: isSaving ?? this.isSaving,
      lastError: lastError != null ? lastError() : this.lastError,
    );
  }
}

class InspectionSaved extends InspectionState {
  final InspectionEntity inspection;
  const InspectionSaved(this.inspection);
}

class InspectionError extends InspectionState {
  final String message;
  final bool isOffline;
  const InspectionError(this.message, {this.isOffline = false});
}
