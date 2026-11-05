// @ts-nocheck -- typed in the first strictness round, after this file is split up
// Running an analysis: download weather (and station) data when needed, simulate, render; re-run on change.
import { API_KEY_STORAGE, MIN_AUTO_COVERAGE } from "./constants.ts";
import { $, form, formError, status } from "./dom.ts";
import { setForm, readForm, writeHash, InputError, dataRequest, modelParams } from "./form.ts";
import { esc } from "./format.ts";
import { state, runCtl } from "./state.ts";
import { fetchStationHours } from "../data/stations.ts";
import { fetchWeather } from "../data/weather.ts";
import { LOAD_PRESETS } from "../model/load.ts";
import { checkCurve } from "../model/powerCurve.ts";
import { simulate } from "../model/simulate.ts";
import { render } from "../report/render.ts";
import { loadStations, resolveStation, renderStationPicker } from "../ui/stationPicker.ts";
import { blendStation } from "../wind/blend.ts";

export const requestKey = (r) =>
  [r.lat.toFixed(4), r.lon.toFixed(4), r.startYear, r.endYear, r.tilt, r.azimuth, r.station?.id ?? "model"].join("|");

export async function analyse({ fetchIfNeeded = true } = {}) {
  form.querySelectorAll(".invalid").forEach((el) => {
    el.classList.remove("invalid");
    el.removeAttribute("aria-invalid");
    el.removeAttribute("aria-describedby");
  });
  formError("");
  const v = readForm();
  let req, params;
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
    const runBtn = $("#run");
    runBtn.disabled = true;
    runBtn.textContent = "Loading weather…";
    const period = req.startYear === req.endYear ? String(req.endYear) : `${req.startYear}–${req.endYear}`;
    state.loading = true;
    // Weather model and station years download side by side; progress counts both.
    const progress = {
      model: [0, req.endYear - req.startYear + 1],
      station: [0, req.station ? req.endYear - req.startYear + 1 : 0],
    };
    const what = req.station ? `hourly weather and ${esc(req.station.name)} station readings` : "hourly weather";
    const showProgress = (part) => (done, total) => {
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
      const [wx, obs] = await Promise.all([
        fetchWeather({ ...req, signal, onProgress: showProgress("model") }),
        req.station
          ? fetchStationHours({
              id: req.station.id,
              startYear: req.startYear,
              endYear: req.endYear,
              signal,
              onProgress: showProgress("station"),
            }).catch((e) => {
              if (signal.aborted) throw e;
              return { error: e.message || String(e) };
            })
          : null,
      ]);
      if (token !== runCtl.token) return;
      Object.assign(state, { ...combineWind(wx, obs, req.station), wxKey: requestKey(req), req });
    } catch (e) {
      if (token !== runCtl.token || e?.name === "AbortError") return;
      status(esc(e.message || e), "error");
      return;
    } finally {
      if (token === runCtl.token) {
        runBtn.disabled = false;
        runBtn.textContent = "Analyse this site";
        state.loading = false;
      }
    }
  }

  state.params = params;
  state.result = simulate(state.wx, params);
  const check = checkCurve(params.curvePts, params.captureAreaM2, params.augmentation);
  state.capped =
    check.worstRatio > 1 && !params.clampPhysics ? simulate(state.wx, { ...params, clampPhysics: true }) : null;
  // With the cap on, the uncapped run says what the cap took away (after losses, so it matches the figures).
  state.uncapped =
    check.worstRatio > 1 && params.clampPhysics ? simulate(state.wx, { ...params, clampPhysics: false }) : null;
  status("");
  render(v, check);
  if (fetchIfNeeded && matchMedia("(max-width: 960px)").matches) {
    // Single-column layout: the report sits below the form, so bring it into view.
    $("#results").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
}

/**
 * Uses the station's readings when it has enough of them (any amount above the minimum
 * when picked by hand); otherwise the weather model, with a note saying why.
 */
export function combineWind(wx, obs, station) {
  if (!station) return { wx, source: null };
  if (obs.error) return { wx, source: { station, error: obs.error } };
  const blended = blendStation(wx, obs);
  if (!blended || (!station.explicit && blended.stats.coverage < MIN_AUTO_COVERAGE)) {
    return { wx, source: { station, unused: blended ? blended.stats.coverage : 0 } };
  }
  return { wx: blended.wx, source: { station, stats: blended.stats } };
}

export function onChange(name) {
  if (name === "apiKey") {
    localStorage.setItem(API_KEY_STORAGE, form.elements.apiKey.value.trim());
    return;
  }
  if (name === "loadProfile") {
    const preset = LOAD_PRESETS[form.elements.loadProfile.value];
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
      loadStations().then(renderStationPicker);
    analyse({ fetchIfNeeded: false });
  }, 250);
}
