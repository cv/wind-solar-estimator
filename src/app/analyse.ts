// Running an analysis: download weather (and station) data when needed, simulate, render; re-run on change.
import { API_KEY_STORAGE, MIN_AUTO_COVERAGE } from "./constants.ts";
import type { FormInput } from "./constants.ts";
import { $, form, formError, status } from "./dom.ts";
import { setForm, readForm, writeHash, InputError, dataRequest, modelParams, loadPreset } from "./form.ts";
import { esc } from "./format.ts";
import { state, runCtl } from "./state.ts";
import type { ChosenStation, DataRequest, WindSource } from "./state.ts";
import { fetchStationHours } from "../data/stations.ts";
import type { StationHours } from "../data/stations.ts";
import { fetchWeather } from "../data/weather.ts";
import type { Weather } from "../data/weather.ts";
import { checkCurve } from "../model/powerCurve.ts";
import { simulate } from "../model/simulate.ts";
import type { ModelParams } from "../model/simulate.ts";
import { render } from "../report/render.ts";
import { loadStations, resolveStation, renderStationPicker } from "../ui/stationPicker.ts";
import { blendStation } from "../wind/blend.ts";

/** A station's hourly readings, or why they failed to load. */
export type StationObs = StationHours | { error: string };

/** The weather a run uses and where its wind came from (null: the weather model alone). */
export interface CombinedWind {
  wx: Weather;
  source: WindSource | null;
}

export const requestKey = (r: DataRequest): string =>
  [r.lat.toFixed(4), r.lon.toFixed(4), r.startYear, r.endYear, r.tilt, r.azimuth, r.station?.id ?? "model"].join("|");

export async function analyse({ fetchIfNeeded = true }: { fetchIfNeeded?: boolean } = {}): Promise<void> {
  clearInvalidMarks();
  const v = readForm();
  const inputs = readInputs(v, fetchIfNeeded);
  if (!inputs) return;
  const { req, params } = inputs;

  req.station = resolveStation(v.windSource, await loadStations(), req);
  if (requestKey(req) !== state.wxKey) {
    if (!fetchIfNeeded) {
      reportStale();
      return;
    }
    if (!(await loadWeather(req))) return;
  }

  // Past the block above, wx was loaded for this request (wxKey matches), so this never returns.
  const { wx } = state;
  if (!wx) return;
  simulateAndRender(wx, v, params);
  if (fetchIfNeeded) revealReport();
}

/** Clears the marks and message a previous run left on invalid fields. */
function clearInvalidMarks(): void {
  for (const el of form.querySelectorAll(".invalid")) {
    el.classList.remove("invalid");
    el.removeAttribute("aria-invalid");
    el.removeAttribute("aria-describedby");
  }
  formError("");
}

/** The data request and model parameters from the form, or null after showing (and, if asked, focusing) what's wrong. */
function readInputs(v: FormInput, focus: boolean): { req: DataRequest; params: ModelParams } | null {
  try {
    const req = dataRequest(v);
    return { req, params: modelParams(v) };
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    formError(e.message, e.field);
    if (focus && e.field) {
      const group = e.field.closest("details");
      if (group) group.open = true;
      e.field.focus();
    }
    return null;
  }
}

/** Says the shown report no longer matches the form (when there is one and nothing is loading). */
function reportStale(): void {
  if (state.result && !state.loading)
    status(
      "The location, period, panel orientation or wind data changed. Press <strong>Analyse this site</strong> to load weather data for it.",
      "stale",
    );
}

/**
 * Downloads the weather (and station readings) for req into state, cancelling any earlier download.
 * Resolves to whether this run is still current and its data loaded.
 */
async function loadWeather(req: DataRequest): Promise<boolean> {
  const token = ++runCtl.token;
  runCtl.abortCtl?.abort();
  const abortCtl = new AbortController();
  runCtl.abortCtl = abortCtl;
  const runBtn = $("#run", HTMLButtonElement);
  runBtn.disabled = true;
  runBtn.textContent = "Loading weather…";
  state.loading = true;
  const showProgress = progressReporter(req, () => token === runCtl.token, runBtn);
  try {
    const [wx, obs] = await downloadAll(req, abortCtl.signal, showProgress);
    if (token !== runCtl.token) return false;
    Object.assign(state, { ...combineWind(wx, obs, req.station), wxKey: requestKey(req), req });
    return true;
  } catch (e: unknown) {
    if (token !== runCtl.token || (e instanceof Error && e.name === "AbortError")) return false;
    status(esc((e instanceof Error && e.message) || String(e)), "error");
    return false;
  } finally {
    if (token === runCtl.token) {
      runBtn.disabled = false;
      runBtn.textContent = "Analyse this site";
      state.loading = false;
    }
  }
}

type DownloadPart = "model" | "station";
type ProgressFn = (done: number, total: number) => void;

/** Progress callbacks for each download: they update the button and status while the run is current. */
function progressReporter(
  req: DataRequest,
  isCurrent: () => boolean,
  runBtn: HTMLButtonElement,
): (part: DownloadPart) => ProgressFn {
  const period = req.startYear === req.endYear ? String(req.endYear) : `${req.startYear}–${req.endYear}`;
  // Weather model and station years download side by side; progress counts both.
  const progress: Record<DownloadPart, [done: number, total: number]> = {
    model: [0, req.endYear - req.startYear + 1],
    station: [0, req.station ? req.endYear - req.startYear + 1 : 0],
  };
  const what = req.station ? `hourly weather and ${esc(req.station.name)} station readings` : "hourly weather";
  return (part) => (done, total) => {
    if (!isCurrent()) return;
    progress[part] = [done, total];
    const d = progress.model[0] + progress.station[0],
      t = progress.model[1] + progress.station[1];
    runBtn.textContent = `Loading weather… ${Math.round((100 * d) / t)}%`;
    status(
      `Loading ${what} for ${period}…<div class="progress"><div style="width:${Math.round((100 * d) / t)}%"></div></div>`,
    );
  };
}

/** The weather model's hours and, with a station, its readings (or why they failed), downloaded side by side. */
async function downloadAll(
  req: DataRequest,
  signal: AbortSignal,
  showProgress: (part: DownloadPart) => ProgressFn,
): Promise<[Weather, StationObs | null]> {
  return Promise.all<[Promise<Weather>, Promise<StationObs> | null]>([
    fetchWeather({ ...req, signal, onProgress: showProgress("model") }),
    req.station ? fetchStationObs(req.station, req, signal, showProgress("station")) : null,
  ]);
}

/** A station's readings for the period; a failure (other than cancelling) becomes an error to report. */
async function fetchStationObs(
  station: ChosenStation,
  req: DataRequest,
  signal: AbortSignal,
  onProgress: ProgressFn,
): Promise<StationObs> {
  return fetchStationHours({
    id: station.id,
    startYear: req.startYear,
    endYear: req.endYear,
    signal,
    onProgress,
  }).catch((e: unknown): StationObs => {
    if (signal.aborted) throw e;
    return { error: (e instanceof Error && e.message) || String(e) };
  });
}

/** Simulates with these parameters (and the capped or uncapped variant the power-curve check calls for), then renders. */
function simulateAndRender(wx: Weather, v: FormInput, params: ModelParams): void {
  state.params = params;
  state.result = simulate(wx, params);
  const check = checkCurve(params.curvePts, params.captureAreaM2, params.augmentation);
  state.capped = check.exceeds && !params.clampPhysics ? simulate(wx, { ...params, clampPhysics: true }) : null;
  // With the cap on, the uncapped run says what the cap took away (after losses, so it matches the figures).
  state.uncapped = check.exceeds && params.clampPhysics ? simulate(wx, { ...params, clampPhysics: false }) : null;
  status("");
  render(v, check);
}

/** In the single-column layout the report sits below the form, so bring it into view. */
function revealReport(): void {
  if (!matchMedia("(max-width: 960px)").matches) return;
  $("#results").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

/** Reports a failure nothing else caught (a bug, not bad input): logged, and shown as an error status. */
export function showFailure(e: unknown): void {
  // eslint-disable-next-line no-console -- intended: an unexpected bug's details belong in the developer console
  console.error(e);
  status(esc((e instanceof Error && e.message) || String(e)), "error");
}

/** Starts analyse without waiting for it (event handlers); a failure is reported by showFailure. */
export function startAnalyse(opts?: { fetchIfNeeded?: boolean }): void {
  analyse(opts).catch(showFailure);
}

/**
 * Uses the station's readings when it has enough of them (any amount above the minimum
 * when picked by hand); otherwise the weather model, with a note saying why.
 */
export function combineWind(
  wx: Weather,
  obs: StationObs | null,
  station: ChosenStation | null | undefined,
): CombinedWind {
  // obs is null only when there was no station to read.
  if (!station || !obs) return { wx, source: null };
  if ("error" in obs) return { wx, source: { station, error: obs.error } };
  const blended = blendStation(wx, obs);
  if (!blended || (!station.explicit && blended.stats.coverage < MIN_AUTO_COVERAGE)) {
    return { wx, source: { station, unused: blended ? blended.stats.coverage : 0 } };
  }
  return { wx: blended.wx, source: { station, stats: blended.stats } };
}

export function onChange(name: string): void {
  if (name === "apiKey") {
    localStorage.setItem(API_KEY_STORAGE, form.elements.apiKey.value.trim());
    return;
  }
  if (name === "loadProfile") {
    const preset = loadPreset(form.elements.loadProfile.value);
    if (preset) setForm({ loadHourly: preset.hourly.join(", "), loadMonthly: preset.monthly.join(", ") });
  }
  if (name === "loadHourly" || name === "loadMonthly") form.elements.loadProfile.value = "custom";
  if (name === "lat" || name === "lon") {
    const lat = Number(form.elements.lat.value),
      lon = Number(form.elements.lon.value);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90) state.marker?.setLatLng([lat, lon]);
  }
  writeHash(readForm());
  clearTimeout(runCtl.debounce);
  runCtl.debounce = setTimeout(() => {
    if (name === "lat" || name === "lon" || name === "years" || name === "endYear")
      loadStations().then(renderStationPicker).catch(showFailure);
    startAnalyse({ fetchIfNeeded: false });
  }, 250);
}
