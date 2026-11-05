// Measured wind: finding nearby stations, choosing one, and the "Wind data" picker.
import { ELEVATION_SAY_M } from "../app/constants.ts";
import { $, form } from "../app/dom.ts";
import { fmt } from "../app/format.ts";
import { hooks } from "../app/hooks.ts";
import { state } from "../app/state.ts";
import type { ChosenStation, RankedStation, StationListState, WindCase } from "../app/state.ts";
import { comparableStations, currentCompare } from "../app/compareState.ts";
import { autoEligible, fromSite, missingYears, riseText, stationPlace, yearsOverlap } from "../app/stationText.ts";
import type { Period } from "../app/stationText.ts";
import { siteElevation } from "../data/elevation.ts";
import { SEARCH_RADIUS_KM, nearCanada, findStations } from "../data/stations.ts";
import { renderStationPins } from "./map.ts";
import { pickStation } from "../wind/stationChoice.ts";

/** Starts (or reuses) the search for stations around the pin; resolves to a list, or null if the search failed. */
export async function loadStations(): Promise<RankedStation[] | null> {
  const lat = Number(form.elements.lat.value),
    lon = Number(form.elements.lon.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return [];
  const key = `${lat.toFixed(3)}|${lon.toFixed(3)}`;
  const current = state.stations;
  if (current.key === key && current.promise) return current.promise;
  // Each station's height above (+) or below (−) the site; "auto" weighs it against distance.
  const promise: Promise<RankedStation[] | null> = Promise.all([findStations(lat, lon), siteElevation(lat, lon)])
    .then(([list, elevation]) =>
      list.map((s): RankedStation => ({
        ...s,
        rise: elevation === null || !Number.isFinite(s.elevation) ? Number.NaN : s.elevation - elevation,
      })),
    )
    .catch((e: unknown): null => {
      // eslint-disable-next-line no-console -- intended: the picker falls back to the weather model; the cause is for developers
      console.warn(e);
      return null;
    });
  state.stations = { key, promise, status: "loading" };
  renderStationPicker();
  promise
    .then((list): void => {
      if (state.stations.key !== key) return;
      state.stations = list ? { key, promise, status: "ready", list } : { key, promise, status: "failed" };
      renderStationPicker();
    })
    .catch((e: unknown) => {
      // eslint-disable-next-line no-console -- intended: a bug while rendering the picker has no other place to surface
      console.error(e);
    });
  return promise;
}

/** The station whose wind to use, or null for the weather model alone. */
export function resolveStation(
  choice: string,
  list: readonly RankedStation[] | null | undefined,
  req: Period,
): ChosenStation | null {
  if (choice === "model" || list == null || list.length === 0) return null;
  if (choice.startsWith("eccc:")) {
    const picked = list.find((s) => s.id === choice.slice(5));
    if (picked) return { ...picked, explicit: true };
  }
  return pickStation(list, autoEligible(req), missingYears(req));
}

/** The "Wind data" picker, its hint and the station pins on the map. */
export function renderStationPicker(): void {
  const lat = Number(form.elements.lat.value),
    lon = Number(form.elements.lon.value);
  const stations = state.stations;
  const list = stations.status === "ready" ? stations.list : [];
  const req = pickerPeriod();
  const active = stations.status === "ready" && req ? resolveStation(form.elements.windSource.value, list, req) : null;
  const cases = currentCompare() ? (state.analysis?.windCases ?? null) : null;
  fillStationOptions($("#stationSelect", HTMLSelectElement), list, req, active, cases);
  $("#stationHint").textContent = stationHint(nearCanada(lat, lon), stations, req, active);
  renderStationPins(list, active, cases);
  renderCompareControl();
}

/** " · pays back in about 19 years" for a compared source ("" when it wasn't compared). */
function caseSuffix(cases: readonly WindCase[] | null, id: string): string {
  const w = cases?.find((c) => c.id === id);
  if (!w) return "";
  if (w.reason !== "") return ` · ${w.reason}`;
  return Number.isFinite(w.payback)
    ? ` · pays back in about ${fmt(w.payback, w.payback < 10 ? 1 : 0)} years`
    : " · never pays back";
}

/** The "Compare the stations" button and its hint: offered once there is a report for what's loaded. */
function renderCompareControl(): void {
  const btn = $("#compareStations", HTMLButtonElement),
    hint = $("#compareHint");
  const c = currentCompare();
  const n = comparableStations().length;
  const a = state.analysis;
  const show = a !== null && a.wx === state.loaded?.wx && n > 0;
  btn.hidden = !show || c?.status === "ready";
  hint.hidden = !show;
  if (!show) return;
  if (c?.status === "ready") {
    hint.textContent = "The payback each station's wind would give is on the map, in the list above and in the report.";
    return;
  }
  btn.disabled = c !== null;
  btn.textContent = c
    ? `Comparing the stations… ${c.winds.length} of ${c.total}`
    : `Compare ${n === 1 ? "the station" : `the ${n} stations`}`;
  hint.textContent = c
    ? "Each station's records are downloaded once and kept in this browser."
    : "See the payback each nearby station's measured wind would give, and the weather model's. Records not kept yet are downloaded first, which can take a minute or two.";
}

/** The period, read leniently: validation messages belong to Analyse, not to this picker. */
function pickerPeriod(): Period | null {
  const years = Number(form.elements.years.value),
    endYear = Number(form.elements.endYear.value);
  return years >= 1 && endYear > 1900 ? { startYear: endYear - Math.round(years) + 1, endYear } : null;
}

/** The picker's options (stations without records for the period disabled), with active selected. */
function fillStationOptions(
  sel: HTMLSelectElement,
  list: readonly RankedStation[],
  req: Period | null,
  active: ChosenStation | null,
  cases: readonly WindCase[] | null,
): void {
  sel.replaceChildren(new Option(`Weather model only (ERA5)${caseSuffix(cases, "model")}`, "model"));
  for (const s of list) {
    const o = new Option(
      `${s.name}, ${stationPlace(s)} · ${s.first}–${s.last}${caseSuffix(cases, s.id)}`,
      `eccc:${s.id}`,
    );
    if (req && yearsOverlap(s, req) < 1) {
      o.disabled = true;
      o.text += " (no records for these years)";
    }
    sel.add(o);
  }
  sel.value = active ? `eccc:${active.id}` : "model";
}

/** The hint under the picker: where the wind comes from, or why there is no station to use. */
function stationHint(
  inCanada: boolean,
  stations: StationListState,
  req: Period | null,
  active: ChosenStation | null,
): string {
  if (!inCanada)
    return "Measured station data is available for sites in Canada. Elsewhere the tool uses the weather model.";
  if (stations.status === "loading") return "Looking for nearby weather stations…";
  if (stations.status === "failed") return "Couldn't load the list of weather stations, so the weather model is used.";
  const { list } = stations;
  if (list.length === 0)
    return `No Environment Canada station with hourly records within ${SEARCH_RADIUS_KM} km, so the weather model is used.`;
  // active implies req (it is resolved from it above).
  if (!active || !req) return "Pick a station to use its measured wind instead of the weather model's.";
  return `Hourly wind measured at ${active.name}, ${fromSite(active)}${riseText(active, " and ")}. Hours the station missed are filled from the weather model.${chosenOver(list, req, active)}`;
}

/** For a station chosen automatically over the nearest eligible one, why it was preferred ("" otherwise). */
function chosenOver(list: readonly RankedStation[], req: Period, active: ChosenStation): string {
  const nearest = active.explicit === true ? null : list.find(autoEligible(req));
  if (!nearest || nearest.id === active.id) return "";
  return ` Chosen over ${nearest.name}, which is ${nearest.distanceKm < active.distanceKm - 0.5 ? "closer" : "as close"} but ${whyNotNearest(nearest, active, req)}.`;
}

/** What made the nearest station a worse choice than active: its elevation, fewer years, or a weaker match overall. */
function whyNotNearest(nearest: RankedStation, active: ChosenStation, req: Period): string {
  if (Math.abs(nearest.rise) - Math.abs(active.rise) >= ELEVATION_SAY_M)
    return `${fmt(Math.abs(nearest.rise))} m ${nearest.rise > 0 ? "higher" : "lower"}`;
  const gap = missingYears(req)(nearest) - missingYears(req)(active);
  if (gap > 0) return `its records cover ${gap} fewer year${gap === 1 ? "" : "s"} of the period`;
  return "a weaker match";
}

export function chooseWindSource(value: string): void {
  form.elements.windSource.value = value;
  renderStationPicker();
  hooks.onChange("windSource");
}
