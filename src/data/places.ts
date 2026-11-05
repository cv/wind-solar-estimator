// Place search by name through Open-Meteo's geocoding API (allows browser CORS requests).

const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

/** A place found by name: a readable label and its coordinates. */
export interface Place {
  name: string;
  lat: number;
  lon: number;
}

/** One result of Open-Meteo's geocoding API (only the fields used here). */
interface GeocodeResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

/** Open-Meteo geocoding response; results is absent when nothing matches. */
interface GeocodeResponse {
  results?: GeocodeResult[];
}

export async function searchPlaces(name: string, signal?: AbortSignal): Promise<Place[]> {
  const res = await fetch(`${GEOCODE}?${new URLSearchParams({ name, count: "6", language: "en" })}`, { signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const json = (await res.json()) as GeocodeResponse;
  return (json.results || []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
  }));
}
