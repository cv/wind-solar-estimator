// Ground elevation at a point from Open-Meteo's terrain model, cached in memory and IndexedDB.

import { dbGet, dbPut, memory, memoryGet } from "./cache.ts";
import { isNumber, isRecord } from "../util/guards.ts";

const ELEVATION_API = "https://api.open-meteo.com/v1/elevation";

/** Ground elevation (m) at a point from Open-Meteo's 90 m terrain model, or null if unavailable. */
export async function siteElevation(lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  const key = `elev|${lat.toFixed(3)}|${lon.toFixed(3)}`;
  const remembered = memoryGet(key, isNumber);
  if (remembered !== undefined) return remembered;
  let elevation = await dbGet(key, isNumber);
  if (!Number.isFinite(elevation)) {
    try {
      const res = await fetch(
        `${ELEVATION_API}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`,
        signal ? { signal } : {},
      );
      elevation = res.ok ? firstElevation(await res.json()) : NaN;
    } catch {
      elevation = NaN;
    }
    if (!Number.isFinite(elevation)) return null; // not cached: try again next time
    void dbPut(key, elevation); // best effort: dbPut never rejects
  }
  memory.set(key, elevation);
  return elevation;
}

/** The value from Open-Meteo's elevation reply ({ elevation: [metres] }, one per point), or NaN. */
function firstElevation(json: unknown): number {
  if (!isRecord(json) || !Array.isArray(json["elevation"])) return NaN;
  const value: unknown = json["elevation"][0];
  return isNumber(value) ? value : NaN;
}
