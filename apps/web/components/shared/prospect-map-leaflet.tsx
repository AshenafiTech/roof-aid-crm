"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { LayersControl, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";

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
}: {
  prospects: ProspectListItem[];
  focused: ProspectListItem | null;
  onSelect?: (id: string) => void;
}) {
  const points = useMemo(() => {
    const arr: { id: string; lat: number; lng: number; prospect: ProspectListItem }[] = [];
    if (!focused) return arr;
    const c = parseCoordinates(focused.coordinates);
    if (c) arr.push({ id: focused.id, lat: c.lat, lng: c.lng, prospect: focused });
    return arr;
  }, [focused]);

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
            <Tooltip permanent direction="top" offset={[0, -28]} opacity={1}>
              <div className="text-xs">
                <div className="font-semibold text-sm">{prospect.name}</div>
                {prospect.address && <div className="text-muted-foreground">{prospect.address}</div>}
                <div className="mt-1 text-muted-foreground">
                  {isProspectStatus(prospect.status)
                    ? PROSPECT_STATUS_LABELS[prospect.status]
                    : prospect.status}
                </div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
