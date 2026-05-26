import 'package:flutter/material.dart';

import '../../../../core/constants/photo_tags.dart';
import '../../../../core/widgets/network_or_file_image.dart';
import '../../domain/entities/photo_entity.dart';

/// Full-screen, pinch-to-zoom viewer for a single inspection photo.
///
/// Resolves the storage path to a fresh 1-hour signed URL on open via
/// the [signedUrlFor] resolver injected by the caller (keeps this page
/// free of Supabase / repository imports).
class PhotoViewerPage extends StatefulWidget {
  final PhotoEntity photo;
  final Future<String?> Function(String storagePath) signedUrlFor;

  const PhotoViewerPage({
    super.key,
    required this.photo,
    required this.signedUrlFor,
  });

  @override
  State<PhotoViewerPage> createState() => _PhotoViewerPageState();
}

class _PhotoViewerPageState extends State<PhotoViewerPage> {
  late Future<String?> _urlFuture;

  @override
  void initState() {
    super.initState();
    _urlFuture = widget.signedUrlFor(widget.photo.storagePath);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.photo;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          p.tags.map(PhotoTags.label).join(' · '),
          style: const TextStyle(fontSize: 16),
        ),
      ),
      body: FutureBuilder<String?>(
        future: _urlFuture,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(
              child: CircularProgressIndicator(color: Colors.white),
            );
          }
          final url = snap.data;
          if (url == null) {
            return const Center(
              child: Text(
                'Could not load photo.',
                style: TextStyle(color: Colors.white),
              ),
            );
          }
          return InteractiveViewer(
            minScale: 1.0,
            maxScale: 5.0,
            child: Center(
              child: NetworkOrFileImage(
                url: url,
                fit: BoxFit.contain,
              ),
            ),
          );
        },
      ),
    );
  }
}
