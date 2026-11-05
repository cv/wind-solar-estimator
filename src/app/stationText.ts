// Pure wording and checks about weather stations, shared by the report and the station picker.
import { AUTO_STATION_KM, ELEVATION_SAY_M } from "./constants.ts";
import { fmt } from "./format.ts";
import type { DataRequest, RankedStation } from "./state.ts";
import type { Station } from "../data/stations.ts";

/** The years a run covers (inclusive), as resolveStation and its helpers read them. */
export type Period = Pick<DataRequest, "startYear" | "endYear">;

export const yearsOverlap = (s: Station, req: Period): number =>
  Math.min(s.last, req.endYear) - Math.max(s.first, req.startYear) + 1;

/** Years of the period a station's record doesn't cover. */
export const missingYears =
  (req: Period) =>
  (s: Station): number =>
    req.endYear - req.startYear + 1 - Math.max(0, yearsOverlap(s, req));

/** Stations "auto" may use: close enough, with enough years of records in the period. */
export const autoEligible =
  (req: Period) =>
  (s: Station): boolean =>
    s.distanceKm <= AUTO_STATION_KM && yearsOverlap(s, req) >= Math.min(5, req.endYear - req.startYear + 1);

export const stationPlace = (s: Station): string =>
  s.distanceKm < 1 ? "at the site" : `${fmt(s.distanceKm)} km ${s.direction}`;
export const fromSite = (s: Station): string => (s.distanceKm < 1 ? "at the site" : `${stationPlace(s)} of the site`);
/** ", 330 m higher" when the height difference is worth mentioning. */
export const riseText = (s: RankedStation, joiner: string = ", "): string =>
  Math.abs(s.rise) >= ELEVATION_SAY_M ? `${joiner}${fmt(Math.abs(s.rise))} m ${s.rise > 0 ? "higher" : "lower"}` : "";
