import 'package:flutter/material.dart';

import '../../../../core/constants/photo_tags.dart';
import '../../../../core/widgets/network_or_file_image.dart';
import '../../domain/entities/photo_entity.dart';

class PhotoGrid extends StatelessWidget {
  final List<PhotoEntity> photos;
  final VoidCallback onAddTap;
  final ValueChanged<PhotoEntity>? onPhotoTap;
  final ValueChanged<PhotoEntity>? onPhotoLongPress;

  /// Resolves a Storage `storage_path` to a 1-hour signed display URL.
  /// Injected so this widget doesn't reach into Supabase directly.
  final Future<String?> Function(String storagePath) signedUrlFor;

  const PhotoGrid({
    super.key,
    required this.photos,
    required this.onAddTap,
    required this.signedUrlFor,
    this.onPhotoTap,
    this.onPhotoLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width >= 600;
    final crossAxisCount = isWide ? 4 : 3;

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: photos.length + 1,
      itemBuilder: (context, i) {
        if (i == photos.length) {
          return _AddTile(onTap: onAddTap);
        }
        return _PhotoTile(
          photo: photos[i],
          signedUrlFor: signedUrlFor,
          onTap: onPhotoTap == null ? null : () => onPhotoTap!(photos[i]),
          onLongPress: onPhotoLongPress == null
              ? null
              : () => onPhotoLongPress!(photos[i]),
        );
      },
    );
  }
}

class _PhotoTile extends StatelessWidget {
  final PhotoEntity photo;
  final Future<String?> Function(String storagePath) signedUrlFor;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  const _PhotoTile({
    required this.photo,
    required this.signedUrlFor,
    this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Material(
        color: theme.colorScheme.surfaceContainerHighest,
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          child: Stack(
            fit: StackFit.expand,
            children: [
              FutureBuilder<String?>(
                future: signedUrlFor(photo.storagePath),
                builder: (context, snap) {
                  final url = snap.data;
                  if (snap.connectionState != ConnectionState.done) {
                    return const Center(
                      child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    );
                  }
                  if (url == null) {
                    return Center(
                      child: Icon(
                        Icons.broken_image_outlined,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    );
                  }
                  return NetworkOrFileImage(url: url, fit: BoxFit.cover);
                },
              ),
              if (photo.primaryTag != null)
                Positioned(
                  left: 4,
                  right: 4,
                  bottom: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      PhotoTags.label(photo.primaryTag!),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              if (photo.isPending)
                const Positioned(
                  top: 6,
                  right: 6,
                  child: Icon(Icons.cloud_upload_outlined,
                      size: 16, color: Colors.amber),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddTile extends StatelessWidget {
  final VoidCallback onTap;
  const _AddTile({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: DottedBorderBox(
        color: theme.colorScheme.primary,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.add_a_photo_outlined,
                color: theme.colorScheme.primary,
                size: 28,
              ),
              const SizedBox(height: 4),
              Text(
                'Add photo',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Lightweight dotted border without an extra package — uses a custom
/// `CustomPaint` so the "Add photo" tile reads as actionable.
class DottedBorderBox extends StatelessWidget {
  final Color color;
  final Widget child;
  const DottedBorderBox({super.key, required this.color, required this.child});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedBorderPainter(color),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: child,
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  final Color color;
  _DashedBorderPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.55)
      ..strokeWidth = 1.4
      ..style = PaintingStyle.stroke;
    final rect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(10),
    );
    final path = Path()..addRRect(rect);

    const dash = 6.0;
    const gap = 4.0;
    final metrics = path.computeMetrics();
    for (final m in metrics) {
      var distance = 0.0;
      while (distance < m.length) {
        final next = (distance + dash).clamp(0.0, m.length);
        canvas.drawPath(m.extractPath(distance, next), paint);
        distance = next + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter old) =>
      old.color != color;
}
