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

const resizeCharts = (): void => Object.values(state.charts).forEach((c) => c.resize());

export function init(): void {
  hooks.onChange = onChange;
  hooks.analyse = () => startAnalyse();
  const sel = form.elements.loadProfile;
  const presets: Array<[string, { label: string }]> = [
    ...Object.entries(LOAD_PRESETS),
    ["custom", { label: "Custom (edit below)" }],
  ];
  for (const [key, preset] of presets) sel.add(new Option(preset.label, key));
  MONTHS.forEach((m, i) => $("#socMonth", HTMLSelectElement).add(new Option(m, String(i))));

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
  initMap({ onPinClick: chooseWindSource });
  const stationSelect = $("#stationSelect", HTMLSelectElement);
  stationSelect.addEventListener("change", () => chooseWindSource(stationSelect.value));
  void loadStations(); // never rejects: a failed search resolves to null

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
  $("#placeSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      placeSearch().catch(showFailure);
    }
  });
  $("#placeGo").addEventListener("click", () => {
    placeSearch().catch(showFailure);
  });
  $("#resetCurve").addEventListener("click", () => {
    form.elements.curve.value = DEFAULTS.curve;
    onChange("curve");
  });
  $("#socMonth").addEventListener("change", renderSoc);
  $("#tryExample").addEventListener("click", () => {
    setLocation(Number(DEFAULTS.lat), Number(DEFAULTS.lon), DEFAULTS.place, { pan: true });
    startAnalyse();
  });
  $("#csv").addEventListener("click", downloadCsv);
  // "Use 2008–2025 only" in a station-record note: narrow the period to after the step.
  $("#notes").addEventListener("click", (e) => {
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
  });
  $("#print").addEventListener("click", () => window.print());
  $("#share").addEventListener("click", () => {
    shareLink().catch(showFailure);
  });
  $("#clearCache").addEventListener("click", () => {
    clearCache().catch(showFailure);
  });
  // A printed report shows everything: expand collapsed sections, then restore them.
  let closedForPrint: HTMLDetailsElement[] = [];
  window.addEventListener("beforeprint", () => {
    closedForPrint = [...document.querySelectorAll<HTMLDetailsElement>("#results details:not([open])")];
    closedForPrint.forEach((d) => {
      d.open = true;
    });
    resizeCharts();
  });
  window.addEventListener("afterprint", () => {
    closedForPrint.forEach((d) => {
      d.open = false;
    });
    resizeCharts();
  });

  if (typeof Chart !== "undefined") {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = "#556074";
    Chart.defaults.borderColor = "#e6e9f2";
    Chart.defaults.font.size = 12;
  } else {
    status("Charts library failed to load; figures will still be calculated.", "error");
  }

  if ("lat" in fromHash) startAnalyse(); // opened from a shared link
}

/** Puts a link to this site and these assumptions in the URL and on the clipboard (or in a prompt to copy it). */
async function shareLink(): Promise<void> {
  writeHash(readForm());
  try {
    await navigator.clipboard.writeText(location.href);
    flash($("#share"), "Link copied");
    status("Link copied. Anyone opening it sees this site with these assumptions.");
  } catch {
    window.prompt("Copy this link:", location.href);
  }
}

/** Forgets downloaded weather and station data, then searches for stations afresh. */
async function clearCache(): Promise<void> {
  await clearWeatherCache();
  clearStationMemory();
  state.wxKey = null;
  state.stations = { key: null };
  void loadStations(); // never rejects: a failed search resolves to null
  flash($("#clearCache"), "Cache cleared");
  status("Cached weather data cleared.");
}
