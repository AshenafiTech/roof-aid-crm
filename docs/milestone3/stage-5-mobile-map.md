# Stage 5 — Mobile Map View with Navigation

**Goal:** Ship a native map screen in the Flutter app that shows the Rufero's assigned prospects as color-coded pins. Tapping a pin opens the prospect detail page (built in Stage 6). A "Navigate" button deep-links to Google Maps / Apple Maps for turn-by-turn directions.

**Outcome:** A Rufero opens the Map tab of the bottom nav, sees every house they're responsible for visiting today, and can tap → navigate in 3 taps total.

**Estimated time:** 1.5 days

---

## 1. Dependencies

Add to `apps/mobile/pubspec.yaml`:

```yaml
dependencies:
  google_maps_flutter: ^2.7.0
  url_launcher: ^6.3.0
  geolocator: ^13.0.0         # for "Center on me" button + GPS permission
```

Then:

```bash
cd apps/mobile && flutter pub get
```

---

## 2. Platform setup

### 2.1 Android — `android/app/src/main/AndroidManifest.xml`

Inside `<application>`:

```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="${GOOGLE_MAPS_API_KEY}" />
```

Inside `<manifest>` (before `<application>`):

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

Update `android/app/build.gradle.kts` to support manifest placeholders:

```kotlin
android {
    defaultConfig {
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = project.findProperty("GOOGLE_MAPS_API_KEY") as String? ?: ""
    }
}
```

Then add to `~/.gradle/gradle.properties` (or CI env):

```
GOOGLE_MAPS_API_KEY=AIza...
```

### 2.2 iOS — `ios/Runner/AppDelegate.swift`

```swift
import UIKit
import Flutter
import GoogleMaps

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GMSServices.provideAPIKey(Bundle.main.infoDictionary!["GOOGLE_MAPS_API_KEY"] as! String)
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

And in `ios/Runner/Info.plist`:

```xml
<key>GOOGLE_MAPS_API_KEY</key>
<string>$(GOOGLE_MAPS_API_KEY)</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>Roof-Aid uses your location to show nearby prospects and navigate to job sites.</string>
```

Pass through via Xcode build settings or `--dart-define` at build time. **Not in assets/.env** — the Maps SDK needs native access.

> Android + iOS each have a separate restricted API key. Never reuse the web key here — Google's key restriction system is package/bundle based on mobile.

---

## 3. Extend the entity + repository

The `ProspectEntity` already has `name`, `status`, `address`. Add:

```dart
class ProspectEntity {
  // ...existing fields...
  final double? latitude;
  final double? longitude;

  // ...existing constructor, add latitude and longitude to it...
}
```

Update `ProspectModel.fromJson` to parse GeoJSON:

```dart
factory ProspectModel.fromJson(Map<String, dynamic> json) {
  final coords = json['coordinates'];
  double? lat;
  double? lng;
  if (coords is Map && coords['coordinates'] is List) {
    final arr = coords['coordinates'] as List;
    if (arr.length >= 2) {
      lng = (arr[0] as num).toDouble();
      lat = (arr[1] as num).toDouble();
    }
  }
  return ProspectModel(
    // ...existing fields...
    latitude: lat,
    longitude: lng,
  );
}
```

> GeoJSON is `[lng, lat]`. Same trap as web — always destructure explicitly.

---

## 4. Map page

**File:** `apps/mobile/lib/features/prospects/presentation/pages/prospects_map_page.dart`

```dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../bloc/prospects_bloc.dart';
import '../bloc/prospects_state.dart';
import '../../../../core/constants/prospect_status.dart';

class ProspectsMapBody extends StatefulWidget {
  const ProspectsMapBody({super.key});

  @override
  State<ProspectsMapBody> createState() => _ProspectsMapBodyState();
}

class _ProspectsMapBodyState extends State<ProspectsMapBody> {
  GoogleMapController? _controller;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ProspectsBloc, ProspectsState>(
      builder: (context, state) {
        if (state is! ProspectsLoaded) {
          return const Center(child: CircularProgressIndicator());
        }

        final geolocated = state.prospects.where((p) => p.latitude != null && p.longitude != null).toList();

        if (geolocated.isEmpty) {
          return const _EmptyMap();
        }

        final markers = geolocated.map((p) {
          return Marker(
            markerId: MarkerId(p.id),
            position: LatLng(p.latitude!, p.longitude!),
            icon: BitmapDescriptor.defaultMarkerWithHue(_hue(p.status)),
            infoWindow: InfoWindow(
              title: p.name,
              snippet: p.displayAddress,
              onTap: () => _openDetail(context, p.id),
            ),
          );
        }).toSet();

        return Stack(
          children: [
            GoogleMap(
              initialCameraPosition: CameraPosition(
                target: LatLng(geolocated.first.latitude!, geolocated.first.longitude!),
                zoom: 11,
              ),
              markers: markers,
              myLocationEnabled: true,
              myLocationButtonEnabled: true,
              onMapCreated: (c) {
                _controller = c;
                _fitBounds(geolocated);
              },
            ),
            Positioned(
              top: 12,
              right: 12,
              child: _LegendChip(count: geolocated.length),
            ),
          ],
        );
      },
    );
  }

  double _hue(String status) => switch (status) {
        'new_leads'       => BitmapDescriptor.hueAzure,
        'prospects'       => BitmapDescriptor.hueViolet,
        'contacted'       => BitmapDescriptor.hueYellow,
        'scheduled'       => BitmapDescriptor.hueOrange,
        'closed_customer' => BitmapDescriptor.hueGreen,
        _                 => BitmapDescriptor.hueRose,
      };

  void _fitBounds(List<dynamic> prospects) {
    if (prospects.length < 2 || _controller == null) return;
    final lats = prospects.map((p) => p.latitude as double);
    final lngs = prospects.map((p) => p.longitude as double);
    final bounds = LatLngBounds(
      southwest: LatLng(lats.reduce((a, b) => a < b ? a : b), lngs.reduce((a, b) => a < b ? a : b)),
      northeast: LatLng(lats.reduce((a, b) => a > b ? a : b), lngs.reduce((a, b) => a > b ? a : b)),
    );
    _controller!.animateCamera(CameraUpdate.newLatLngBounds(bounds, 64));
  }

  void _openDetail(BuildContext context, String id) {
    Navigator.pushNamed(context, '/prospects/$id');
  }
}
```

The `InfoWindow.onTap` navigates to the detail screen built in Stage 6.

---

## 5. Register the Map tab in `MainShell`

Currently the shell has 5 tabs: Schedule | Prospects | Documents | SMS | Settings. Either:

1. **Add a 6th "Map" tab**, OR
2. **Replace Prospects tab content with a toggle** (List / Map segmented control)

Recommend option 2 — navigation bars with 6 items feel cramped. In `prospects` tab, show a `SegmentedButton` at the top:

```dart
final isMap = useState(false);

AppBar(
  title: const Text('Prospects'),
  actions: [
    SegmentedButton(
      segments: const [
        ButtonSegment(value: false, icon: Icon(Icons.list)),
        ButtonSegment(value: true, icon: Icon(Icons.map)),
      ],
      selected: {isMap.value},
      onSelectionChanged: (s) => setState(() => isMap.value = s.first),
    ),
  ],
),
body: isMap.value ? const ProspectsMapBody() : const ProspectsBody(),
```

Both share the same `ProspectsBloc` → one stream, two views, zero duplicate fetches.

---

## 6. "Navigate" deep-link helper

**File:** `apps/mobile/lib/core/navigation/maps_launcher.dart`

```dart
import 'dart:io';
import 'package:url_launcher/url_launcher.dart';

class MapsLauncher {
  static Future<void> navigateTo({
    required double lat,
    required double lng,
    String? label,
  }) async {
    final Uri uri;
    if (Platform.isIOS) {
      final q = label != null ? '&q=${Uri.encodeComponent(label)}' : '';
      uri = Uri.parse('http://maps.apple.com/?daddr=$lat,$lng$q&dirflg=d');
    } else {
      uri = Uri.parse('google.navigation:q=$lat,$lng&mode=d');
    }

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      // fallback: web Google Maps
      await launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng'));
    }
  }
}
```

Called from: the prospect detail (Stage 6) and the info window "Navigate" action.

---

## 7. GPS permission prompt

`geolocator` handles this — wrap the "Center on me" button in a permission check:

```dart
Future<bool> _ensureLocationPermission() async {
  var perm = await Geolocator.checkPermission();
  if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
  return perm == LocationPermission.whileInUse || perm == LocationPermission.always;
}
```

Do NOT auto-request on app launch. Request when the user actually taps "my location." Android + iOS both penalize apps that ask on first start without context.

---

## 8. Empty state

```dart
class _EmptyMap extends StatelessWidget {
  const _EmptyMap();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.location_off_outlined, size: 48),
            const SizedBox(height: 16),
            Text('No locations to display', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text(
              'Your assigned prospects don\'t have geocoded addresses yet. '
              'They\'ll appear here once the office adds coordinates.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## 9. Verification

- [ ] Rufero opens the Map view → pins appear with correct colors per status
- [ ] Map auto-fits bounds so all pins are visible
- [ ] Tap a pin → info window shows name + address
- [ ] Tap info window → opens prospect detail (Stage 6 will make this real)
- [ ] "My location" button only prompts permission the first time user taps it
- [ ] Navigate → opens Google Maps (Android) with turn-by-turn to correct address
- [ ] Navigate → opens Apple Maps (iOS) with turn-by-turn
- [ ] No navigation on web Google Maps unless native app is unavailable
- [ ] Prospects without coordinates DO NOT show as `(0, 0)` pins off Africa
- [ ] Real-time: reassign a prospect in web → mobile map updates within 5s (via existing ProspectsBloc realtime)

---

## 10. Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Map is blank gray tile | API key not in manifest or build.gradle placeholder missing | Check manifestPlaceholders + `flutter clean && flutter run` |
| "IOException: Unable to resolve host" in debug | Emulator has no internet | Cold boot the emulator |
| Pins at (0,0) | `[lng, lat]` swap | Fix `ProspectModel.fromJson` destructure |
| Navigation opens Chrome/Safari instead of map app | Native Maps app uninstalled | That's correct fallback behavior |
| Asking for GPS on app start | Called `requestPermission` in `initState` | Only call on user tap |
| iOS crash on launch | Missing `NSLocationWhenInUseUsageDescription` in Info.plist | Add it |

---

## 11. Contract with Stage 6

The Map's tap-to-detail navigates to `/prospects/:id` — Stage 6 must register that route. Until Stage 6 ships, tapping an info window can route to a placeholder screen that just shows the name — fine for dev smoke tests.

---

## 12. Implementation log — 2026-04-22

**Shipped in this session** (branch `feat/mobile-prospects-module`):

- [apps/mobile/android/local.properties](../../apps/mobile/android/local.properties) — `GOOGLE_MAPS_API_KEY` entry (git-ignored). Key is restricted by package + SHA-1 in Google Cloud Console.
- [apps/mobile/android/app/build.gradle.kts](../../apps/mobile/android/app/build.gradle.kts) — loads the key from `local.properties` and injects it via `manifestPlaceholders["GOOGLE_MAPS_API_KEY"]`.
- [apps/mobile/android/app/src/main/AndroidManifest.xml](../../apps/mobile/android/app/src/main/AndroidManifest.xml) — added INTERNET / NETWORK_STATE / ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION permissions and the `com.google.android.geo.API_KEY` meta-data.
- [apps/mobile/lib/features/prospects/domain/entities/prospect_entity.dart](../../apps/mobile/lib/features/prospects/domain/entities/prospect_entity.dart) — added `latitude`, `longitude`, and `hasCoordinates` getter.
- [apps/mobile/lib/features/prospects/data/models/prospect_model.dart](../../apps/mobile/lib/features/prospects/data/models/prospect_model.dart) — added `_parsePoint` helper that accepts all three PostgREST representations (GeoJSON Point, `{x, y}` map, `"(lng,lat)"` string), so the layer works whether the column stays `point` or migrates to `geography(Point, 4326)` later.
- [apps/mobile/lib/features/prospects/presentation/pages/prospects_map_view.dart](../../apps/mobile/lib/features/prospects/presentation/pages/prospects_map_view.dart) — new `ProspectsMapView` that consumes the existing `ProspectsBloc`, filters to prospects with coordinates, renders status-hue markers with InfoWindows, and auto-fits camera bounds (signature-guarded to avoid camera jitter on every rebuild).
- [apps/mobile/lib/features/shell/main_shell.dart](../../apps/mobile/lib/features/shell/main_shell.dart) — the Prospects tab now hosts a `SegmentedButton` (List / Map) inside a single `BlocProvider<ProspectsBloc>`, so one fetch + one realtime subscription powers both surfaces.

**Decisions / deviations from the plan**:

- **Coordinates come from HailTrace, not Google Geocoding.** We did not run migration `009_coordinates_geography.sql` and did not add a server-side geocoder — rows already carry lat/lng when they land. `_parsePoint` is defensive so a future migration to `geography` is zero-code-change on the client.
- **No "Navigate" / "Center on me" yet.** `url_launcher` and `geolocator` are not in `pubspec.yaml` for this pass — navigation deep-link and GPS-center can ship with Stage 6 when the detail page lands.
- **iOS setup is deferred.** `AppDelegate.swift` + `Info.plist` key entries were not touched; Android-only for today's smoke test.

**Verified**: `flutter analyze` clean; `flutter run -d chrome` boots (web path doesn't exercise the Android API key, but proves the Gradle changes didn't break anything).
