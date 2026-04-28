import { toast } from "sonner";

import { parseCoordinates } from "@/components/shared/prospect-map";

// Open Google Maps directions for a prospect. Prefers coordinates (most precise);
// falls back to a free-text address. Toasts and bails if neither is available.
export function openGoogleMapsDirections({
  coordinates,
  address,
}: {
  coordinates?: unknown;
  address?: string | null;
}) {
  const coords = parseCoordinates(coordinates);
  let destination: string | null = null;
  if (coords) {
    destination = `${coords.lat},${coords.lng}`;
  } else if (address && address.trim()) {
    destination = encodeURIComponent(address.trim());
  }
  if (!destination) {
    toast("No location available for this prospect");
    return;
  }
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    "_blank",
    "noopener,noreferrer",
  );
}
