// Ground elevation at a point from Open-Meteo's terrain model, cached in memory and IndexedDB.

import { dbGet, dbPut, memory } from "./cache.ts";

const ELEVATION_API = "https://api.open-meteo.com/v1/elevation";

/** Ground elevation (m) at a point from Open-Meteo's 90 m terrain model, or null if unavailable. */
export async function siteElevation(lat, lon, signal) {
  const key = `elev|${lat.toFixed(3)}|${lon.toFixed(3)}`;
  if (memory.has(key)) return memory.get(key);
  let elevation = await dbGet(key);
  if (!Number.isFinite(elevation)) {
    try {
      const res = await fetch(`${ELEVATION_API}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`, { signal });
      elevation = res.ok ? Number((await res.json()).elevation?.[0]) : NaN;
    } catch {
      elevation = NaN;
    }
    if (!Number.isFinite(elevation)) return null; // not cached: try again next time
    dbPut(key, elevation);
  }
  memory.set(key, elevation);
  return elevation;
}
