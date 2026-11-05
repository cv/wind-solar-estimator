// Measured wind: finding nearby stations, choosing one, and the "Wind data" picker.
import { ELEVATION_SAY_M } from "../app/constants.ts";
import { $, form } from "../app/dom.ts";
import { fmt } from "../app/format.ts";
import { hooks } from "../app/hooks.ts";
import { state } from "../app/state.ts";
import type { ChosenStation, RankedStation } from "../app/state.ts";
import { autoEligible, fromSite, missingYears, riseText, stationPlace, yearsOverlap } from "../app/stationText.ts";
import type { Period } from "../app/stationText.ts";
import { siteElevation } from "../data/elevation.ts";
import { SEARCH_RADIUS_KM, nearCanada, findStations } from "../data/stations.ts";
import { renderStationPins } from "./map.ts";
import { pickStation } from "../wind/stationChoice.ts";

/** Starts (or reuses) the search for stations around the pin; resolves to a list, or null if the search failed. */
export function loadStations(): Promise<RankedStation[] | null> {
  const lat = Number(form.elements.lat.value),
    lon = Number(form.elements.lon.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return Promise.resolve([]);
  const key = `${lat.toFixed(3)}|${lon.toFixed(3)}`;
  const current = state.stations;
  if (current.key === key && current.promise) return current.promise;
  // Each station's height above (+) or below (−) the site; "auto" weighs it against distance.
  const promise: Promise<RankedStation[] | null> = Promise.all([findStations(lat, lon), siteElevation(lat, lon)])
    .then(([list, elevation]) =>
      list.map((s): RankedStation => ({
        ...s,
        rise: elevation === null || !Number.isFinite(s.elevation) ? NaN : s.elevation - elevation,
      })),
    )
    .catch((e: unknown): null => {
      console.warn(e);
      return null;
    });
  state.stations = { key, promise };
  renderStationPicker();
  promise
    .then((list): void => {
      if (state.stations.key !== key) return;
      state.stations.list = list;
      renderStationPicker();
    })
    .catch((e: unknown) => {
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
  if (choice === "model" || !list?.length) return null;
  if (choice.startsWith("eccc:")) {
    const picked = list.find((s) => s.id === choice.slice(5));
    if (picked) return { ...picked, explicit: true };
  }
  return pickStation(list, autoEligible(req), missingYears(req));
}

/** The "Wind data" picker, its hint and the station pins on the map. */
export function renderStationPicker(): void {
  const sel = $("#stationSelect", HTMLSelectElement);
  const hint = $("#stationHint");
  const lat = Number(form.elements.lat.value),
    lon = Number(form.elements.lon.value);
  const { list } = state.stations;
  const choice = form.elements.windSource.value;
  // The period, read leniently: validation messages belong to Analyse, not to this picker.
  const years = Number(form.elements.years.value),
    endYear = Number(form.elements.endYear.value);
  const req: Period | null =
    years >= 1 && endYear > 1900 ? { startYear: endYear - Math.round(years) + 1, endYear } : null;
  const active = list && req ? resolveStation(choice, list, req) : null;

  sel.replaceChildren(new Option("Weather model only (ERA5)", "model"));
  for (const s of list || []) {
    const o = new Option(`${s.name}, ${stationPlace(s)} · ${s.first}–${s.last}`, `eccc:${s.id}`);
    if (req && yearsOverlap(s, req) < 1) {
      o.disabled = true;
      o.text += " (no records for these years)";
    }
    sel.add(o);
  }
  sel.value = active ? `eccc:${active.id}` : "model";

  let text: string;
  if (!nearCanada(lat, lon))
    text = "Measured station data is available for sites in Canada. Elsewhere the tool uses the weather model.";
  else if (list === undefined) text = "Looking for nearby weather stations…";
  else if (list === null) text = "Couldn't load the list of weather stations, so the weather model is used.";
  else if (!list.length)
    text = `No Environment Canada station with hourly records within ${SEARCH_RADIUS_KM} km, so the weather model is used.`;
  // active implies req (it is resolved from it above).
  else if (active && req) {
    text = `Hourly wind measured at ${active.name}, ${fromSite(active)}${riseText(active, " and ")}. Hours the station missed are filled from the weather model.`;
    const nearest = active.explicit ? null : list.find(autoEligible(req));
    if (nearest && nearest.id !== active.id) {
      const gap = missingYears(req)(nearest) - missingYears(req)(active);
      const why =
        Math.abs(nearest.rise) - Math.abs(active.rise) >= ELEVATION_SAY_M
          ? `${fmt(Math.abs(nearest.rise))} m ${nearest.rise > 0 ? "higher" : "lower"}`
          : gap > 0
            ? `its records cover ${gap} fewer year${gap === 1 ? "" : "s"} of the period`
            : "a weaker match";
      text += ` Chosen over ${nearest.name}, which is ${nearest.distanceKm < active.distanceKm - 0.5 ? "closer" : "as close"} but ${why}.`;
    }
  } else text = "Pick a station to use its measured wind instead of the weather model's.";
  hint.textContent = text;
  renderStationPins(list || [], active);
}

export function chooseWindSource(value: string): void {
  form.elements.windSource.value = value;
  renderStationPicker();
  hooks.onChange("windSource");
}
