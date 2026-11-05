// Running an analysis: download weather (and station) data when needed, simulate, render; re-run on change.
import { API_KEY_STORAGE, MIN_AUTO_COVERAGE } from "./constants.ts";
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
  form.querySelectorAll(".invalid").forEach((el) => {
    el.classList.remove("invalid");
    el.removeAttribute("aria-invalid");
    el.removeAttribute("aria-describedby");
  });
  formError("");
  const v = readForm();
  let req: DataRequest, params: ModelParams;
  try {
    req = dataRequest(v);
    params = modelParams(v);
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    formError(e.message, e.field);
    if (fetchIfNeeded && e.field) {
      const group = e.field.closest("details");
      if (group) group.open = true;
      e.field.focus();
    }
    return;
  }

  req.station = resolveStation(v.windSource, await loadStations(), req);
  if (requestKey(req) !== state.wxKey) {
    if (!fetchIfNeeded) {
      if (state.result && !state.loading)
        status(
          "The location, period, panel orientation or wind data changed. Press <strong>Analyse this site</strong> to load weather data for it.",
          "stale",
        );
      return;
    }
    const token = ++runCtl.token;
    runCtl.abortCtl?.abort();
    runCtl.abortCtl = new AbortController();
    const runBtn = $("#run", HTMLButtonElement);
    runBtn.disabled = true;
    runBtn.textContent = "Loading weather…";
    const period = req.startYear === req.endYear ? String(req.endYear) : `${req.startYear}–${req.endYear}`;
    state.loading = true;
    // Weather model and station years download side by side; progress counts both.
    const progress: Record<"model" | "station", [done: number, total: number]> = {
      model: [0, req.endYear - req.startYear + 1],
      station: [0, req.station ? req.endYear - req.startYear + 1 : 0],
    };
    const what = req.station ? `hourly weather and ${esc(req.station.name)} station readings` : "hourly weather";
    const showProgress = (part: "model" | "station") => (done: number, total: number) => {
      if (token !== runCtl.token) return;
      progress[part] = [done, total];
      const d = progress.model[0] + progress.station[0],
        t = progress.model[1] + progress.station[1];
      runBtn.textContent = `Loading weather… ${Math.round((100 * d) / t)}%`;
      status(
        `Loading ${what} for ${period}…` +
          `<div class="progress"><div style="width:${Math.round((100 * d) / t)}%"></div></div>`,
      );
    };
    try {
      const signal = runCtl.abortCtl.signal;
      const [wx, obs] = await Promise.all<[Promise<Weather>, Promise<StationObs> | null]>([
        fetchWeather({ ...req, signal, onProgress: showProgress("model") }),
        req.station
          ? fetchStationHours({
              id: req.station.id,
              startYear: req.startYear,
              endYear: req.endYear,
              signal,
              onProgress: showProgress("station"),
            }).catch((e: unknown): StationObs => {
              if (signal.aborted) throw e;
              return { error: (e instanceof Error && e.message) || String(e) };
            })
          : null,
      ]);
      if (token !== runCtl.token) return;
      Object.assign(state, { ...combineWind(wx, obs, req.station), wxKey: requestKey(req), req });
    } catch (e: unknown) {
      if (token !== runCtl.token || (e instanceof Error && e.name === "AbortError")) return;
      status(esc((e instanceof Error && e.message) || String(e)), "error");
      return;
    } finally {
      if (token === runCtl.token) {
        runBtn.disabled = false;
        runBtn.textContent = "Analyse this site";
        state.loading = false;
      }
    }
  }

  // Past the block above, wx was loaded for this request (wxKey matches), so this never returns.
  const { wx } = state;
  if (!wx) return;
  state.params = params;
  state.result = simulate(wx, params);
  const check = checkCurve(params.curvePts, params.captureAreaM2, params.augmentation);
  state.capped = check.worstRatio > 1 && !params.clampPhysics ? simulate(wx, { ...params, clampPhysics: true }) : null;
  // With the cap on, the uncapped run says what the cap took away (after losses, so it matches the figures).
  state.uncapped =
    check.worstRatio > 1 && params.clampPhysics ? simulate(wx, { ...params, clampPhysics: false }) : null;
  status("");
  render(v, check);
  if (fetchIfNeeded && matchMedia("(max-width: 960px)").matches) {
    // Single-column layout: the report sits below the form, so bring it into view.
    $("#results").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
}

/** Reports a failure nothing else caught (a bug, not bad input): logged, and shown as an error status. */
export function showFailure(e: unknown): void {
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
