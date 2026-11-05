// Start-up: fill the form from the URL, set up the map and wire every event handler.
import { analyse, onChange } from "./analyse.ts";
import { MONTHS, API_KEY_STORAGE, DEFAULTS, DEFAULTS_V1 } from "./constants.ts";
import type { FormOverrides } from "./constants.ts";
import { $, form, flash, status } from "./dom.ts";
import type { FormField } from "./dom.ts";
import { setForm, readForm, writeHash, readHash, syncCapture, loadPreset } from "./form.ts";
import { state } from "./state.ts";
import { clearStationMemory } from "../data/stations.ts";
import { clearWeatherCache } from "../data/weather.ts";
import { LOAD_PRESETS } from "../model/load.ts";
import { renderSoc } from "../report/charts.ts";
import { downloadCsv } from "../report/csv.ts";
import { initMap, setLocation, placeSearch } from "../ui/map.ts";
import { loadStations, renderStationPicker, chooseWindSource } from "../ui/stationPicker.ts";

export function init(): void {
  const sel = form.elements.loadProfile;
  const presets: [string, { label: string }][] = [
    ...Object.entries(LOAD_PRESETS),
    ["custom", { label: "Custom (edit below)" }],
  ];
  for (const [key, preset] of presets) sel.add(new Option(preset.label, key));
  MONTHS.forEach((m, i) => $<HTMLSelectElement>("#socMonth").add(new Option(m, String(i))));

  const fromHash: FormOverrides = readHash();
  const hashKeys = [...new URLSearchParams(location.hash.slice(1)).keys()];
  if (hashKeys.length && !hashKeys.includes("v")) {
    for (const [k, v] of Object.entries(DEFAULTS_V1) as [string, string | boolean][])
      if (!(k in fromHash)) (fromHash as Record<string, string | boolean>)[k] = v; // a link from before HASH_VERSION
  }
  if (("lat" in fromHash || "lon" in fromHash) && !("place" in fromHash)) fromHash.place = "";
  const preset = loadPreset(fromHash.loadProfile);
  if (preset) Object.assign(fromHash, { loadHourly: preset.hourly.join(", "), loadMonthly: preset.monthly.join(", ") });
  setForm({ ...DEFAULTS, ...fromHash });
  syncCapture();
  form.elements.apiKey.value = localStorage.getItem(API_KEY_STORAGE) || "";
  $<HTMLInputElement>("#placeSearch").value = form.elements.place.value;
  initMap();
  $("#stationSelect").addEventListener("change", (e) => chooseWindSource((e.target as HTMLSelectElement).value));
  loadStations();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    analyse();
  });
  form.addEventListener("input", (e) => {
    const target = e.target as FormField;
    if (!target.name) return;
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
      placeSearch();
    }
  });
  $("#placeGo").addEventListener("click", placeSearch);
  $("#resetCurve").addEventListener("click", () => {
    form.elements.curve.value = DEFAULTS.curve;
    onChange("curve");
  });
  $("#socMonth").addEventListener("change", renderSoc);
  $("#tryExample").addEventListener("click", () => {
    setLocation(Number(DEFAULTS.lat), Number(DEFAULTS.lon), DEFAULTS.place, { pan: true });
    analyse();
  });
  $("#csv").addEventListener("click", downloadCsv);
  // "Use 2008–2025 only" in a station-record note: narrow the period to after the step.
  $("#notes").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-years]");
    if (!b) return;
    form.elements.years.value = b.dataset.years;
    form.elements.endYear.value = b.dataset.end;
    writeHash(readForm());
    loadStations()
      .then(renderStationPicker)
      .then(() => analyse());
  });
  $("#print").addEventListener("click", () => window.print());
  $("#share").addEventListener("click", async () => {
    writeHash(readForm());
    try {
      await navigator.clipboard.writeText(location.href);
      flash($("#share"), "Link copied");
      status("Link copied. Anyone opening it sees this site with these assumptions.");
    } catch {
      window.prompt("Copy this link:", location.href);
    }
  });
  $("#clearCache").addEventListener("click", async () => {
    await clearWeatherCache();
    clearStationMemory();
    state.wxKey = null;
    state.stations = { key: null };
    loadStations();
    flash($("#clearCache"), "Cache cleared");
    status("Cached weather data cleared.");
  });
  const resizeCharts = () => Object.values(state.charts).forEach((c) => c.resize());
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

  if ("lat" in fromHash) analyse(); // opened from a shared link
}
