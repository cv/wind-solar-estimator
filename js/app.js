// UI: form <-> URL hash, map, data loading, rendering. Chart.js and Leaflet are loaded as globals.
import { EXAMPLE_ROTOR_M, exampleCurve, parseCurve, formatCurve, checkCurve, betzLimitW, makeCurveFn, LOAD_PRESETS, simulate } from "./model.js";
import { fetchWeather, searchPlaces, clearWeatherCache } from "./weather.js";

const $ = (sel) => document.querySelector(sel);
const form = $("#form");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const API_KEY_STORAGE = "siteEstimator.apiKey";
const COLORS = { wind: "#1f77b4", solar: "#f2a900", load: "#444", grey: "#9aa3b5", limit: "#c62828" };
const ERA5_CELL_DEG = 0.25;

const DEFAULTS = {
  place: "Amarillo, Texas, United States",
  lat: "35.2220", lon: "-101.8313", years: "20", endYear: String(new Date().getFullYear() - 1),
  nTurbines: "1", hubHeight: "18", curve: formatCurve(exampleCurve()), captureM: String(EXAMPLE_ROTOR_M), augmentation: "1",
  clampPhysics: false, densityCorrection: true, windLossPct: "5",
  siteMeanKmh: "", windScale: "1",
  pvKwp: "10", pvLossPct: "14", tilt: "", azimuth: "", tempCoeffPct: "-0.4",
  loadKwh: "15000", loadProfile: "residential",
  loadHourly: LOAD_PRESETS.residential.hourly.join(", "),
  loadMonthly: LOAD_PRESETS.residential.monthly.join(", "),
  battKwh: "20", battKw: "5", battMinSoc: "20", battRte: "90",
  currency: "$", price: "0.20", exportCredit: "0.08", turbineCost: "25000", omPerTurbine: "250",
};

const state = { loading: false, wx: null, wxKey: null, req: null, params: null, result: null, capped: null, charts: {}, map: null, marker: null, cell: null };

// ---------- formatting ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const pct = (x, d = 0) => `${fmt(x * 100, d)}%`;
const money = (x, d = 0) => (Number.isFinite(x) ? `${x < 0 ? "−" : ""}${state.params.currency}${fmt(Math.abs(x), d)}` : "—");

// ---------- form, validation, URL ----------

function setForm(values) {
  for (const [k, v] of Object.entries(values)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = v === true || v === "1";
    else el.value = v;
  }
}

function readForm() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    const el = form.elements[k];
    out[k] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  out.apiKey = form.elements.apiKey.value.trim();
  return out;
}

const asParam = (v) => (typeof v === "boolean" ? (v ? "1" : "0") : String(v));

function writeHash(v) {
  const q = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) {
    if ((k === "loadHourly" || k === "loadMonthly") && v.loadProfile in LOAD_PRESETS) continue; // implied by the profile
    if (k === "lat" || k === "lon" || asParam(v[k]) !== asParam(DEFAULTS[k])) q.set(k, asParam(v[k]));
  }
  history.replaceState(null, "", `#${q}`);
}

function readHash() {
  const out = {};
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) {
    if (k in DEFAULTS) out[k] = typeof DEFAULTS[k] === "boolean" ? v === "1" : v;
  }
  return out;
}

class InputError extends Error {}

function invalid(key, message) {
  const el = form.elements[key];
  el?.classList.add("invalid");
  el?.setAttribute("aria-invalid", "true");
  const err = new InputError(message);
  err.field = el;
  return err;
}

function num(v, key, label, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (v[key] === "" && optional) return null;
  const x = Number(v[key]);
  if (v[key] === "" || !Number.isFinite(x) || x < min || x > max) {
    const range = Number.isFinite(min) && Number.isFinite(max) ? ` between ${min} and ${max}` : Number.isFinite(min) ? ` of at least ${min}` : "";
    throw invalid(key, `${label}: enter a number${range}.`);
  }
  return x;
}

function list(v, key, label, n) {
  const xs = v[key].split(/[\s,;]+/).filter(Boolean).map(Number);
  if (xs.length !== n || xs.some((x) => !Number.isFinite(x) || x < 0)) throw invalid(key, `${label}: enter ${n} numbers (zero or more).`);
  return xs;
}

/** What has to be downloaded: location, period and panel orientation. */
function dataRequest(v) {
  const lat = num(v, "lat", "Latitude", { min: -90, max: 90 });
  const lon = num(v, "lon", "Longitude", { min: -180, max: 180 });
  const lastYear = new Date().getFullYear() - 1;
  const endYear = num(v, "endYear", "Last year", { min: 1941, max: lastYear });
  const years = num(v, "years", "Years of history", { min: 1, max: Math.min(40, endYear - 1939) });
  const tilt = v.tilt === "" ? Math.min(60, Math.round(Math.abs(lat))) : num(v, "tilt", "Tilt", { min: 0, max: 90 });
  const compass = v.azimuth === "" ? (lat >= 0 ? 180 : 0) : num(v, "azimuth", "Facing", { min: 0, max: 360 });
  let azimuth = compass - 180; // Open-Meteo: 0 = south, -90 = east, 90 = west
  if (azimuth < -180) azimuth += 360;
  return { lat, lon, startYear: endYear - Math.round(years) + 1, endYear, tilt, azimuth, compass, apiKey: v.apiKey };
}

const requestKey = (r) => [r.lat.toFixed(4), r.lon.toFixed(4), r.startYear, r.endYear, r.tilt, r.azimuth].join("|");

function modelParams(v) {
  let curvePts;
  try { curvePts = parseCurve(v.curve); } catch (e) { throw invalid("curve", e.message); }
  return {
    nTurbines: Math.round(num(v, "nTurbines", "Number of turbines", { min: 1, max: 100000 })),
    hubHeight: num(v, "hubHeight", "Hub height", { min: 1, max: 200 }),
    curvePts,
    captureDiameterM: num(v, "captureM", "Rotor or intake diameter", { min: 0.01, max: 200 }),
    augmentation: num(v, "augmentation", "Duct augmentation", { min: 1, max: 10 }),
    clampPhysics: v.clampPhysics,
    densityCorrection: v.densityCorrection,
    windLossPct: num(v, "windLossPct", "Wind system losses", { min: 0, max: 90 }),
    siteMeanKmh: num(v, "siteMeanKmh", "Measured mean wind", { min: 0, max: 100, optional: true }) ?? 0,
    windScale: num(v, "windScale", "Wind scale", { min: 0.1, max: 5 }),
    pvKwp: num(v, "pvKwp", "PV size", { min: 0 }),
    pvLossPct: num(v, "pvLossPct", "PV losses", { min: 0, max: 90 }),
    tempCoeffPct: num(v, "tempCoeffPct", "Temperature coefficient", { min: -2, max: 0 }),
    loadKwh: num(v, "loadKwh", "Annual use", { min: 0 }),
    loadProfile: v.loadProfile,
    loadHourly: list(v, "loadHourly", "Hourly shape", 24),
    loadMonthly: list(v, "loadMonthly", "Monthly shape", 12),
    battKwh: num(v, "battKwh", "Battery capacity", { min: 0 }),
    battKw: num(v, "battKw", "Battery power", { min: 0 }),
    battMinSoc: num(v, "battMinSoc", "Minimum charge", { min: 0, max: 100 }) / 100,
    battRte: num(v, "battRte", "Round-trip efficiency", { min: 50, max: 100 }) / 100,
    currency: v.currency || "$",
    price: num(v, "price", "Grid price", { min: 0 }),
    exportCredit: num(v, "exportCredit", "Export credit", { min: 0 }),
    turbineCost: num(v, "turbineCost", "Installed cost", { min: 0 }),
    omPerTurbine: num(v, "omPerTurbine", "Maintenance", { min: 0 }),
  };
}

// ---------- status ----------

// Input problems are shown under the field at fault (or the Analyse button), so they're in view on every screen size.
function formError(message, field) {
  const el = $("#formError");
  el.textContent = message;
  el.hidden = !message;
  if (!message) return;
  (field ? field.closest(".row") || field.closest("label") || field : $("#run")).after(el);
  field?.setAttribute("aria-describedby", "formError");
}

// Brief confirmation on the button that was pressed.
function flash(btn, text, ms = 2000) {
  clearTimeout(btn._flash);
  btn.dataset.label ??= btn.textContent;
  btn.textContent = text;
  btn._flash = setTimeout(() => { btn.textContent = btn.dataset.label; }, ms);
}

function status(html, kind = "info") {
  const el = $("#status");
  el.hidden = !html;
  el.className = `status ${kind}`;
  el.innerHTML = html || "";
}

// ---------- analysis ----------

let runToken = 0;
let abortCtl = null;

async function analyse({ fetchIfNeeded = true } = {}) {
  form.querySelectorAll(".invalid").forEach((el) => { el.classList.remove("invalid"); el.removeAttribute("aria-invalid"); el.removeAttribute("aria-describedby"); });
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

  if (requestKey(req) !== state.wxKey) {
    if (!fetchIfNeeded) {
      if (state.result && !state.loading) status("The location, period or panel orientation changed. Press <strong>Analyse this site</strong> to load weather data for it.", "stale");
      return;
    }
    const token = ++runToken;
    abortCtl?.abort();
    abortCtl = new AbortController();
    const runBtn = $("#run");
    runBtn.disabled = true;
    runBtn.textContent = "Loading weather…";
    const period = req.startYear === req.endYear ? String(req.endYear) : `${req.startYear}–${req.endYear}`;
    state.loading = true;
    try {
      const wx = await fetchWeather({
        ...req,
        signal: abortCtl.signal,
        onProgress: (done, total) => {
          if (token !== runToken) return;
          runBtn.textContent = `Loading weather… ${done} of ${total}`;
          status(`Loading hourly weather for ${period}… ${done} of ${total} year${total === 1 ? "" : "s"}` +
            `<div class="progress"><div style="width:${Math.round((100 * done) / total)}%"></div></div>`);
        },
      });
      if (token !== runToken) return;
      Object.assign(state, { wx, wxKey: requestKey(req), req });
    } catch (e) {
      if (token !== runToken || e?.name === "AbortError") return;
      status(esc(e.message || e), "error");
      return;
    } finally {
      if (token === runToken) { runBtn.disabled = false; runBtn.textContent = "Analyse this site"; state.loading = false; }
    }
  }

  state.params = params;
  state.result = simulate(state.wx, params);
  const check = checkCurve(params.curvePts, params.captureDiameterM, params.augmentation);
  state.capped = check.worstRatio > 1 && !params.clampPhysics ? simulate(state.wx, { ...params, clampPhysics: true }) : null;
  // With the cap on, the uncapped run says what the cap took away (after losses, so it matches the figures).
  state.uncapped = check.worstRatio > 1 && params.clampPhysics ? simulate(state.wx, { ...params, clampPhysics: false }) : null;
  status("");
  render(v, check);
  if (fetchIfNeeded && matchMedia("(max-width: 960px)").matches) {
    // Single-column layout: the report sits below the form, so bring it into view.
    $("#results").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
}

// ---------- rendering ----------

function render(v, check) {
  const { result: r, params: p, req, wx } = state;
  $("#intro").hidden = true;
  $("#results").hidden = false;
  $("#share").disabled = false;
  $("#print").disabled = false;

  const title = v.place || `Site at ${req.lat.toFixed(3)}, ${req.lon.toFixed(3)}`;
  $("#reportHead").innerHTML = `<h2>${esc(title)}</h2><p>${req.lat.toFixed(4)}, ${req.lon.toFixed(4)} · ${wx.years} year${wx.years === 1 ? "" : "s"} of hourly weather (${wx.startYear === wx.endYear ? wx.endYear : `${wx.startYear}–${wx.endYear}`}) · ` +
    `${p.nTurbines} turbine${p.nTurbines === 1 ? "" : "s"} at ${p.hubHeight} m, ${p.pvKwp} kWp solar, ${p.battKwh} kWh battery · ${new Date().toLocaleDateString(undefined, { dateStyle: "medium" })}</p>`;

  renderVerdict(r, p);
  if (state.capped) $("#more").open = true; // the power-curve chart is the evidence
  renderNotes(r, p, check);
  renderFigures(r, p, req);
  renderCharts(r, p);
  renderMonthly(r);
  renderAssumptions(r, p, req, wx);
  if (state.map) {
    state.cell?.remove();
    const h = ERA5_CELL_DEG / 2;
    state.cell = L.rectangle([[wx.gridLat - h, wx.gridLon - h], [wx.gridLat + h, wx.gridLon + h]], { color: COLORS.wind, weight: 1, fillOpacity: 0.08 })
      .bindTooltip("Weather data grid cell (~28 km): wind and sunlight are averaged over this area")
      .addTo(state.map);
    state.cell.getElement()?.setAttribute("tabindex", "-1"); // hover-only hint, not a tab stop
  }
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function verdictFor(r) {
  const pb = r.econ.payback;
  if (pb <= 10) return { cls: "good", label: "Promising", text: `the turbines pay back in about ${fmt(pb, pb < 10 ? 1 : 0)} years` };
  if (pb <= 20) return { cls: "warn", label: "Marginal", text: `the turbines pay back in about ${fmt(pb)} years` };
  if (Number.isFinite(pb)) return { cls: "bad", label: "Weak", text: `the turbines take about ${fmt(pb)} years to pay back` };
  return { cls: "bad", label: "Not viable", text: "the turbines' savings don't cover their maintenance" };
}

function renderVerdict(r) {
  const v = verdictFor(r);
  let tag = v;
  let head = capitalize(v.text);
  let lines = []; // the figures under the headline carry the numbers
  if (state.capped) {
    const c = verdictFor(state.capped);
    tag = { cls: "bad", label: "Unverified" };
    head = "The power curve claims more than the wind can deliver";
    lines = [
      `The figures below take the curve at face value. Capped at the physical limit: ${fmt(state.capped.windKwh)} kWh a year from wind, and ${c.text}.`,
    ];
  }
  $("#verdict").innerHTML = `<h3 id="verdictHead" class="verdict-head"><span class="tag ${tag.cls}">${esc(tag.label)}</span> ${esc(head)}</h3>` +
    lines.map((l) => `<p class="verdict-detail">${esc(l)}</p>`).join("");
}

/** Says what the Betz cap does for the current curve, next to the checkbox, so toggling it never looks inert. */
function renderClampStatus(r, p, check) {
  let text;
  if (check.worstRatio <= 1) {
    text = `This curve stays within the limit at every wind speed (at most ${pct(check.worstRatio)} of it), so capping changes nothing.`;
  } else if (p.clampPhysics) {
    text = `Capped, wind makes ${fmt(r.windKwh)} kWh a year instead of the ${fmt(state.uncapped.windKwh)} the curve as entered would give.`;
  } else {
    text = `This curve is ${fmt(check.worstRatio)}× the limit at ${fmt(check.atKmh)} km/h. Capped, wind would make ${fmt(state.capped.windKwh)} kWh a year instead of ${fmt(r.windKwh)}.`;
  }
  $("#clampStatus").textContent = text;
}

function renderNotes(r, p, check) {
  renderClampStatus(r, p, check);
  const items = [];
  if (check.worstRatio > 1) {
    const aug = p.augmentation > 1 ? `, even with ${fmt(p.augmentation, 1)}× duct augmentation` : "";
    if (p.clampPhysics) {
      items.push(["warn", `<strong>Power curve:</strong> output is capped at the physical limit for a ${fmt(p.captureDiameterM, 2)} m rotor or intake, which takes wind energy from ${fmt(state.uncapped.windKwh)} to ${fmt(r.windKwh)} kWh a year.`]);
    } else {
      items.push(["bad", `<strong>Power curve:</strong> at ${fmt(check.atKmh)} km/h it is ${fmt(check.worstRatio)}× the most a ${fmt(p.captureDiameterM, 2)} m rotor or intake can physically capture (the Betz limit${aug}). ` +
        `The most it could capture here is about ${fmt(r.physicsCapKwh)} kWh a year. Have the curve measured independently, or correct the diameter, before quoting customers.`]);
    }
  }
  if (p.siteMeanKmh > 0) {
    items.push(["warn", `<strong>Wind data:</strong> scaled ×${fmt(r.scale, 2)} so the mean at hub height matches the measured ${fmt(p.siteMeanKmh, 1)} km/h. The weather data alone gave ${fmt(r.modelHubMean, 1)} km/h.`]);
  } else if (p.windScale !== 1) {
    items.push(["warn", `<strong>Wind data:</strong> scaled ×${fmt(p.windScale, 2)} by hand.`]);
  } else {
    items.push(["warn", `<strong>Wind data:</strong> not calibrated. It's averaged over a ~28 km grid cell, and terrain, trees and buildings can change the wind at the turbine a lot; energy rises with the cube of wind speed. Enter a measured mean under <em>Site wind calibration</em> if one exists.`]);
  }
  if (p.hubHeight < 10) items.push(["warn", `<strong>Hub height:</strong> below 10 m the wind is extrapolated downward, and wind near roofs and the ground is turbulent and hard to predict.`]);
  if (state.wx.missing > 0) items.push(["warn", `<strong>Missing data:</strong> ${fmt(state.wx.missing)} hours had gaps and were skipped.`]);
  $("#notes").innerHTML = items.map(([cls, html]) => `<li class="${cls}">${html}</li>`).join("");
}

/** One figure: label, value (with optional unit) and a supporting line. */
const figure = (label, value, unit, sub, cls = "") =>
  `<div><dt>${esc(label)}</dt><dd class="value ${cls}">${esc(value)}${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</dd>` +
  (sub ? `<dd class="sub">${esc(sub)}</dd>` : "") + `</div>`;

function renderFigures(r, p, req) {
  const A = r.pvOnly, B = r.withWind, e = r.econ;
  const cut = A.importKwh - B.importKwh;
  const cutShare = A.importKwh > 0 ? `${pct(cut / A.importKwh)} less than without wind` : "No grid purchases even without wind";
  $("#figures").innerHTML = [
    figure("Wind energy", fmt(r.windKwh), "kWh/yr", `${pct(r.capacityFactor, 1)} capacity factor`, "wind"),
    figure("Grid purchases cut by", fmt(cut), "kWh/yr", cutShare),
    figure("Savings from wind", money(e.savings), "/yr", `${money(e.netSavings)}/yr after maintenance`),
    Number.isFinite(e.payback)
      ? figure("Simple payback", fmt(e.payback, e.payback < 10 ? 1 : 0), "years", `on ${money(e.capex)} installed`)
      : figure("Simple payback", "Never", "", `on ${money(e.capex)} installed`),
  ].join("");

  const stat = (label, value, unit, sub) =>
    `<div><dt>${esc(label)}</dt><dd>${esc(value)}${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</dd>${sub ? `<dd class="sub">${esc(sub)}</dd>` : ""}</div>`;
  // Supporting figures only: anything already in the summary or the assumptions isn't repeated here.
  $("#stats").innerHTML = [
    stat("Mean wind at hub", fmt(r.meanHub, 1), "km/h", `Weather data: ${fmt(r.meanW10, 1)} at 10 m, ${fmt(r.meanW100, 1)} at 100 m`),
    stat("Turbines producing", pct(r.generatingShare), "", "of all hours"),
    p.nTurbines > 1 ? stat("Per turbine", fmt(r.windKwhPerTurbine), "kWh/yr", `${fmt(r.windKwhPerTurbine / 365, 1)} kWh a day`) : "",
    stat("Wind cost per kWh", money(e.costPerKwh20, 2), "", `over 20 years, vs ${money(p.price, 2)} from the grid`),
    stat("Solar energy", fmt(r.pvKwh), "kWh/yr", `${fmt(p.pvKwp, 1)} kWp, tilt ${req.tilt}°, facing ${req.compass}°`),
    stat("Self-sufficiency", pct(B.selfSufficiency), "", `${pct(A.selfSufficiency)} without wind`),
    stat("Surplus exported", fmt(B.exportKwh), "kWh/yr", `${fmt(A.exportKwh)} without wind`),
  ].join("");
}

// Legend keys match the marks: a swatch for bars, a short line (dashed if the series is) for lines.
const legendLabels = {
  usePointStyle: true,
  boxHeight: 8,
  pointStyleWidth: 16,
  generateLabels(chart) {
    return Chart.defaults.plugins.legend.labels.generateLabels(chart).map((item) => {
      const ds = chart.data.datasets[item.datasetIndex];
      return (ds.type || chart.config.type) === "line"
        ? { ...item, pointStyle: "line", strokeStyle: ds.borderColor, lineWidth: 2.5 }
        : { ...item, pointStyle: "rect", lineWidth: 0 };
    });
  },
};

function drawChart(id, config) {
  if (typeof Chart === "undefined") return;
  state.charts[id]?.destroy();
  state.charts[id] = new Chart(document.getElementById(id), {
    ...config,
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: legendLabels }, ...config.options?.plugins },
      ...config.options,
    },
  });
}

const axis = (title, extra = {}) => ({ title: { display: true, text: title }, ...extra });

function renderCharts(r, p) {
  // Wind speed distribution and energy by speed
  let last = r.hist.hours.length - 1;
  while (last > 0 && r.hist.hours[last] < 1 && r.hist.energy[last] < 1) last--;
  const bins = r.hist.hours.slice(0, last + 1).map((_, i) => `${i * r.hist.binKmh}`);
  drawChart("chDist", {
    data: {
      labels: bins,
      datasets: [
        { type: "bar", label: "Hours per year", data: r.hist.hours.slice(0, last + 1).map((x) => Math.round(x)), backgroundColor: "rgba(31,119,180,0.35)", yAxisID: "y" },
        { type: "line", label: "Wind energy (kWh/yr)", data: r.hist.energy.slice(0, last + 1).map((x) => Math.round(x)), borderColor: COLORS.wind, backgroundColor: COLORS.wind, pointRadius: 0, tension: 0.3, yAxisID: "y1" },
      ],
    },
    options: {
      scales: {
        x: axis(`Wind speed at hub, km/h (${r.hist.binKmh} km/h bins)`),
        y: axis("Hours per year", { beginAtZero: true }),
        y1: axis("kWh per year", { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } }),
      },
    },
  });

  const round = (a) => a.map((x) => Math.round(x));
  drawChart("chMonthly", {
    data: {
      labels: MONTHS,
      datasets: [
        { type: "bar", label: "Wind", data: round(r.monthly.wind), backgroundColor: COLORS.wind, stack: "gen" },
        { type: "bar", label: "Solar", data: round(r.monthly.pv), backgroundColor: COLORS.solar, stack: "gen" },
        { type: "line", label: "Electricity use", data: round(r.monthly.load), borderColor: COLORS.load, backgroundColor: COLORS.load, pointRadius: 2 },
      ],
    },
    options: { scales: { x: { stacked: true }, y: axis("kWh per month", { stacked: true, beginAtZero: true }) } },
  });

  drawChart("chImport", {
    type: "bar",
    data: {
      labels: MONTHS,
      datasets: [
        { label: "Solar + battery only", data: round(r.monthly.importPv), backgroundColor: COLORS.grey },
        { label: "With wind", data: round(r.monthly.importBoth), backgroundColor: COLORS.wind },
      ],
    },
    options: { scales: { y: axis("kWh bought per month", { beginAtZero: true }) } },
  });

  renderSoc();

  const mean = r.windKwh;
  drawChart("chYearly", {
    data: {
      labels: r.yearly.map((y) => String(y.year)),
      datasets: [
        { type: "bar", label: "Wind energy", data: r.yearly.map((y) => Math.round(y.kwh)), backgroundColor: COLORS.wind },
        { type: "line", label: "Average", data: r.yearly.map(() => Math.round(mean)), borderColor: COLORS.load, borderDash: [5, 4], pointRadius: 0 },
      ],
    },
    options: { scales: { y: axis("kWh per year", { beginAtZero: true }) } },
  });

  const curve = makeCurveFn(p.curvePts);
  const speeds = Array.from({ length: 61 }, (_, i) => i);
  const positive = (x) => (x > 0 ? x : null);
  drawChart("chCurve", {
    type: "line",
    data: {
      labels: speeds.map(String),
      datasets: [
        { label: "Entered power curve (W)", data: speeds.map((s) => positive(curve(s))), borderColor: COLORS.wind, backgroundColor: COLORS.wind, pointRadius: 0 },
        { label: `Physical limit, ${fmt(p.captureDiameterM, 2)} m diameter${p.augmentation > 1 ? ` ×${fmt(p.augmentation, 1)}` : ""} (W)`, data: speeds.map((s) => positive(betzLimitW(s, p.captureDiameterM) * p.augmentation)), borderColor: COLORS.limit, backgroundColor: COLORS.limit, borderDash: [6, 4], pointRadius: 0 },
      ],
    },
    options: {
      scales: {
        x: axis("Wind speed (km/h)", { ticks: { maxTicksLimit: 13 } }),
        y: axis("Watts (log scale)", {
          type: "logarithmic", min: 0.1,
          ticks: { callback: (v) => ([0.1, 1, 10, 100, 1000, 10000, 100000].includes(v) ? (v >= 1000 ? `${v / 1000}k` : String(v)) : "") },
        }),
      },
    },
  });
}

function renderSoc() {
  const r = state.result;
  if (!r) return;
  const mo = Number($("#socMonth").value) || 0;
  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  const asPct = (a) => a.map((x) => (x == null ? null : Math.round(x * 1000) / 10));
  drawChart("chSoc", {
    type: "line",
    data: {
      labels: hours,
      datasets: [
        { label: "With wind", data: asPct(r.socDay.withWind[mo]), borderColor: COLORS.wind, backgroundColor: COLORS.wind, pointRadius: 0, tension: 0.3 },
        { label: "Without wind", data: asPct(r.socDay.pvOnly[mo]), borderColor: COLORS.grey, backgroundColor: COLORS.grey, borderDash: [6, 4], pointRadius: 0, tension: 0.3 },
        { label: "Minimum charge", data: hours.map(() => state.params.battMinSoc * 100), borderColor: COLORS.limit, borderWidth: 1, borderDash: [2, 3], pointRadius: 0 },
      ],
    },
    options: { scales: { y: axis("Battery charge (%)", { min: 0, max: 100 }), x: axis("Hour of day", { ticks: { maxTicksLimit: 8 } }) } },
  });
}

function monthlyRows(r) {
  const m = r.monthly;
  const rows = MONTHS.map((name, i) => [name, m.wind[i], m.pv[i], m.load[i], m.importPv[i], m.importBoth[i]]);
  const total = ["Year", r.windKwh, r.pvKwh, r.loadKwh, r.pvOnly.importKwh, r.withWind.importKwh];
  return { head: ["Month", "Wind", "Solar", "Use", "Bought: solar + battery", "Bought: with wind"], rows, total };
}

function renderMonthly(r) {
  const { head, rows, total } = monthlyRows(r);
  const tr = (cells, tag = "td") => `<tr>${cells.map((c, i) => `<${tag}>${i ? fmt(c) : esc(c)}</${tag}>`).join("")}</tr>`;
  $("#monthlyTable").innerHTML = `<caption class="visually-hidden">Monthly energy in kWh for an average year</caption><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((row) => tr(row)).join("")}</tbody><tfoot>${tr(total)}</tfoot>`;
}

function assumptionRows(r, p, req, wx) {
  const ratedKw = r.ratedKw / p.nTurbines;
  return [
    ["Site", `${req.lat.toFixed(4)}, ${req.lon.toFixed(4)}; weather grid cell centred ${wx.gridLat}, ${wx.gridLon}; elevation ${fmt(wx.elevation)} m; ${wx.timezone}`],
    ["Weather data", `ERA5 reanalysis via Open-Meteo, hourly, ${wx.startYear}–${wx.endYear} (${fmt(wx.n)} hours, ${fmt(wx.missing)} missing)`],
    ["Wind at hub", `${p.hubHeight} m, from 10 m and 100 m winds with an hourly shear exponent (mean ${fmt(r.meanAlpha, 2)}); scaled ×${fmt(r.scale, 2)}; air density correction ${p.densityCorrection ? "on" : "off"}; ${p.windLossPct}% losses`],
    ["Turbines", `${p.nTurbines} × ${fmt(ratedKw, 2)} kW peak; ${p.curvePts.length}-point power curve; rotor or intake ${fmt(p.captureDiameterM, 2)} m, augmentation ×${fmt(p.augmentation, 1)}; ${p.clampPhysics ? "capped at" : "not capped at"} the physical limit`],
    ["Solar", `${p.pvKwp} kWp, tilt ${req.tilt}°, facing ${req.compass}°; ${p.pvLossPct}% losses; ${p.tempCoeffPct}%/°C`],
    ["Electricity use", `${fmt(p.loadKwh)} kWh/yr, ${LOAD_PRESETS[p.loadProfile]?.label ?? "custom profile"}`],
    ["Battery", `${p.battKwh} kWh, ${p.battKw} kW, kept above ${fmt(p.battMinSoc * 100)}%, ${fmt(p.battRte * 100)}% round trip; charged from surplus, then surplus exported`],
    ["Economics", `grid ${money(p.price, 2)}/kWh, export credit ${money(p.exportCredit, 2)}/kWh, ${money(p.turbineCost)} installed and ${money(p.omPerTurbine)}/yr maintenance per turbine; no inflation, discounting or incentives`],
  ];
}

function renderAssumptions(r, p, req, wx) {
  $("#assumptions").innerHTML = assumptionRows(r, p, req, wx).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");
}

function downloadCsv() {
  const { result: r, params: p, req, wx } = state;
  if (!r) return;
  const q = (c) => (typeof c === "number" ? String(Math.round(c * 100) / 100) : `"${String(c).replace(/"/g, '""')}"`);
  const { head, rows, total } = monthlyRows(r);
  const lines = [
    ["Wind + solar site estimate", readForm().place || ""],
    ["Latitude", req.lat], ["Longitude", req.lon],
    ...assumptionRows(r, p, req, wx),
    [],
    ["Wind kWh/yr", r.windKwh], ["Capacity factor", r.capacityFactor], ["Solar kWh/yr", r.pvKwh], ["Use kWh/yr", r.loadKwh],
    ["Bought kWh/yr, solar + battery", r.pvOnly.importKwh], ["Bought kWh/yr, with wind", r.withWind.importKwh],
    ["Savings from wind per yr", r.econ.savings], ["Simple payback (yrs)", Number.isFinite(r.econ.payback) ? r.econ.payback : "never"],
    [],
    head.map((h) => `${h} (kWh)`), ...rows, total,
  ];
  const blob = new Blob([lines.map((l) => l.map(q).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `site-estimate-${req.lat.toFixed(3)}_${req.lon.toFixed(3)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- map and place search ----------

function initMap() {
  if (typeof L === "undefined") { $("#map").hidden = true; return; }
  const lat = Number(form.elements.lat.value) || 0, lon = Number(form.elements.lon.value) || 0;
  const map = L.map("map", { scrollWheelZoom: false }).setView([lat, lon], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
  const marker = L.marker([lat, lon], { draggable: true, alt: "Site location", title: "Drag to move the site" }).addTo(map);
  marker.on("dragend", () => { const ll = marker.getLatLng(); setLocation(ll.lat, ll.lng, ""); });
  map.on("click", (e) => setLocation(e.latlng.lat, e.latlng.lng, ""));
  Object.assign(state, { map, marker });
}

function setLocation(lat, lon, name, { pan = false } = {}) {
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  form.elements.lat.value = lat.toFixed(4);
  form.elements.lon.value = lon.toFixed(4);
  form.elements.place.value = name;
  state.marker?.setLatLng([lat, lon]);
  if (pan) state.map?.setView([lat, lon], 8);
  onChange("lat");
}

async function placeSearch() {
  const q = $("#placeSearch").value.trim();
  const ul = $("#placeResults");
  if (!q) { ul.hidden = true; return; }
  ul.hidden = false;
  ul.innerHTML = `<li class="hint" style="padding:0.4rem 0.6rem">Searching…</li>`;
  try {
    const places = await searchPlaces(q);
    if (!places.length) { ul.innerHTML = `<li class="hint" style="padding:0.4rem 0.6rem">No places found.</li>`; return; }
    ul.innerHTML = "";
    for (const pl of places) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${pl.name} (${pl.lat.toFixed(2)}, ${pl.lon.toFixed(2)})`;
      b.addEventListener("click", () => {
        ul.hidden = true;
        setLocation(pl.lat, pl.lon, pl.name, { pan: true });
        analyse();
      });
      li.append(b);
      ul.append(li);
    }
  } catch (e) {
    ul.innerHTML = `<li class="hint" style="padding:0.4rem 0.6rem">${esc(e.message)}</li>`;
  }
}

// ---------- events ----------

let debounce = 0;

function onChange(name) {
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
    const lat = Number(form.elements.lat.value), lon = Number(form.elements.lon.value);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90) state.marker?.setLatLng([lat, lon]);
  }
  writeHash(readForm());
  clearTimeout(debounce);
  debounce = setTimeout(() => analyse({ fetchIfNeeded: false }), 250);
}

function init() {
  const sel = form.elements.loadProfile;
  for (const [key, preset] of [...Object.entries(LOAD_PRESETS), ["custom", { label: "Custom (edit below)" }]]) sel.add(new Option(preset.label, key));
  MONTHS.forEach((m, i) => $("#socMonth").add(new Option(m, String(i))));

  const fromHash = readHash();
  if (("lat" in fromHash || "lon" in fromHash) && !("place" in fromHash)) fromHash.place = "";
  const preset = LOAD_PRESETS[fromHash.loadProfile];
  if (preset) Object.assign(fromHash, { loadHourly: preset.hourly.join(", "), loadMonthly: preset.monthly.join(", ") });
  setForm({ ...DEFAULTS, ...fromHash });
  form.elements.apiKey.value = localStorage.getItem(API_KEY_STORAGE) || "";
  $("#placeSearch").value = form.elements.place.value;
  initMap();

  form.addEventListener("submit", (e) => { e.preventDefault(); analyse(); });
  form.addEventListener("input", (e) => {
    if (!e.target.name) return;
    if (e.target.name === "lat" || e.target.name === "lon") form.elements.place.value = "";
    onChange(e.target.name);
  });
  $("#placeSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); placeSearch(); } });
  $("#placeGo").addEventListener("click", placeSearch);
  $("#resetCurve").addEventListener("click", () => { form.elements.curve.value = DEFAULTS.curve; onChange("curve"); });
  $("#socMonth").addEventListener("change", renderSoc);
  $("#tryExample").addEventListener("click", () => {
    setLocation(Number(DEFAULTS.lat), Number(DEFAULTS.lon), DEFAULTS.place, { pan: true });
    analyse();
  });
  $("#csv").addEventListener("click", downloadCsv);
  $("#print").addEventListener("click", () => window.print());
  $("#share").addEventListener("click", async () => {
    writeHash(readForm());
    try { await navigator.clipboard.writeText(location.href); flash($("#share"), "Link copied"); status("Link copied. Anyone opening it sees this site with these assumptions."); }
    catch { window.prompt("Copy this link:", location.href); }
  });
  $("#clearCache").addEventListener("click", async () => {
    await clearWeatherCache();
    state.wxKey = null;
    flash($("#clearCache"), "Cache cleared");
    status("Cached weather data cleared.");
  });
  const resizeCharts = () => Object.values(state.charts).forEach((c) => c.resize());
  // A printed report shows everything: expand collapsed sections, then restore them.
  let closedForPrint = [];
  window.addEventListener("beforeprint", () => {
    closedForPrint = [...document.querySelectorAll("#results details:not([open])")];
    closedForPrint.forEach((d) => { d.open = true; });
    resizeCharts();
  });
  window.addEventListener("afterprint", () => {
    closedForPrint.forEach((d) => { d.open = false; });
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

init();
