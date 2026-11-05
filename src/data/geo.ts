// Great-circle distance and compass direction between two points.

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** One of the eight compass points. */
export type CompassPoint = (typeof COMPASS)[number];

export const rad = (d: number): number => (d * Math.PI) / 180;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Compass direction from the first point to the second, e.g. "SW". */
export function direction(lat1: number, lon1: number, lat2: number, lon2: number): CompassPoint {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}
