"use client";

import { useEffect, useRef } from "react";
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

function buildMapUrl(
  prospects: ProspectListItem[],
  focused?: ProspectListItem | null,
): string {
  if (focused) {
    const c = parseCoordinates(focused.coordinates);
    if (c) {
      return `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d5000!2d${c.lng}!3d${c.lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus`;
    }
  }

  const points: Coords[] = [];
  for (const p of prospects) {
    const c = parseCoordinates(p.coordinates);
    if (c) points.push(c);
  }

  if (points.length === 0) {
    return "https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d400000!2d-94.2!3d36.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus";
  }

  const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const avgLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

  let zoom = 10;
  if (points.length === 1) zoom = 14;
  else if (points.length <= 10) zoom = 11;

  return `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d${100000 / (zoom - 5)}!2d${avgLng}!3d${avgLat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sus`;
}

export function ProspectMap({
  prospects,
  focused,
  className,
}: {
  prospects: ProspectListItem[];
  focused?: ProspectListItem | null;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = buildMapUrl(prospects, focused);

  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }
  }, [url]);

  return (
    <div className={className}>
      <iframe
        ref={iframeRef}
        title="Prospect Map"
        className="h-full w-full"
        src={url}
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
