import 'dart:io';

import 'package:flutter/material.dart';

/// Picks [Image.file] or [Image.network] based on the URL prefix.
///
/// Used wherever the source path might come from either Supabase
/// Storage (https://…/sign/…) or the local app documents directory
/// (file:///…) — the offline pipeline stores captured photos on disk
/// before they're uploaded and surfaces them via `file://` URIs.
///
/// Mirrors `Image.network`'s loading + error builders so the caller
/// doesn't have to fork their UI.
class NetworkOrFileImage extends StatelessWidget {
  final String url;
  final BoxFit fit;
  final WidgetBuilder? loadingBuilder;
  final WidgetBuilder? errorBuilder;

  const NetworkOrFileImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.loadingBuilder,
    this.errorBuilder,
  });

  @override
  Widget build(BuildContext context) {
    if (url.startsWith('file://')) {
      final path = url.substring('file://'.length);
      return Image.file(
        File(path),
        fit: fit,
        errorBuilder: (context, _, _) =>
            errorBuilder?.call(context) ?? const _DefaultError(),
      );
    }
    return Image.network(
      url,
      fit: fit,
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return loadingBuilder?.call(context) ?? const _DefaultLoading();
      },
      errorBuilder: (context, _, _) =>
          errorBuilder?.call(context) ?? const _DefaultError(),
    );
  }
}

class _DefaultLoading extends StatelessWidget {
  const _DefaultLoading();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: SizedBox(
        width: 18,
        height: 18,
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    );
  }
}

class _DefaultError extends StatelessWidget {
  const _DefaultError();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Icon(
        Icons.broken_image_outlined,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    );
  }
}
