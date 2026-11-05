// Historical hourly weather from Open-Meteo (ERA5 reanalysis) for a site.
// The API allows browser (CORS) requests, so no server is needed.
// Free tier: non-commercial use only, ~10,000 weighted calls per day per IP;
// 20 years for one site costs about 500 of those. Commercial use needs an API key.

import { dbGet, dbPut, dbClear } from "./cache.ts";
import { at } from "../util/checked.ts";
import { isNumber, isRecord, isString } from "../util/guards.ts";
import { fetchYear, type ArchiveData } from "./archive.ts";

const CONCURRENCY = 4;

/** What fetchWeather loads: a site, whole calendar years and the PV panel orientation. */
export interface WeatherRequest {
  lat: number;
  lon: number;
  startYear: number;
  endYear: number;
  /** Panel tilt from horizontal, degrees. */
  tilt: number;
  /** Panel azimuth, Open-Meteo's convention: 0 = south, −90 = east, 90 = west, 180 = north. */
  azimuth: number;
  /** Open-Meteo commercial API key; empty or absent uses the free API. */
  apiKey?: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Hourly weather for a site, as dense parallel arrays (hours with any missing value are
 * dropped). Calendar fields are local standard time; t is the UTC hour number.
 */
export interface Weather {
  /** Number of hours (length of every array). */
  n: number;
  /** Hours dropped because a value was missing. */
  missing: number;
  /** Number of calendar years covered. */
  years: number;
  startYear: number;
  endYear: number;
  /** Centre of the model grid cell used. */
  gridLat: number;
  gridLon: number;
  /** Model grid cell elevation (m). */
  elevation: number;
  /** IANA time zone of the site, e.g. "America/Edmonton". */
  timezone: string;
  /** UTC hour number (hours since 1970), to line up with station records. */
  t: Int32Array;
  year: Uint16Array;
  /** 0–11. */
  month: Uint8Array;
  /** 0–23. */
  hour: Uint8Array;
  /** Wind speed at 10 m and 100 m, km/h. */
  w10: Float32Array;
  w100: Float32Array;
  /** Air temperature at 2 m, °C. */
  temp: Float32Array;
  /** Global tilted irradiance on the panel plane, W/m². */
  gti: Float32Array;
}

/** One year of weather as cached in IndexedDB; missing values are NaN. */
interface YearPart {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  /** Seconds to add to UTC for local standard time. */
  offset: number;
  /** Unix seconds (UTC). */
  time: Float64Array;
  w10: Float32Array;
  w100: Float32Array;
  temp: Float32Array;
  gti: Float32Array;
}

type Column = "t" | "year" | "month" | "hour" | "w10" | "w100" | "temp" | "gti";

const memory = new Map<string, Weather>();

/** One year as cached in IndexedDB (entries written by older versions may differ). */
function isYearPart(v: unknown): v is YearPart {
  return (
    isRecord(v) &&
    isNumber(v["latitude"]) &&
    isNumber(v["longitude"]) &&
    isNumber(v["elevation"]) &&
    isString(v["timezone"]) &&
    isNumber(v["offset"]) &&
    v["time"] instanceof Float64Array &&
    v["w10"] instanceof Float32Array &&
    v["w100"] instanceof Float32Array &&
    v["temp"] instanceof Float32Array &&
    v["gti"] instanceof Float32Array
  );
}

/**
 * Loads hourly 10 m and 100 m wind, 2 m temperature and plane-of-array irradiance
 * for full calendar years, one request per year (a few in parallel), cached in
 * IndexedDB. Returns dense typed arrays in local standard time.
 * azimuth uses Open-Meteo's convention: 0 = south, −90 = east, 90 = west, 180 = north.
 */
export async function fetchWeather({
  lat: siteLat,
  lon: siteLon,
  startYear,
  endYear,
  tilt,
  azimuth,
  apiKey,
  onProgress,
  signal,
}: WeatherRequest): Promise<Weather> {
  const lat = Math.round(siteLat * 1e4) / 1e4;
  const lon = Math.round(siteLon * 1e4) / 1e4;
  const key = [lat, lon, startYear, endYear, tilt, azimuth].join("|");
  const cached = memory.get(key);
  if (cached) return cached;

  // Each year is cached on its own, so a failed or interrupted download resumes where it stopped.
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  const parts: YearPart[] = Array.from({ length: years.length });
  let done = 0;
  onProgress?.(0, years.length);

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < years.length) {
      const idx = next++;
      const yearKey = ["y", lat, lon, years[idx], tilt, azimuth].join("|");
      // oxlint-disable-next-line no-await-in-loop -- worker pool: each worker takes one year at a time to cap concurrent requests
      let part = await dbGet(yearKey, isYearPart);
      if (!part) {
        // oxlint-disable-next-line no-await-in-loop -- worker pool: each worker takes one year at a time to cap concurrent requests
        part = compactYear(await fetchYear({ lat, lon, year: at(years, idx), tilt, azimuth, apiKey, signal }));
        void dbPut(yearKey, part); // best effort, not awaited (dbPut never rejects)
      }
      parts[idx] = part;
      onProgress?.(++done, years.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, years.length) }, worker));

  const first = at(parts, 0);
  const offset = first.offset;
  const cols: Record<Column, number[]> = { t: [], year: [], month: [], hour: [], w10: [], w100: [], temp: [], gti: [] };
  let missing = 0;
  for (const part of parts) {
    for (let i = 0; i < part.time.length; i++) {
      const w10 = at(part.w10, i),
        w100 = at(part.w100, i),
        t = at(part.temp, i),
        g = at(part.gti, i),
        time = at(part.time, i);
      if (Number.isNaN(w10) || Number.isNaN(w100) || Number.isNaN(t) || Number.isNaN(g)) {
        missing++;
        continue;
      }
      const d = new Date((time + offset) * 1000);
      cols.t.push(Math.round(time / 3600)); // UTC hour number, to line up with station records
      cols.year.push(d.getUTCFullYear());
      cols.month.push(d.getUTCMonth());
      cols.hour.push(d.getUTCHours());
      cols.w10.push(w10);
      cols.w100.push(w100);
      cols.temp.push(t);
      cols.gti.push(g);
    }
  }
  if (cols.w10.length === 0) throw new Error("No weather data returned for this location and period");

  const wx: Weather = {
    n: cols.w10.length,
    missing,
    years: years.length,
    startYear,
    endYear,
    gridLat: first.latitude,
    gridLon: first.longitude,
    elevation: first.elevation,
    timezone: first.timezone,
    t: Int32Array.from(cols.t),
    year: Uint16Array.from(cols.year),
    month: Uint8Array.from(cols.month),
    hour: Uint8Array.from(cols.hour),
    w10: Float32Array.from(cols.w10),
    w100: Float32Array.from(cols.w100),
    temp: Float32Array.from(cols.temp),
    gti: Float32Array.from(cols.gti),
  };
  memory.set(key, wx);
  return wx;
}

const col = (a: Array<number | null>): Float32Array => Float32Array.from(a, (x) => x ?? Number.NaN);

/** Typed arrays keep the IndexedDB cache small; missing values become NaN. */
function compactYear(json: ArchiveData): YearPart {
  const h = json.hourly;
  return {
    latitude: json.latitude,
    longitude: json.longitude,
    elevation: json.elevation ?? 0,
    timezone: json.timezone,
    offset: json.utc_offset_seconds ?? 0,
    time: Float64Array.from(h.time),
    w10: col(h.wind_speed_10m),
    w100: col(h.wind_speed_100m),
    temp: col(h.temperature_2m),
    gti: col(h.global_tilted_irradiance),
  };
}

export async function clearWeatherCache(): Promise<void> {
  memory.clear();
  await dbClear();
}
