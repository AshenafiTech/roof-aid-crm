"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Circle,
  ColorScheme,
  ControlPosition,
  InfoWindow,
  Map,
  Marker,
  useApiIsLoaded,
  useMap,
} from "@vis.gl/react-google-maps";

import type { ProspectListItem } from "@/lib/queries/prospects";
import {
  PROSPECT_STATUS_LABELS,
  isProspectStatus,
  type ProspectStatus,
} from "@/lib/constants/prospect-status";

import { parseCoordinates } from "./prospect-map";

const STATUS_PIN_COLORS: Record<ProspectStatus, string> = {
  new_leads: "#3B82F6",
  prospects: "#6366F1",
  contacted: "#0EA5E9",
  follow_up: "#F59E0B",
  scheduled: "#A855F7",
  closed_customer: "#10B981",
  not_viable: "#9CA3AF",
};

const DEFAULT_PIN_COLOR = "#6366F1";
const SELECTED_RING_COLOR = "#FACC15";
const FALLBACK_CENTER = { lat: 36.2, lng: -94.2 };

function pinSvgDataUri(color: string, isSelected: boolean): string {
  const ring = isSelected
    ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${SELECTED_RING_COLOR}" stroke-width="3"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="24" height="32"><path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/>${ring}<circle cx="12" cy="12" r="5" fill="#fff"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function pinIcon(prospect: ProspectListItem, isSelected: boolean): google.maps.Icon {
  const status = isProspectStatus(prospect.status) ? prospect.status : null;
  const color = status ? STATUS_PIN_COLORS[status] : DEFAULT_PIN_COLOR;
  const size = isSelected ? 38 : 30;
  const height = size * (32 / 24);
  return {
    url: pinSvgDataUri(color, isSelected),
    scaledSize: new google.maps.Size(size, height),
    anchor: new google.maps.Point(size / 2, height),
  };
}

function fitToCircle(
  map: google.maps.Map,
  center: { lat: number; lng: number },
  radiusKm: number,
  padding: number,
) {
  const tmp = new google.maps.Circle({
    center,
    radius: radiusKm * 1000,
  });
  const b = tmp.getBounds();
  if (b) map.fitBounds(b, padding);
}

function CameraController({
  focused,
  points,
  pendingPoint,
  proximity,
}: {
  focused: ProspectListItem | null;
  points: { id: string; lat: number; lng: number }[];
  pendingPoint: { lat: number; lng: number; radiusKm: number } | null;
  proximity: { lat: number; lng: number; radiusKm: number } | null;
}) {
  const map = useMap();
  const didInitialFit = useRef(false);

  useEffect(() => {
    if (!map) return;
    if (focused) {
      const c = parseCoordinates(focused.coordinates);
      if (c) {
        map.panTo({ lat: c.lat, lng: c.lng });
        const z = map.getZoom() ?? 0;
        if (z < 15) map.setZoom(15);
      }
      return;
    }
    if (!didInitialFit.current && points.length > 0 && !proximity && !pendingPoint) {
      didInitialFit.current = true;
      const bounds = new google.maps.LatLngBounds();
      for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng });
      map.fitBounds(bounds, 40);
      const listener = google.maps.event.addListenerOnce(map, "idle", () => {
        const z = map.getZoom();
        if (z != null && z > 13) map.setZoom(13);
      });
      return () => google.maps.event.removeListener(listener);
    }
  }, [map, focused, points, proximity, pendingPoint]);

  useEffect(() => {
    if (!map || !pendingPoint || focused) return;
    fitToCircle(map, { lat: pendingPoint.lat, lng: pendingPoint.lng }, pendingPoint.radiusKm, 60);
  }, [map, focused, pendingPoint?.lat, pendingPoint?.lng, pendingPoint?.radiusKm]);

  useEffect(() => {
    if (!map || !proximity || focused) return;
    didInitialFit.current = true;
    fitToCircle(map, { lat: proximity.lat, lng: proximity.lng }, proximity.radiusKm, 80);
  }, [map, focused, proximity?.lat, proximity?.lng, proximity?.radiusKm]);

  return null;
}

function GoogleMapInner({
  prospects,
  focused,
  onSelect,
  proximity,
  onProximityChange,
  tabLabel,
}: {
  prospects: ProspectListItem[];
  focused: ProspectListItem | null;
  onSelect?: (id: string) => void;
  proximity: { lat: number; lng: number; radiusKm: number } | null;
  onProximityChange: (p: { lat: number; lng: number; radiusKm: number } | null) => void;
  tabLabel: string;
}) {
  const [pendingPoint, setPendingPoint] = useState<
    { lat: number; lng: number; radiusKm: number } | null
  >(null);
  const [popupId, setPopupId] = useState<string | null>(null);

  const points = useMemo(() => {
    const arr: { id: string; lat: number; lng: number; prospect: ProspectListItem }[] = [];
    for (const p of prospects) {
      const c = parseCoordinates(p.coordinates);
      if (c) arr.push({ id: p.id, lat: c.lat, lng: c.lng, prospect: p });
    }
    return arr;
  }, [prospects]);

  const initialCenter = useMemo(() => {
    if (focused) {
      const c = parseCoordinates(focused.coordinates);
      if (c) return { lat: c.lat, lng: c.lng };
    }
    if (points.length > 0) {
      const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
      const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
      return { lat, lng };
    }
    return FALLBACK_CENTER;
    // initial only — recentering on focus changes is handled by CameraController.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialZoom = focused ? 15 : points.length === 1 ? 14 : 11;

  const popupProspect = popupId ? points.find((p) => p.id === popupId) : null;
  const apiLoaded = useApiIsLoaded();

  return (
    <Map
      defaultCenter={initialCenter}
      defaultZoom={initialZoom}
      gestureHandling="greedy"
      disableDefaultUI={false}
      mapTypeControl
      mapTypeControlOptions={{
        position: ControlPosition.TOP_RIGHT,
      }}
      streetViewControl={false}
      fullscreenControl={false}
      colorScheme={ColorScheme.LIGHT}
      onContextmenu={(e) => {
        const ll = e.detail.latLng;
        if (!ll) return;
        e.domEvent?.preventDefault?.();
        setPendingPoint({
          lat: ll.lat,
          lng: ll.lng,
          radiusKm: proximity?.radiusKm ?? 5,
        });
      }}
      style={{ width: "100%", height: "100%" }}
    >
      <CameraController
        focused={focused}
        points={points}
        pendingPoint={pendingPoint}
        proximity={proximity}
      />

      {proximity && !pendingPoint && (
        <Circle
          center={{ lat: proximity.lat, lng: proximity.lng }}
          radius={proximity.radiusKm * 1000}
          strokeColor="#2563EB"
          strokeOpacity={1}
          strokeWeight={2}
          fillColor="#3B82F6"
          fillOpacity={0.12}
          clickable={false}
        />
      )}

      {pendingPoint && (
        <Circle
          center={{ lat: pendingPoint.lat, lng: pendingPoint.lng }}
          radius={pendingPoint.radiusKm * 1000}
          strokeColor="#2563EB"
          strokeOpacity={1}
          strokeWeight={2}
          fillColor="#3B82F6"
          fillOpacity={0.18}
          clickable={false}
        />
      )}

      {pendingPoint && (
        <InfoWindow
          position={{ lat: pendingPoint.lat, lng: pendingPoint.lng }}
          onCloseClick={() => setPendingPoint(null)}
        >
          <div className="min-w-[220px] text-xs text-gray-900">
            <div className="font-semibold text-sm mb-1">Search {tabLabel}</div>
            <div className="text-gray-600 mb-2">
              Within{" "}
              <span className="font-semibold text-gray-900">
                {pendingPoint.radiusKm.toFixed(1)} km
              </span>{" "}
              of this point
            </div>
            <input
              type="range"
              min={0.5}
              max={50}
              step={0.5}
              value={pendingPoint.radiusKm}
              onChange={(e) =>
                setPendingPoint((prev) =>
                  prev ? { ...prev, radiusKm: Number(e.target.value) } : prev,
                )
              }
              className="w-full"
            />
            <div className="mt-2 flex gap-2 justify-end">
              {proximity && (
                <button
                  type="button"
                  onClick={() => {
                    onProximityChange(null);
                    setPendingPoint(null);
                  }}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-900 hover:bg-gray-100"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onProximityChange({
                    lat: pendingPoint.lat,
                    lng: pendingPoint.lng,
                    radiusKm: pendingPoint.radiusKm,
                  });
                  setPendingPoint(null);
                }}
                className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
              >
                Search
              </button>
            </div>
          </div>
        </InfoWindow>
      )}

      {apiLoaded &&
        points.map(({ id, lat, lng, prospect }) => {
          const isSelected = focused?.id === id;
          return (
            <Marker
              key={id}
              position={{ lat, lng }}
              icon={pinIcon(prospect, isSelected)}
              zIndex={isSelected ? 1000 : undefined}
              onClick={() => {
                onSelect?.(id);
                setPopupId(id);
              }}
            />
          );
        })}

      {popupProspect && (
        <InfoWindow
          position={{ lat: popupProspect.lat, lng: popupProspect.lng }}
          pixelOffset={[0, -32]}
          onCloseClick={() => setPopupId(null)}
        >
          <div className="text-xs text-gray-900">
            <div className="font-semibold text-sm">{popupProspect.prospect.name}</div>
            {popupProspect.prospect.address && (
              <div className="text-gray-600">{popupProspect.prospect.address}</div>
            )}
            <div className="mt-1 text-gray-600">
              {isProspectStatus(popupProspect.prospect.status)
                ? PROSPECT_STATUS_LABELS[popupProspect.prospect.status]
                : popupProspect.prospect.status}
            </div>
          </div>
        </InfoWindow>
      )}
    </Map>
  );
}

export default function ProspectMapGoogle(props: {
  prospects: ProspectListItem[];
  focused: ProspectListItem | null;
  onSelect?: (id: string) => void;
  proximity: { lat: number; lng: number; radiusKm: number } | null;
  onProximityChange: (p: { lat: number; lng: number; radiusKm: number } | null) => void;
  tabLabel: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        Map unavailable — set <code className="mx-1 rounded bg-muted px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to enable Google Maps.
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["maps"]}>
      <GoogleMapInner {...props} />
    </APIProvider>
  );
}
