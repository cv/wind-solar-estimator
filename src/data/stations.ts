// Measured hourly wind from Environment and Climate Change Canada's climate archive, the
// station records behind the Canadian Centre for Climate Services, through the MSC GeoMet
// OGC API. It allows browser (CORS) requests and needs no key. Data: Open Government
// Licence – Canada. Everything downloaded is cached in IndexedDB, so a site is fetched once.

import { dbGet, dbPut, memory, memoryGet } from "./cache.ts";
import { at } from "../util/checked.ts";
import { isArrayOf, isNumber, isRecord, isString } from "../util/guards.ts";
import { sleep } from "../util/sleep.ts";
import { rad, distanceKm, direction, type CompassPoint } from "./geo.ts";

const API = "https://api.weather.gc.ca/collections";
const LIST_TTL_MS = 30 * 86400e3; // station lists change rarely
const CONCURRENCY = 3; // a shared public service: a few requests at a time is plenty
const MAX_RETRIES = 3;
export const SEARCH_RADIUS_KM = 100;

/** A station as listed (and cached): no site-dependent fields. */
export interface StationRecord {
  id: string;
  rawName: string;
  lat: number;
  lon: number;
  /** Metres above sea level; NaN when the list has none. */
  elevation: number;
  /** First and last year of its hourly record. */
  first: number;
  last: number;
}

/** A station near the site, as findStations returns it. */
export interface Station extends StationRecord {
  name: string;
  distanceKm: number;
  /** Direction from the site to the station. */
  direction: CompassPoint;
}

/** Hourly readings: UTC hour numbers (hours since 1970) and wind speeds (km/h at 10 m), parallel arrays. */
export interface StationHours {
  hours: Int32Array;
  wind: Uint8Array;
}

export interface StationHoursRequest {
  id: string;
  startYear: number;
  endYear: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** A station list as stored in IndexedDB. */
interface CachedStationList {
  fetchedAt: number;
  list: StationRecord[];
}

function isStationRecord(v: unknown): v is StationRecord {
  return (
    isRecord(v) &&
    isString(v["id"]) &&
    isString(v["rawName"]) &&
    isNumber(v["lat"]) &&
    isNumber(v["lon"]) &&
    isNumber(v["elevation"]) &&
    isNumber(v["first"]) &&
    isNumber(v["last"])
  );
}

const isStationList = (v: unknown): v is StationRecord[] => isArrayOf(v, isStationRecord);

const isCachedStationList = (v: unknown): v is CachedStationList =>
  isRecord(v) && isNumber(v["fetchedAt"]) && isStationList(v["list"]);

const isStationHours = (v: unknown): v is StationHours =>
  isRecord(v) &&
  v["hours"] instanceof Int32Array &&
  v["wind"] instanceof Uint8Array &&
  v["hours"].length === v["wind"].length;

/** A property value the API gives as a string or number (null or absent: null). */
const scalar = (v: unknown): string | number | null => (isString(v) || isNumber(v) ? v : null);

/**
 * One feature of the climate-stations collection (GeoJSON: geometry.coordinates [lon, lat] and the
 * requested properties) as a StationRecord, or null if it has no position, identifier or hourly record.
 */
function stationFromFeature(f: unknown): StationRecord | null {
  if (!isRecord(f) || !isRecord(f["properties"]) || !isRecord(f["geometry"])) return null;
  const p = f["properties"];
  const coords = f["geometry"]["coordinates"];
  if (!Array.isArray(coords)) return null;
  const lon: unknown = coords[0],
    lat: unknown = coords[1];
  const id = scalar(p["CLIMATE_IDENTIFIER"]);
  const firstDate = p["HLY_FIRST_DATE"];
  if (!isNumber(lon) || !isNumber(lat) || id === null || !isString(firstDate) || !firstDate) return null;
  const elevation = scalar(p["ELEVATION"]);
  return {
    id: String(id),
    rawName: String(scalar(p["STATION_NAME"]) || id), // labelled on use, so label fixes apply to cached lists
    lat,
    lon,
    elevation: elevation === null ? NaN : Number(elevation),
    first: Number(firstDate.slice(0, 4)),
    last: Number(String(scalar(p["HLY_LAST_DATE"])).slice(0, 4)),
  };
}

/** The stations in a climate-stations reply ({ features?: [...] }). */
function stationsFromResponse(json: unknown): StationRecord[] {
  if (!isRecord(json)) throw new Error("Environment Canada's climate service sent an unreadable station list.");
  if (json["features"] === undefined) return [];
  if (!Array.isArray(json["features"]))
    throw new Error("Environment Canada's climate service sent a station list in an unexpected form.");
  return json["features"].flatMap((f: unknown): StationRecord[] => {
    const s = stationFromFeature(f);
    return s ? [s] : [];
  });
}

/** Rough box around Canada: outside it there are no stations to look for. */
export const nearCanada = (lat: number, lon: number): boolean =>
  lat >= 41.5 && lat <= 84 && lon >= -141.5 && lon <= -52;

const KEEP_UPPER = new Set(["AAFC", "CDA", "AUT", "AWOS", "RCS", "CS", "MCS", "EPF", "UA"]);
/** "PINCHER CREEK A" -> "Pincher Creek A" (station codes and suffixes stay as they are). */
export const stationLabel = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => {
      const bare = w.replace(/[^A-Z]/g, "");
      if (bare.length <= 1 || KEEP_UPPER.has(bare) || !/[AEIOUY]/.test(bare)) return w;
      const i = w.search(/[A-Z]/); // keep leading punctuation, e.g. "(AUT)"
      return w.slice(0, i + 1) + w.slice(i + 1).toLowerCase();
    })
    .join(" ");

/**
 * Stations with hourly records within radiusKm of the site, nearest first, each with
 * distance, direction from the site and the years its hourly record covers.
 */
export async function findStations(
  lat: number,
  lon: number,
  { radiusKm = SEARCH_RADIUS_KM, signal }: { radiusKm?: number; signal?: AbortSignal } = {},
): Promise<Station[]> {
  if (!nearCanada(lat, lon)) return [];
  // Lists are fetched and cached per 0.1° tile, so small moves of the pin reuse them.
  const cLat = Math.round(lat * 10) / 10,
    cLon = Math.round(lon * 10) / 10;
  const key = `stations3|${cLat}|${cLon}|${radiusKm}`; // v2: no longer trusts HAS_HOURLY_DATA; v3: raw names
  let list = memoryGet(key, isStationList);
  if (!list) {
    const cached = await dbGet(key, isCachedStationList);
    if (cached && Date.now() - cached.fetchedAt < LIST_TTL_MS) list = cached.list;
  }
  if (!list) {
    const r = radiusKm + 10;
    const dLat = r / 111,
      dLon = r / (111 * Math.max(0.1, Math.cos(rad(cLat))));
    const q = new URLSearchParams({
      // Not HAS_HOURLY_DATA=Y: that flag is "N" for some stations with decades of hourly
      // records (e.g. Stavely AAFC), so keep every station that has hourly dates instead.
      f: "json",
      limit: "5000",
      bbox: [cLon - dLon, cLat - dLat, cLon + dLon, cLat + dLat].map((x) => x.toFixed(3)).join(","),
      properties: "STATION_NAME,CLIMATE_IDENTIFIER,ELEVATION,HLY_FIRST_DATE,HLY_LAST_DATE",
    });
    const text = await getText(`${API}/climate-stations/items?${q}`, signal, "the station list");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error("Environment Canada's climate service sent an unreadable station list.", { cause: e });
    }
    list = stationsFromResponse(json);
    void dbPut(key, { fetchedAt: Date.now(), list } satisfies CachedStationList); // best effort: dbPut never rejects
  }
  memory.set(key, list);
  return list
    .map((s): Station => ({
      ...s,
      name: stationLabel(s.rawName),
      distanceKm: distanceKm(lat, lon, s.lat, s.lon),
      direction: direction(lat, lon, s.lat, s.lon),
    }))
    .filter((s) => s.distanceKm <= radiusKm)
    .toSorted((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Hourly wind speed (km/h at 10 m) for whole years, as parallel arrays of UTC hour
 * numbers (hours since 1970) and speeds. Hours with no reading are simply absent.
 */
export async function fetchStationHours({
  id,
  startYear,
  endYear,
  onProgress,
  signal,
}: StationHoursRequest): Promise<StationHours> {
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  const parts: StationHours[] = Array.from({ length: years.length });
  let done = 0,
    next = 0;
  onProgress?.(0, years.length);
  const worker = async (): Promise<void> => {
    while (next < years.length) {
      const idx = next++;
      const key = `eccc|${id}|${years[idx]}`;
      // oxlint-disable-next-line no-await-in-loop -- worker pool: each worker takes one year at a time to cap concurrent requests
      let part = memoryGet(key, isStationHours) || (await dbGet(key, isStationHours));
      if (!part) {
        // oxlint-disable-next-line no-await-in-loop -- worker pool: each worker takes one year at a time to cap concurrent requests
        part = await fetchStationYear(id, at(years, idx), signal);
        void dbPut(key, part); // past years never change, so they're kept for good (best effort: dbPut never rejects)
      }
      memory.set(key, part);
      parts[idx] = part;
      onProgress?.(++done, years.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, years.length) }, worker));
  const n = parts.reduce((s, p) => s + p.hours.length, 0);
  const hours = new Int32Array(n),
    wind = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    hours.set(p.hours, o);
    wind.set(p.wind, o);
    o += p.hours.length;
  }
  return { hours, wind };
}

async function fetchStationYear(id: string, year: number, signal?: AbortSignal): Promise<StationHours> {
  const q = new URLSearchParams({
    f: "csv",
    CLIMATE_IDENTIFIER: id,
    limit: "10000",
    datetime: `${year}-01-01T00:00:00Z/${year}-12-31T23:59:59Z`,
    properties: "UTC_DATE,WIND_SPEED",
  });
  return parseStationCsv(await getText(`${API}/climate-hourly/items?${q}`, signal, `station data for ${year}`));
}

/** Parses the API's CSV (x, y, UTC_DATE, WIND_SPEED); rows without a wind reading are skipped. */
export function parseStationCsv(text: string): StationHours {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = (lines[0] || "").split(",").map((s) => s.trim());
  const iT = head.indexOf("UTC_DATE"),
    iW = head.indexOf("WIND_SPEED");
  const hours: number[] = [],
    wind: number[] = [];
  if (iT >= 0 && iW >= 0) {
    for (const line of lines.slice(1)) {
      const c = line.split(",");
      const w = c[iW]?.trim();
      if (!w) continue;
      const ms = Date.parse(`${at(c, iT).trim()}Z`);
      const v = Number(w);
      if (!Number.isFinite(ms) || !Number.isFinite(v) || v < 0) continue;
      hours.push(Math.round(ms / 3.6e6));
      wind.push(Math.min(254, Math.round(v)));
    }
  }
  return { hours: Int32Array.from(hours), wind: Uint8Array.from(wind) };
}

async function getText(url: string, signal: AbortSignal | undefined, what: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const retry = attempt < MAX_RETRIES;
    let res: Response | undefined;
    try {
      // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
      res = await fetch(url, signal ? { signal } : {});
      // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
      if (res.ok) return await res.text();
    } catch (e) {
      if (signal?.aborted) throw e;
      if (!retry)
        throw new Error(
          `Couldn't reach Environment Canada's climate service for ${what}: ${e instanceof Error ? e.message : String(e)}`,
          { cause: e },
        );
    }
    if (res && !(res.status === 429 || res.status >= 500))
      throw new Error(`Environment Canada's climate service refused ${what} (${res.status}).`);
    if (!retry)
      throw new Error(`Environment Canada's climate service is busy (${res?.status}). Press Analyse again to resume.`);
    const after = Number(res?.headers.get("retry-after"));
    // oxlint-disable-next-line no-await-in-loop -- retry with backoff: each attempt must wait for the previous one
    await sleep(after > 0 ? after * 1000 : 5000 * (attempt + 1), signal);
  }
}

export function clearStationMemory(): void {
  memory.clear();
}
