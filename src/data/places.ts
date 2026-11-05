// Place search by name through Open-Meteo's geocoding API (allows browser CORS requests).

import { isArrayOf, isNumber, isRecord, isString } from "../util/guards.ts";

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

const optionalString = (v: unknown): boolean => v === undefined || isString(v);

function isGeocodeResult(v: unknown): v is GeocodeResult {
  return (
    isRecord(v) &&
    isString(v["name"]) &&
    optionalString(v["admin1"]) &&
    optionalString(v["country"]) &&
    isNumber(v["latitude"]) &&
    isNumber(v["longitude"])
  );
}

/** The results of an Open-Meteo geocoding reply ({ results?: [...] }; absent when nothing matches). */
function geocodeResults(json: unknown): GeocodeResult[] {
  if (!isRecord(json)) throw new Error("Place search returned an unreadable reply");
  if (json["results"] === undefined) return [];
  if (!isArrayOf(json["results"], isGeocodeResult))
    throw new Error("Place search returned results in an unexpected form");
  return json["results"];
}

export async function searchPlaces(name: string, signal?: AbortSignal): Promise<Place[]> {
  const res = await fetch(
    `${GEOCODE}?${new URLSearchParams({ name, count: "6", language: "en" })}`,
    signal ? { signal } : {},
  );
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  return geocodeResults(await res.json()).map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
  }));
}
