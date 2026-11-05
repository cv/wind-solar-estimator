// Place search by name through Open-Meteo's geocoding API (allows browser CORS requests).

const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchPlaces(name, signal) {
  const res = await fetch(`${GEOCODE}?${new URLSearchParams({ name, count: "6", language: "en" })}`, { signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const json = await res.json();
  return (json.results || []).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
  }));
}
