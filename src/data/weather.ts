// Historical hourly weather from Open-Meteo (ERA5 reanalysis) for a site.
// The API allows browser (CORS) requests, so no server is needed.
// Free tier: non-commercial use only, ~10,000 weighted calls per day per IP;
// 20 years for one site costs about 500 of those. Commercial use needs an API key.

import { dbGet, dbPut, dbClear } from "./cache.ts";

const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";
const ARCHIVE_COMMERCIAL = "https://customer-archive-api.open-meteo.com/v1/archive";
const CONCURRENCY = 4;
const MAX_RETRIES = 4;

const memory = new Map();
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
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
export async function fetchWeather({ lat, lon, startYear, endYear, tilt, azimuth, apiKey, onProgress, signal }) {
  lat = Math.round(lat * 1e4) / 1e4;
  lon = Math.round(lon * 1e4) / 1e4;
  const key = [lat, lon, startYear, endYear, tilt, azimuth].join("|");
  if (memory.has(key)) return memory.get(key);

  // Each year is cached on its own, so a failed or interrupted download resumes where it stopped.
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  const parts: any[] = Array.from({ length: years.length });
  let done = 0;
  onProgress?.(0, years.length);

  let next = 0;
  const worker = async () => {
    while (next < years.length) {
      const idx = next++;
      const yearKey = ["y", lat, lon, years[idx], tilt, azimuth].join("|");
      let part = await dbGet(yearKey);
      if (!part) {
        part = compactYear(await fetchYear({ lat, lon, year: years[idx], tilt, azimuth, apiKey, signal }));
        dbPut(yearKey, part); // best effort, not awaited
      }
      parts[idx] = part;
      onProgress?.(++done, years.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, years.length) }, worker));

  const offset = parts[0].offset;
  const cols = { t: [], year: [], month: [], hour: [], w10: [], w100: [], temp: [], gti: [] };
  let missing = 0;
  for (const part of parts) {
    for (let i = 0; i < part.time.length; i++) {
      const w10 = part.w10[i],
        w100 = part.w100[i],
        t = part.temp[i],
        g = part.gti[i];
      if (Number.isNaN(w10) || Number.isNaN(w100) || Number.isNaN(t) || Number.isNaN(g)) {
        missing++;
        continue;
      }
      const d = new Date((part.time[i] + offset) * 1000);
      cols.t.push(Math.round(part.time[i] / 3600)); // UTC hour number, to line up with station records
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

  const wx = {
    n: cols.w10.length,
    missing,
    years: years.length,
    startYear,
    endYear,
    gridLat: parts[0].latitude,
    gridLon: parts[0].longitude,
    elevation: parts[0].elevation,
    timezone: parts[0].timezone,
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

/** Typed arrays keep the IndexedDB cache small; missing values become NaN. */
function compactYear(json) {
  const h = json.hourly;
  const col = (a: (number | null)[]) => Float32Array.from(a, (x) => (x == null ? NaN : x));
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

async function fetchYear({ lat, lon, year, tilt, azimuth, apiKey, signal }) {
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
    let res, text;
    try {
      res = await fetch(url, { signal });
      text = await res.text();
    } catch (e) {
      if (signal?.aborted) throw e;
      if (retry) {
        await wait();
        continue;
      } // network hiccup
      throw new Error(`Couldn't reach the weather service for ${year}: ${e.message}`);
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON, e.g. a proxy error page */
    }

    if (res.ok && json?.hourly?.time) return json;
    const reason = json?.reason || text.slice(0, 120).trim() || res.statusText;
    if (res.status === 429 && /daily|hourly/i.test(reason)) {
      throw new Error(`Open-Meteo's free usage limit was reached (${reason}). Try again later, or use an API key.`);
    }
    // Retry rate limits, server errors and garbled replies; a 400 means a bad request, so don't.
    if (retry && (res.ok || res.status === 429 || res.status >= 500)) {
      const after = Number(res.headers.get("retry-after"));
      await (after > 0 ? sleep(after * 1000, signal) : wait());
      continue;
    }
    throw new Error(`Weather data for ${year} failed (${res.status}): ${reason}. Press Analyse again to resume.`);
  }
}

export async function clearWeatherCache() {
  memory.clear();
  await dbClear();
}
