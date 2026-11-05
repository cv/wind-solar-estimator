// Which station comparison belongs to what's loaded, and which stations it covers (read by the
// comparison itself and by the station picker).
import { state } from "./state.ts";
import type { DataRequest, RankedStation, StationCompare } from "./state.ts";
import { yearsOverlap } from "./stationText.ts";

/** The site and period a comparison is for: the request key without the station. */
export const siteKey = (r: DataRequest): string =>
  [r.lat.toFixed(4), r.lon.toFixed(4), r.startYear, r.endYear, r.tilt, r.azimuth].join("|");

/** The nearby stations with records in the loaded period. */
export function comparableStations(): RankedStation[] {
  const loaded = state.loaded,
    stations = state.stations;
  if (!loaded || stations.status !== "ready") return [];
  return stations.list.filter((s) => yearsOverlap(s, loaded.req) >= 1);
}

/** The comparison for the loaded site and period, if one was started. */
export function currentCompare(): StationCompare | null {
  const c = state.compare,
    loaded = state.loaded;
  return c && loaded && c.key === siteKey(loaded.req) ? c : null;
}
