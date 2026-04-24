"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Circle, LayersControl, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import "leaflet/dist/leaflet.css";

import type { ProspectListItem } from "@/lib/queries/prospects";
import {
  PROSPECT_STATUS_LABELS,
  isProspectStatus,
  type ProspectStatus,
} from "@/lib/constants/prospect-status";

import { parseCoordinates } from "./prospect-map";

/* ── Marker pin colors per status ── */
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

/* Build an SVG pin DivIcon at runtime — no asset hosting needed */
function buildPinIcon(color: string, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 38 : 30;
  const ring = isSelected
    ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${SELECTED_RING_COLOR}" stroke-width="3"/>`
    : "";
  const html = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="${size}" height="${size * (32 / 24)}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/>
      ${ring}
      <circle cx="12" cy="12" r="5" fill="#fff"/>
    </svg>`;
  return L.divIcon({
    html,
    className: "",                           // strip leaflet's default class so no white box
    iconSize: [size, size * (32 / 24)],
    iconAnchor: [size / 2, size * (32 / 24)],
    popupAnchor: [0, -size * (32 / 24)],
  });
}

function pinForProspect(p: ProspectListItem, isSelected: boolean): L.DivIcon {
  const status = isProspectStatus(p.status) ? p.status : null;
  const color = status ? STATUS_PIN_COLORS[status] : DEFAULT_PIN_COLOR;
  return buildPinIcon(color, isSelected);
}

/* ── Right-click capture — emits the clicked point up ── */
function ContextMenuCapture({ onContext }: { onContext: (lat: number, lng: number) => void }) {
  useMapEvents({
    contextmenu(e) {
      onContext(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/* ── Camera controller — recenters when focused changes ── */
function CameraController({
  focused,
  points,
}: {
  focused: ProspectListItem | null;
  points: { id: string; lat: number; lng: number }[];
}) {
  const map = useMap();
  const didInitialFit = useRef(false);

  useEffect(() => {
    if (focused) {
      const c = parseCoordinates(focused.coordinates);
      if (c) map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      return;
    }
    if (!didInitialFit.current && points.length > 0) {
      didInitialFit.current = true;
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [focused, points, map]);

  return null;
}

export default function ProspectMapLeaflet({
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
  const [pendingPoint, setPendingPoint] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const points = useMemo(() => {
    const arr: { id: string; lat: number; lng: number; prospect: ProspectListItem }[] = [];
    for (const p of prospects) {
      const c = parseCoordinates(p.coordinates);
      if (c) arr.push({ id: p.id, lat: c.lat, lng: c.lng, prospect: p });
    }
    return arr;
  }, [prospects]);

  const center: [number, number] = useMemo(() => {
    if (focused) {
      const c = parseCoordinates(focused.coordinates);
      if (c) return [c.lat, c.lng];
    }
    if (points.length > 0) {
      const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
      const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
      return [lat, lng];
    }
    return [36.2, -94.2]; // fallback (Bentonville-ish, matches old default)
  }, [focused, points]);

  const initialZoom = focused ? 15 : points.length === 1 ? 14 : 11;

  return (
    <MapContainer
      center={center}
      zoom={initialZoom}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: "var(--muted)" }}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Street">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      <CameraController focused={focused} points={points} />
      <ContextMenuCapture
        onContext={(lat, lng) =>
          setPendingPoint({ lat, lng, radiusKm: proximity?.radiusKm ?? 5 })
        }
      />

      {proximity && (
        <Circle
          center={[proximity.lat, proximity.lng]}
          radius={proximity.radiusKm * 1000}
          pathOptions={{ color: "#2563EB", fillColor: "#3B82F6", fillOpacity: 0.12, weight: 2 }}
          interactive={false}
        />
      )}

      {pendingPoint && (
        <Popup
          position={[pendingPoint.lat, pendingPoint.lng]}
          eventHandlers={{ remove: () => setPendingPoint(null) }}
        >
          <div className="min-w-[220px] text-xs">
            <div className="font-semibold text-sm mb-1">Search {tabLabel}</div>
            <div className="text-muted-foreground mb-2">
              Within{" "}
              <span className="font-semibold text-foreground">
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
                  className="rounded border px-2 py-1 text-[11px] hover:bg-muted"
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
                className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90"
              >
                Search
              </button>
            </div>
          </div>
        </Popup>
      )}
      {points.map(({ id, lat, lng, prospect }) => {
        const isSelected = focused?.id === id;
        return (
          <Marker
            key={id}
            position={[lat, lng]}
            icon={pinForProspect(prospect, isSelected)}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={{
              click: () => onSelect?.(id),
            }}
          >
            <Popup offset={[0, -28]}>
              <div className="text-xs">
                <div className="font-semibold text-sm">{prospect.name}</div>
                {prospect.address && <div className="text-muted-foreground">{prospect.address}</div>}
                <div className="mt-1 text-muted-foreground">
                  {isProspectStatus(prospect.status)
                    ? PROSPECT_STATUS_LABELS[prospect.status]
                    : prospect.status}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
