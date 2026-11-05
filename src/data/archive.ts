// One year of hourly weather from Open-Meteo's historical archive API (ERA5 reanalysis):
// the request, the retry policy and the checks on its reply.

import { isArrayOf, isNumber, isNumberOrNull, isRecord, isString } from "../util/guards.ts";
import { errorMessage, fetchOnce, succeeded, tryAgain, withRetries, type Attempt } from "./retry.ts";

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const ARCHIVE_COMMERCIAL = "https://customer-archive-api.open-meteo.com/v1/archive";
const MAX_RETRIES = 4;
const BACKOFF_MS = 10_000;

/** A successful Open-Meteo archive API reply (JSON, timeformat=unixtime), the fields used here. */
export interface ArchiveData {
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone: string;
  utc_offset_seconds?: number;
  hourly: {
    time: number[];
    wind_speed_10m: Array<number | null>;
    wind_speed_100m: Array<number | null>;
    temperature_2m: Array<number | null>;
    global_tilted_irradiance: Array<number | null>;
  };
}

export interface YearRequest {
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

/** A reply that arrived in full: its status and body. */
interface Reply {
  res: Response;
  text: string;
}

const optionalNumber = (v: unknown): boolean => v === undefined || isNumber(v);

/** An hourly column as long as the time column. */
const isColumn = (v: unknown, n: number): v is Array<number | null> => isArrayOf(v, isNumberOrNull) && v.length === n;

/** Checks the fields of an archive reply that compactYear reads. */
function isArchiveData(v: unknown): v is ArchiveData {
  if (!isRecord(v) || !isNumber(v["latitude"]) || !isNumber(v["longitude"]) || !isString(v["timezone"])) return false;
  if (!optionalNumber(v["elevation"]) || !optionalNumber(v["utc_offset_seconds"])) return false;
  const h = v["hourly"];
  if (!isRecord(h) || !isArrayOf(h["time"], isNumber)) return false;
  const n = h["time"].length;
  return (
    isColumn(h["wind_speed_10m"], n) &&
    isColumn(h["wind_speed_100m"], n) &&
    isColumn(h["temperature_2m"], n) &&
    isColumn(h["global_tilted_irradiance"], n)
  );
}

/** The archive API URL for one calendar year at a site (the commercial endpoint when there is a key). */
function archiveUrl({ lat, lon, year, tilt, azimuth, apiKey }: YearRequest): string {
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
  if (apiKey !== undefined && apiKey !== "") {
    q.set("apikey", apiKey);
    return `${ARCHIVE_COMMERCIAL}?${q}`;
  }
  return `${ARCHIVE}?${q}`;
}

/** The body as JSON, or null if it isn't JSON (e.g. a proxy error page). */
function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Why a reply failed: the API's reason (error replies are { error: true, reason: "..." }), else the body or status text. */
function failureReason(json: unknown, { res, text }: Reply): string {
  const reason = isRecord(json) ? json["reason"] : undefined;
  if (isString(reason) && reason !== "") return reason;
  const body = text.slice(0, 120).trim();
  return body === "" ? res.statusText : body;
}

/** Accepts a valid reply, asks to retry rate limits, server errors and garbled replies, and throws otherwise. */
function checkReply(reply: Reply, year: number, retryAllowed: boolean): Attempt<ArchiveData> {
  const { res } = reply;
  const json = parseJsonOrNull(reply.text);
  if (res.ok && isArchiveData(json)) return succeeded(json);
  const reason = failureReason(json, reply);
  if (res.status === 429 && /daily|hourly/iu.test(reason)) {
    throw new Error(`Open-Meteo's free usage limit was reached (${reason}). Try again later, or use an API key.`);
  }
  // A 400 means a bad request, so don't retry it.
  if (retryAllowed && (res.ok || res.status === 429 || res.status >= 500)) return tryAgain(res);
  throw new Error(`Weather data for ${year} failed (${res.status}): ${reason}. Press Analyse again to resume.`);
}

/** Fetches and reads a whole reply; throws on network errors (including a body cut short). */
async function readReply(url: string, signal: AbortSignal | undefined): Promise<Reply> {
  const res = await fetchOnce(url, signal);
  return { res, text: await res.text() };
}

/** One calendar year of hourly weather for a site, retrying network hiccups, rate limits and server errors. */
export async function fetchYear(req: YearRequest): Promise<ArchiveData> {
  const url = archiveUrl(req);
  const { year, signal } = req;
  return withRetries({ maxRetries: MAX_RETRIES, backoffMs: BACKOFF_MS, signal }, async (retryAllowed) => {
    let reply: Reply;
    try {
      reply = await readReply(url, signal);
    } catch (e) {
      if (signal?.aborted === true) throw e;
      if (retryAllowed) return tryAgain(); // network hiccup
      throw new Error(`Couldn't reach the weather service for ${year}: ${errorMessage(e)}`, { cause: e });
    }
    return checkReply(reply, year, retryAllowed);
  });
}
