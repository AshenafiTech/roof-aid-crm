import 'dart:io';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Resize + recompress + EXIF-strip a JPEG so the upload stays under
/// 2 MB. EXIF removal is implicit: `decodeImage` strips metadata,
/// re-encoding produces a clean JPEG.
///
/// Returns the processed bytes plus the new dimensions for the
/// `photos.width_px / height_px` columns.
class PhotoProcessor {
  static const int maxEdgePx = 1920;
  static const int maxBytes = 2 * 1024 * 1024; // 2 MB

  const PhotoProcessor();

  Future<ProcessedPhoto> processFile(File source) async {
    final bytes = await source.readAsBytes();
    return processBytes(bytes);
  }

  Future<ProcessedPhoto> processBytes(Uint8List input) async {
    final decoded = img.decodeImage(input);
    if (decoded == null) {
      throw const FormatException('Unable to decode image');
    }

    final resized = _resizeIfLarge(decoded);
    var encoded = Uint8List.fromList(img.encodeJpg(resized, quality: 80));

    // Second pass at lower quality if still over the cap.
    if (encoded.lengthInBytes > maxBytes) {
      encoded = Uint8List.fromList(img.encodeJpg(resized, quality: 65));
    }

    return ProcessedPhoto(
      bytes: encoded,
      width: resized.width,
      height: resized.height,
    );
  }

  img.Image _resizeIfLarge(img.Image src) {
    if (src.width <= maxEdgePx && src.height <= maxEdgePx) {
      return src;
    }
    if (src.width >= src.height) {
      return img.copyResize(src, width: maxEdgePx);
    }
    return img.copyResize(src, height: maxEdgePx);
  }
}

class ProcessedPhoto {
  final Uint8List bytes;
  final int width;
  final int height;

  const ProcessedPhoto({
    required this.bytes,
    required this.width,
    required this.height,
  });

  int get sizeBytes => bytes.lengthInBytes;
}
