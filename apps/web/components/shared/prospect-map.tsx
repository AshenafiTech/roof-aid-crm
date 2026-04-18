"use client";

import dynamic from "next/dynamic";
import type { ProspectListItem } from "@/lib/queries/prospects";

type Coords = { lat: number; lng: number };

export function parseCoordinates(coordinates: unknown): Coords | null {
  if (!coordinates) return null;
  if (typeof coordinates === "string") {
    const match = coordinates.match(/\(([^,]+),([^)]+)\)/);
    if (match) {
      const lng = parseFloat(match[1]);
      const lat = parseFloat(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  if (typeof coordinates === "object" && coordinates !== null) {
    const obj = coordinates as Record<string, unknown>;
    if ("x" in obj && "y" in obj) {
      const lng = Number(obj.x);
      const lat = Number(obj.y);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return null;
}

const LeafletMap = dynamic(() => import("./prospect-map-leaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted/30 text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export function ProspectMap({
  prospects,
  focused,
  onSelect,
  className,
}: {
  prospects: ProspectListItem[];
  focused?: ProspectListItem | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={className} style={{ isolation: "isolate", zIndex: 0 }}>
      <LeafletMap prospects={prospects} focused={focused ?? null} onSelect={onSelect} />
    </div>
  );
}
