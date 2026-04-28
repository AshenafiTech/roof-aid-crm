import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/constants/prospect_status.dart';
import '../../../../core/widgets/glass_surface.dart';
import '../../domain/entities/prospect_entity.dart';
import '../bloc/prospects_bloc.dart';
import '../bloc/prospects_event.dart';
import '../bloc/prospects_state.dart';

/// Map-mode view of assigned prospects. Consumes the same ProspectsBloc
/// as the list view — a single fetch backs both surfaces.
class ProspectsMapView extends StatefulWidget {
  const ProspectsMapView({super.key});

  @override
  State<ProspectsMapView> createState() => _ProspectsMapViewState();
}

class _ProspectsMapViewState extends State<ProspectsMapView> {
  GoogleMapController? _controller;
  String? _lastFitSignature;

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ProspectsBloc, ProspectsState>(
      builder: (context, state) {
        return switch (state) {
          ProspectsInitial() || ProspectsLoading() => const Center(
            child: CircularProgressIndicator(),
          ),
          ProspectsError(:final message) => _ErrorView(message: message),
          ProspectsLoaded(:final prospects) => _buildMap(prospects),
        };
      },
    );
  }

  Widget _buildMap(List<ProspectEntity> prospects) {
    final geolocated = prospects
        .where((p) => p.hasCoordinates)
        .toList(growable: false);

    if (geolocated.isEmpty) {
      return const _EmptyMapView();
    }

    final markers = geolocated.map((p) {
      return Marker(
        markerId: MarkerId(p.id),
        position: LatLng(p.latitude!, p.longitude!),
        icon: BitmapDescriptor.defaultMarkerWithHue(_markerHue(p.status)),
        infoWindow: InfoWindow(
          title: p.name,
          snippet: p.displayAddress.isNotEmpty ? p.displayAddress : null,
          onTap: () => context.push('/prospects/${p.id}', extra: p),
        ),
      );
    }).toSet();

    _scheduleFit(geolocated);

    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(
            target: LatLng(
              geolocated.first.latitude!,
              geolocated.first.longitude!,
            ),
            zoom: 11,
          ),
          markers: markers,
          myLocationEnabled: false,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          compassEnabled: true,
          mapToolbarEnabled: false,
          onMapCreated: (c) {
            _controller = c;
            _fitBounds(geolocated);
          },
        ),
        Positioned(
          top: 12,
          right: 12,
          child: _CountChip(count: geolocated.length, total: prospects.length),
        ),
      ],
    );
  }

  void _scheduleFit(List<ProspectEntity> prospects) {
    // Only re-fit bounds when the set of prospect ids actually changes.
    final sig = (prospects.map((p) => p.id).toList()..sort()).join(',');
    if (sig == _lastFitSignature) return;
    _lastFitSignature = sig;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _fitBounds(prospects);
    });
  }

  void _fitBounds(List<ProspectEntity> prospects) {
    final controller = _controller;
    if (controller == null || prospects.isEmpty) return;

    if (prospects.length == 1) {
      final only = prospects.single;
      controller.animateCamera(
        CameraUpdate.newCameraPosition(
          CameraPosition(
            target: LatLng(only.latitude!, only.longitude!),
            zoom: 14,
          ),
        ),
      );
      return;
    }

    final lats = prospects.map((p) => p.latitude!);
    final lngs = prospects.map((p) => p.longitude!);
    final bounds = LatLngBounds(
      southwest: LatLng(
        lats.reduce((a, b) => a < b ? a : b),
        lngs.reduce((a, b) => a < b ? a : b),
      ),
      northeast: LatLng(
        lats.reduce((a, b) => a > b ? a : b),
        lngs.reduce((a, b) => a > b ? a : b),
      ),
    );
    controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 64));
  }

  double _markerHue(String status) {
    // Hues follow the web bar-color palette as closely as Google Maps'
    // limited hue range allows (blue → sky → emerald → gray).
    switch (status) {
      case ProspectStatus.newLeads:
        return BitmapDescriptor.hueAzure;
      case ProspectStatus.prospects:
        return BitmapDescriptor.hueBlue;
      case ProspectStatus.contacted:
        return BitmapDescriptor.hueCyan;
      case ProspectStatus.scheduled:
        return BitmapDescriptor.hueOrange;
      case ProspectStatus.closedCustomer:
        return BitmapDescriptor.hueGreen;
      case ProspectStatus.notViable:
        return BitmapDescriptor.hueRose;
      default:
        return BitmapDescriptor.hueRed;
    }
  }
}

class _CountChip extends StatelessWidget {
  final int count;
  final int total;

  const _CountChip({required this.count, required this.total});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final showTotal = count != total;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: GlassSurface(
        borderRadius: BorderRadius.circular(24),
        tintOpacity: 0.78,
        blurSigma: 20,
        border: Border.all(color: Colors.white.withValues(alpha: 0.5)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.place_outlined,
                size: 14,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 6),
              Text(
                showTotal ? '$count of $total mapped' : '$count prospects',
                style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.onSurface,
                  letterSpacing: 0.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyMapView extends StatelessWidget {
  const _EmptyMapView();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.location_off_outlined,
                size: 48,
                color: theme.colorScheme.primary.withValues(alpha: 0.5),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'No locations to display',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              "Your assigned prospects don't have coordinates yet. "
              'Once HailTrace data is imported, pins will appear here.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;

  const _ErrorView({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.error.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.error_outline,
                size: 40,
                color: theme.colorScheme.error,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Could not load map',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
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
              onPressed: () => context.read<ProspectsBloc>().add(
                const ProspectsLoadRequested(),
              ),
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
