// @ts-nocheck -- typed in the first strictness round, after this file is split up
// Form <-> URL hash, input validation, and turning form values into a data request and model parameters.
import { DEFAULTS, HASH_VERSION } from "./constants.ts";
import { $, form } from "./dom.ts";
import { fmt } from "./format.ts";
import { LOAD_PRESETS } from "../model/load.ts";
import { circleArea } from "../model/physics.ts";
import { parseCurve } from "../model/powerCurve.ts";

export function setForm(values) {
  for (const [k, v] of Object.entries(values)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = v === true || v === "1";
    else el.value = v;
  }
}

export function readForm() {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    const el = form.elements[k];
    out[k] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  out.apiKey = form.elements.apiKey.value.trim();
  return out;
}

export const asParam = (v) => (typeof v === "boolean" ? (v ? "1" : "0") : String(v));

export function writeHash(v) {
  const q = new URLSearchParams();
  for (const k of Object.keys(DEFAULTS)) {
    if ((k === "loadHourly" || k === "loadMonthly") && v.loadProfile in LOAD_PRESETS) continue; // implied by the profile
    if (k === "lat" || k === "lon" || asParam(v[k]) !== asParam(DEFAULTS[k])) q.set(k, asParam(v[k]));
  }
  q.set("v", HASH_VERSION);
  history.replaceState(null, "", `#${q}`);
}

export function readHash() {
  const out: Record<string, any> = {};
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) {
    if (k in DEFAULTS) out[k] = typeof DEFAULTS[k] === "boolean" ? v === "1" : v;
  }
  return out;
}

export class InputError extends Error {}

export function invalid(key, message) {
  const el = form.elements[key];
  el?.classList.add("invalid");
  el?.setAttribute("aria-invalid", "true");
  const err = new InputError(message);
  err.field = el;
  return err;
}

export function num(v, key, label, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (v[key] === "" && optional) return null;
  const x = Number(v[key]);
  if (v[key] === "" || !Number.isFinite(x) || x < min || x > max) {
    const range =
      Number.isFinite(min) && Number.isFinite(max)
        ? ` between ${min} and ${max}`
        : Number.isFinite(min)
          ? ` of at least ${min}`
          : "";
    throw invalid(key, `${label}: enter a number${range}.`);
  }
  return x;
}

export function list(v, key, label, n) {
  const xs = v[key]
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  if (xs.length !== n || xs.some((x) => !Number.isFinite(x) || x < 0))
    throw invalid(key, `${label}: enter ${n} numbers (zero or more).`);
  return xs;
}

/** What has to be downloaded: location, period and panel orientation. */
export function dataRequest(v) {
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

/** Frontal capture area (m²) and a short description of how it was entered. */
export function captureParams(v) {
  if (v.captureShape === "rect") {
    const w = num(v, "captureW", "Capture width", { min: 0.01, max: 500 });
    const h = num(v, "captureH", "Capture height", { min: 0.01, max: 500 });
    return { captureAreaM2: w * h, captureDesc: `${fmt(w, 2)} × ${fmt(h, 2)} m opening` };
  }
  const d = num(v, "captureM", "Diameter", { min: 0.01, max: 200 });
  return { captureAreaM2: circleArea(d), captureDesc: `${fmt(d, 2)} m diameter` };
}

/** Shows the diameter or width × height fields to match the opening shape, and the area they give. */
export function syncCapture() {
  const el = form.elements;
  const rect = el.captureShape.value === "rect";
  // Switching to a rectangle for the first time: start from a square as wide as the diameter.
  if (rect && !el.captureW.value && !el.captureH.value) el.captureW.value = el.captureH.value = el.captureM.value;
  $("#captureRound").hidden = rect;
  $("#captureRect").hidden = !rect;
  const area = rect ? Number(el.captureW.value) * Number(el.captureH.value) : circleArea(Number(el.captureM.value));
  $("#captureArea").textContent = area > 0 ? `Capture area ${fmt(area, area < 10 ? 2 : 1)} m².` : "";
}

export function modelParams(v) {
  let curvePts;
  try {
    curvePts = parseCurve(v.curve);
  } catch (e) {
    throw invalid("curve", e.message);
  }
  return {
    nTurbines: Math.round(num(v, "nTurbines", "Number of turbines", { min: 1, max: 100000 })),
    hubHeight: num(v, "hubHeight", "Hub height", { min: 1, max: 200 }),
    curvePts,
    ...captureParams(v),
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
    inverterKw: num(v, "inverterKw", "Inverter limit", { min: 0.1, optional: true }) ?? 0,
    currency: v.currency || "$",
    price: num(v, "price", "Grid price", { min: 0 }),
    exportCredit: num(v, "exportCredit", "Export credit", { min: 0 }),
    turbineCost: num(v, "turbineCost", "Installed cost", { min: 0 }),
    omPerTurbine: num(v, "omPerTurbine", "Maintenance", { min: 0 }),
  };
}
