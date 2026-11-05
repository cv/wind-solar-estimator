// "Compare the stations": downloads each nearby station's records for the loaded site and period
// (kept for good, like any station's), blends each into the weather model, and works out the
// payback each would give for the current inputs: on the map, in the picker and in the report.
import { comparableStations, currentCompare, siteKey } from "./compareState.ts";
import { state } from "./state.ts";
import type { Analysis, LoadedWeather, RankedStation, StationCompare, StationWind, WindCase } from "./state.ts";
import { stationPlace } from "./stationText.ts";
import { JOBS_PAUSE_MS, runJobs } from "./jobs.ts";
import { fetchStationHours } from "../data/stations.ts";
import { simulate } from "../model/simulate.ts";
import type { SimResult } from "../model/simulate.ts";
import { renderWindCases } from "../report/windCases.ts";
import { renderStationPicker } from "../ui/stationPicker.ts";
import { blendStation } from "../wind/blend.ts";

let cancel = (): void => {
  // Nothing scheduled yet.
};

/** One station's wind for the loaded site and period: its readings blended in, or why not. */
async function stationWind(
  loaded: LoadedWeather,
  station: RankedStation,
  signal: AbortSignal,
): Promise<StationWind | null> {
  if (loaded.source?.kind === "measured" && loaded.source.station.id === station.id)
    return { station, wx: loaded.wx, reason: "" };
  try {
    const { startYear, endYear } = loaded.req;
    const blended = blendStation(loaded.model, await fetchStationHours({ id: station.id, startYear, endYear, signal }));
    return blended ? { station, wx: blended.wx, reason: "" } : { station, wx: null, reason: "too few readings" };
  } catch {
    return signal.aborted ? null : { station, wx: null, reason: "records couldn't be loaded" };
  }
}

/** Shows the comparison so far: the picker's progress, and the paybacks once worked out. */
function refresh(): void {
  renderStationPicker();
  if (state.analysis) scheduleWindCases(state.analysis, 0);
}

/** Downloads the comparable stations one at a time (a station's years a few at a time), showing each as it arrives. */
export async function compareStations(): Promise<void> {
  const loaded = state.loaded;
  if (!loaded) return;
  state.compare?.abort.abort();
  const stations = comparableStations();
  const c: StationCompare = {
    key: siteKey(loaded.req),
    status: "loading",
    total: stations.length,
    winds: [],
    abort: new AbortController(),
  };
  state.compare = c;
  renderStationPicker();
  for (const station of stations) {
    // oxlint-disable-next-line no-await-in-loop -- one station at a time: a shared public service, and each shows as it arrives
    const wind = await stationWind(loaded, station, c.abort.signal);
    if (!wind || currentCompare() !== c) {
      c.abort.abort();
      return;
    }
    c.winds.push(wind);
    refresh();
  }
  c.status = "ready";
  refresh();
}

const windCase = (id: string, label: string, r: SimResult | null, inUse: boolean, reason = ""): WindCase => ({
  id,
  label,
  payback: r ? r.econ.payback : Number.NaN,
  inUse,
  reason,
});

/** Works out each compared source's payback for analysis a (one run per task), then shows them. */
export function scheduleWindCases(a: Analysis, pause = JOBS_PAUSE_MS): void {
  cancel();
  const c = currentCompare(),
    loaded = state.loaded;
  if (!c || loaded?.wx !== a.wx) return;
  const measured = a.source?.kind === "measured" ? a.source.station.id : null;
  const cases: WindCase[] = [];
  // Stations listed twice under one name (records split at a move or a new instrument) show their years.
  const names = c.winds.map((w) => `${w.station.name}, ${stationPlace(w.station)}`);
  const label = (i: number, s: RankedStation): string => {
    const name = names[i] ?? s.name;
    return names.indexOf(name) === names.lastIndexOf(name) ? name : `${name} (${s.first}–${s.last})`;
  };
  const jobs = [
    (): void => {
      const r = measured === null ? a.result : simulate(loaded.model, a.params);
      cases.push(windCase("model", "Weather model only", r, measured === null));
    },
    ...c.winds.map((w, i) => (): void => {
      const { station: s } = w;
      const inUse = s.id === measured;
      const r = w.wx ? (inUse ? a.result : simulate(w.wx, a.params)) : null;
      cases.push(windCase(s.id, label(i, s), r, inUse, w.reason));
    }),
    (): void => {
      a.windCases = cases;
      renderWindCases(a);
      renderStationPicker();
    },
  ];
  cancel = runJobs(jobs, () => state.analysis === a, pause);
}
