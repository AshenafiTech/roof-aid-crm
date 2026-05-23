import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import '../../data/datasources/photo_processor.dart';
import '../widgets/photo_tag_selector.dart';

/// Result handed back from `Navigator.pop` after a successful capture.
class PhotoCaptureResult {
  final Uint8List bytes;
  final List<String> tags;
  final int widthPx;
  final int heightPx;
  final double? gpsLat;
  final double? gpsLng;

  const PhotoCaptureResult({
    required this.bytes,
    required this.tags,
    required this.widthPx,
    required this.heightPx,
    this.gpsLat,
    this.gpsLng,
  });
}

class PhotoCapturePage extends StatefulWidget {
  const PhotoCapturePage({super.key});

  @override
  State<PhotoCapturePage> createState() => _PhotoCapturePageState();
}

class _PhotoCapturePageState extends State<PhotoCapturePage> {
  final ImagePicker _picker = ImagePicker();
  final PhotoProcessor _processor = const PhotoProcessor();

  XFile? _captured;
  ProcessedPhoto? _processed;
  Set<String> _tags = {};
  bool _processing = false;
  String? _error;
  double? _gpsLat;
  double? _gpsLng;

  @override
  void initState() {
    super.initState();
    // Fire the camera as soon as we're rendered. Saves a tap.
    WidgetsBinding.instance.addPostFrameCallback((_) => _openCamera());
    _resolveGps();
  }

  Future<void> _resolveGps() async {
    try {
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        final result = await Geolocator.requestPermission();
        if (result == LocationPermission.denied ||
            result == LocationPermission.deniedForever) {
          return;
        }
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (!mounted) return;
      setState(() {
        _gpsLat = pos.latitude;
        _gpsLng = pos.longitude;
      });
    } catch (_) {
      // GPS is best-effort.
    }
  }

  Future<void> _openCamera() async {
    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 92,
      maxWidth: 3000,
    );
    if (picked == null) {
      if (mounted) Navigator.of(context).pop();
      return;
    }
    if (!mounted) return;
    setState(() {
      _captured = picked;
      _processing = true;
      _error = null;
    });
    try {
      final processed = await _processor.processFile(File(picked.path));
      if (!mounted) return;
      setState(() {
        _processed = processed;
        _processing = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _processing = false;
        _error = 'Could not process photo: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final processed = _processed;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tag photo'),
        actions: [
          TextButton(
            onPressed: _openCamera,
            child: const Text('Retake'),
          ),
        ],
      ),
      // Move the Save button into a pinned bottomNavigationBar so it
      // can't get covered by the system nav bar, and SafeArea-bottom
      // ensures it sits above gesture insets too.
      body: _captured == null
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AspectRatio(
                    aspectRatio: 4 / 3,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.file(File(_captured!.path), fit: BoxFit.cover),
                          if (_processing)
                            Container(
                              color: Colors.black.withValues(alpha: 0.4),
                              child: const Center(
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (processed != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      '${processed.width} × ${processed.height} · ${_formatSize(processed.sizeBytes)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  Text(
                    'Tags',
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Pick at least one.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  PhotoTagSelector(
                    selected: _tags,
                    onChanged: (next) => setState(() => _tags = next),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      style: TextStyle(color: theme.colorScheme.error),
                    ),
                  ],
                ],
              ),
            ),
      bottomNavigationBar: _captured == null
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Material(
                color: Colors.transparent,
                child: FilledButton.icon(
                  onPressed: processed == null || _tags.isEmpty ? null : _onSave,
                  icon: const Icon(Icons.check),
                  label: const Text('Save photo'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                ),
              ),
            ),
    );
  }

  void _onSave() {
    final processed = _processed;
    if (processed == null) return;
    Navigator.of(context).pop(
      PhotoCaptureResult(
        bytes: processed.bytes,
        tags: _tags.toList(),
        widthPx: processed.width,
        heightPx: processed.height,
        gpsLat: _gpsLat,
        gpsLng: _gpsLng,
      ),
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(0)} KB';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
