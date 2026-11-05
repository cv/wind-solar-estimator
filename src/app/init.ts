// Start-up: fill the form from the URL, set up the map and wire every event handler.
import { analyse, onChange, showFailure, startAnalyse } from "./analyse.ts";
import { MONTHS, API_KEY_STORAGE, DEFAULTS, DEFAULTS_V1 } from "./constants.ts";
import type { FormOverrides } from "./constants.ts";
import { $, form, flash, isFormField, status } from "./dom.ts";
import { hooks } from "./hooks.ts";
import { setForm, readForm, writeHash, readHash, syncCapture, loadPreset } from "./form.ts";
import { state } from "./state.ts";
import { clearStationMemory } from "../data/stations.ts";
import { clearWeatherCache } from "../data/weather.ts";
import { LOAD_PRESETS } from "../model/load.ts";
import { renderSoc } from "../report/charts.ts";
import { downloadCsv } from "../report/csv.ts";
import { initMap, setLocation, placeSearch } from "../ui/map.ts";
import { loadStations, renderStationPicker, chooseWindSource } from "../ui/stationPicker.ts";

const resizeCharts = (): void => {
  for (const c of Object.values(state.charts)) c.resize();
};

export function init(): void {
  hooks.onChange = onChange;
  hooks.analyse = () => startAnalyse();
  fillSelects();
  const fromHash = restoreForm();
  initSite();
  wireForm();
  wireSiteSearch();
  wireReport();
  wirePrint();
  setChartDefaults();
  if ("lat" in fromHash) startAnalyse(); // opened from a shared link
}

/** The load-profile presets and the battery chart's months. */
function fillSelects(): void {
  const sel = form.elements.loadProfile;
  const presets: Array<[string, { label: string }]> = [
    ...Object.entries(LOAD_PRESETS),
    ["custom", { label: "Custom (edit below)" }],
  ];
  for (const [key, preset] of presets) sel.add(new Option(preset.label, key));
  const socMonth = $("#socMonth", HTMLSelectElement);
  for (const [i, m] of MONTHS.entries()) socMonth.add(new Option(m, String(i)));
}

/** Fills the form from the URL (a link from before HASH_VERSION over the old defaults) and the stored API key; returns what the URL set. */
function restoreForm(): FormOverrides {
  const hashKeys = [...new URLSearchParams(location.hash.slice(1)).keys()];
  const oldLink = hashKeys.length > 0 && !hashKeys.includes("v"); // a link from before HASH_VERSION
  const hashValues = readHash();
  const fromHash: FormOverrides = oldLink ? { ...DEFAULTS_V1, ...hashValues } : hashValues;
  if (("lat" in fromHash || "lon" in fromHash) && !("place" in fromHash)) fromHash.place = "";
  const preset = loadPreset(fromHash.loadProfile);
  if (preset) Object.assign(fromHash, { loadHourly: preset.hourly.join(", "), loadMonthly: preset.monthly.join(", ") });
  setForm({ ...DEFAULTS, ...fromHash });
  syncCapture();
  form.elements.apiKey.value = localStorage.getItem(API_KEY_STORAGE) ?? "";
  $("#placeSearch", HTMLInputElement).value = form.elements.place.value;
  return fromHash;
}

/** The map, the "Wind data" picker and the first station search. */
function initSite(): void {
  initMap({ onPinClick: chooseWindSource });
  const stationSelect = $("#stationSelect", HTMLSelectElement);
  stationSelect.addEventListener("change", () => chooseWindSource(stationSelect.value));
  void loadStations(); // never rejects: a failed search resolves to null
}

/** Submitting and editing the form, and resetting the power curve. */
function wireForm(): void {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    startAnalyse();
  });
  form.addEventListener("input", (e) => {
    const target = e.target;
    if (!isFormField(target) || !target.name) return;
    if (target.name === "lat" || target.name === "lon") {
      form.elements.place.value = "";
      form.elements.windSource.value = "auto";
    }
    if (target.name.startsWith("capture")) syncCapture();
    onChange(target.name);
  });
  $("#resetCurve").addEventListener("click", () => {
    form.elements.curve.value = DEFAULTS.curve;
    onChange("curve");
  });
}

/** The place search box and the example site. */
function wireSiteSearch(): void {
  $("#placeSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      placeSearch().catch(showFailure);
    }
  });
  $("#placeGo").addEventListener("click", () => {
    placeSearch().catch(showFailure);
  });
  $("#tryExample").addEventListener("click", () => {
    setLocation(Number(DEFAULTS.lat), Number(DEFAULTS.lon), DEFAULTS.place, { pan: true });
    startAnalyse();
  });
}

/** The report's controls: battery month, CSV, note buttons, print, share and clearing the cache. */
function wireReport(): void {
  $("#socMonth").addEventListener("change", renderSoc);
  $("#csv").addEventListener("click", downloadCsv);
  $("#notes").addEventListener("click", useYearsFromNote);
  $("#print").addEventListener("click", () => globalThis.print());
  $("#share").addEventListener("click", () => {
    shareLink().catch(showFailure);
  });
  $("#clearCache").addEventListener("click", () => {
    clearCache().catch(showFailure);
  });
}

/** "Use 2008–2025 only" in a station-record note: narrow the period to after the step. */
function useYearsFromNote(e: Event): void {
  if (!(e.target instanceof Element)) return;
  const b = e.target.closest<HTMLButtonElement>("button[data-years]");
  const years = b?.dataset["years"],
    end = b?.dataset["end"];
  if (years === undefined || end === undefined) return;
  form.elements.years.value = years;
  form.elements.endYear.value = end;
  writeHash(readForm());
  loadStations()
    .then(renderStationPicker)
    .then(async () => analyse())
    .catch(showFailure);
}

/** A printed report shows everything: expand collapsed sections, then restore them. */
function wirePrint(): void {
  let closedForPrint: HTMLDetailsElement[] = [];
  globalThis.addEventListener("beforeprint", () => {
    closedForPrint = [...document.querySelectorAll<HTMLDetailsElement>("#results details:not([open])")];
    for (const d of closedForPrint) d.open = true;
    resizeCharts();
  });
  globalThis.addEventListener("afterprint", () => {
    for (const d of closedForPrint) d.open = false;
    resizeCharts();
  });
}

/** Chart.js styling to match the page, or a note that charts are unavailable. */
function setChartDefaults(): void {
  if (typeof Chart === "undefined") {
    status("Charts library failed to load; figures will still be calculated.", "error");
    return;
  }
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = "#556074";
  Chart.defaults.borderColor = "#e6e9f2";
  Chart.defaults.font.size = 12;
}

/** Puts a link to this site and these assumptions in the URL and on the clipboard (or in a prompt to copy it). */
async function shareLink(): Promise<void> {
  writeHash(readForm());
  try {
    await navigator.clipboard.writeText(location.href);
    flash($("#share"), "Link copied");
    status("Link copied. Anyone opening it sees this site with these assumptions.");
  } catch {
    globalThis.prompt("Copy this link:", location.href);
  }
}

/** Forgets downloaded weather and station data, then searches for stations afresh. */
async function clearCache(): Promise<void> {
  await clearWeatherCache();
  clearStationMemory();
  state.loaded = null;
  state.stations = { key: null, status: "loading" };
  void loadStations(); // never rejects: a failed search resolves to null
  flash($("#clearCache"), "Cache cleared");
  status("Cached weather data cleared.");
}
