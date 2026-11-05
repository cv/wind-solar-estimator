// Historical hourly weather from Open-Meteo (ERA5 reanalysis) for a site.
// The API allows browser (CORS) requests, so no server is needed.
// Free tier: non-commercial use only, ~10,000 weighted calls per day per IP;
// 20 years for one site costs about 500 of those. Commercial use needs an API key.

import { dbGet, dbPut, dbClear } from "./cache.ts";
import { at } from "../util/checked.ts";

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const ARCHIVE_COMMERCIAL = "https://customer-archive-api.open-meteo.com/v1/archive";
const CONCURRENCY = 4;
const MAX_RETRIES = 4;

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

/** Open-Meteo archive API response (JSON, timeformat=unixtime); reason is set on errors. */
interface ArchiveResponse {
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone: string;
  utc_offset_seconds?: number;
  hourly?: {
    time: number[];
    wind_speed_10m: (number | null)[];
    wind_speed_100m: (number | null)[];
    temperature_2m: (number | null)[];
    global_tilted_irradiance: (number | null)[];
  };
  error?: boolean;
  reason?: string;
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

/** A reply that has the hourly data. */
type ArchiveData = ArchiveResponse & { hourly: NonNullable<ArchiveResponse["hourly"]> };

const memory = new Map<string, Weather>();
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * Loads hourly 10 m and 100 m wind, 2 m temperature and plane-of-array irradiance
 * for full calendar years, one request per year (a few in parallel), cached in
 * IndexedDB. Returns dense typed arrays in local standard time.
 * azimuth uses Open-Meteo's convention: 0 = south, −90 = east, 90 = west, 180 = north.
 */
export async function fetchWeather({
  lat,
  lon,
  startYear,
  endYear,
  tilt,
  azimuth,
  apiKey,
  onProgress,
  signal,
}: WeatherRequest): Promise<Weather> {
  lat = Math.round(lat * 1e4) / 1e4;
  lon = Math.round(lon * 1e4) / 1e4;
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
      let part = await dbGet<YearPart>(yearKey);
      if (!part) {
        // oxlint-disable-next-line no-await-in-loop -- worker pool: each worker takes one year at a time to cap concurrent requests
        part = compactYear(await fetchYear({ lat, lon, year: at(years, idx), tilt, azimuth, apiKey, signal }));
        dbPut(yearKey, part); // best effort, not awaited
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
  if (!cols.w10.length) throw new Error("No weather data returned for this location and period");

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

const col = (a: (number | null)[]): Float32Array => Float32Array.from(a, (x) => (x == null ? NaN : x));

/** Typed arrays keep the IndexedDB cache small; missing values become NaN. */
function compactYear(json: ArchiveData): YearPart {
  const h = json.hourly;
  return {
    latitude: json.latitude,
    longitude: json.longitude,
    elevation: json.elevation ?? 0,
    timezone: json.timezone,
    offset: json.utc_offset_seconds || 0,
    time: Float64Array.from(h.time),
    w10: col(h.wind_speed_10m),
    w100: col(h.wind_speed_100m),
    temp: col(h.temperature_2m),
    gti: col(h.global_tilted_irradiance),
  };
}

interface YearRequest {
  lat: number;
  lon: number;
  year: number;
  tilt: number;
  azimuth: number;
  /** Passed through from fetchWeather: undefined uses the free API. */
  apiKey: string | undefined;
  /** Passed through from fetchWeather: undefined means not abortable. */
  signal: AbortSignal | undefined;
}

async function fetchYear({ lat, lon, year, tilt, azimuth, apiKey, signal }: YearRequest): Promise<ArchiveData> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    hourly: "wind_speed_10m,wind_speed_100m,temperature_2m,global_tilted_irradiance",
    tilt: String(tilt),
    azimuth: String(azimuth),
    models: "era5",
    wind_speed_unit: "kmh",
    timezone: "auto",
    timeformat: "unixtime",
  });
  if (apiKey) q.set("apikey", apiKey);
  const url = `${apiKey ? ARCHIVE_COMMERCIAL : ARCHIVE}?${q}`;

  for (let attempt = 0; ; attempt++) {
    const retry = attempt < MAX_RETRIES;
    const wait = () => sleep(10000 * (attempt + 1), signal);
    let res: Response, text: string;
    try {
      // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
      res = await fetch(url, signal ? { signal } : {});
      // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
      text = await res.text();
    } catch (e) {
      if (signal?.aborted) throw e;
      if (retry) {
        // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
        await wait();
        continue;
      } // network hiccup
      throw new Error(`Couldn't reach the weather service for ${year}: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
    let json: ArchiveResponse | null = null;
    try {
      json = JSON.parse(text) as ArchiveResponse;
    } catch {
      /* not JSON, e.g. a proxy error page */
    }

    if (res.ok && json?.hourly?.time) return { ...json, hourly: json.hourly };
    const reason = json?.reason || text.slice(0, 120).trim() || res.statusText;
    if (res.status === 429 && /daily|hourly/i.test(reason)) {
      throw new Error(`Open-Meteo's free usage limit was reached (${reason}). Try again later, or use an API key.`);
    }
    // Retry rate limits, server errors and garbled replies; a 400 means a bad request, so don't.
    if (retry && (res.ok || res.status === 429 || res.status >= 500)) {
      const after = Number(res.headers.get("retry-after"));
      // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
      await (after > 0 ? sleep(after * 1000, signal) : wait());
      continue;
    }
    throw new Error(`Weather data for ${year} failed (${res.status}): ${reason}. Press Analyse again to resume.`);
  }
}

export async function clearWeatherCache(): Promise<void> {
  memory.clear();
  await dbClear();
}
