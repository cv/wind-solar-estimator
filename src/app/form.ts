// Form <-> URL hash, input validation, and turning form values into a data request and model parameters.
import { DEFAULTS, HASH_VERSION, isFormKey } from "./constants.ts";
import type { FormInput, FormKey, FormOverrides, FormValues, StringFormKey } from "./constants.ts";
import { $, form } from "./dom.ts";
import type { FormField } from "./dom.ts";
import { fmt } from "./format.ts";
import type { DataRequest } from "./state.ts";
import { LOAD_PRESETS, isLoadProfileKey } from "../model/load.ts";
import type { LoadPreset } from "../model/load.ts";
import { circleArea } from "../model/physics.ts";
import { parseCurve } from "../model/powerCurve.ts";
import type { CurvePoint } from "../model/powerCurve.ts";
import type { ModelParams } from "../model/simulate.ts";
import { fraction, kmh, kw, kwh, metres, percent, squareMetres } from "../model/units.ts";

/** The form's field names (DEFAULTS' keys). */
const FORM_KEYS = Object.keys(DEFAULTS).filter((k) => isFormKey(k));

/** The load preset named key (any string, e.g. from a share link), if there is one. */
export function loadPreset(key: string | undefined): LoadPreset | undefined {
  return key !== undefined && isLoadProfileKey(key) ? LOAD_PRESETS[key] : undefined;
}

/** A checkbox field, as opposed to a text-like one. */
const isCheckbox = (el: FormField): el is HTMLInputElement => el.type === "checkbox";

export function setForm(values: FormOverrides): void {
  for (const [k, v] of Object.entries(values)) {
    if (!isFormKey(k)) continue;
    const el: FormField = form.elements[k];
    if (isCheckbox(el)) el.checked = v === true || v === "1";
    else el.value = String(v);
  }
}

/** Values read from the form that match DEFAULTS: a checkbox's state for each boolean field, text for the rest. */
function isFormInput(o: Readonly<Record<string, string | boolean>>): o is FormInput & Record<string, string | boolean> {
  return FORM_KEYS.every((k) => typeof o[k] === typeof DEFAULTS[k]) && typeof o["apiKey"] === "string";
}

export function readForm(): FormInput {
  const out: Record<string, string | boolean> = {};
  for (const k of FORM_KEYS) {
    const el: FormField = form.elements[k];
    out[k] = isCheckbox(el) ? el.checked : el.value.trim();
  }
  out["apiKey"] = form.elements.apiKey.value.trim();
  if (!isFormInput(out)) throw new Error("A form field is a checkbox where text was expected, or the other way round");
  return out;
}

export const asParam = (v: string | boolean): string => (typeof v === "boolean" ? (v ? "1" : "0") : v);

export function writeHash(v: FormValues): void {
  const q = new URLSearchParams();
  for (const k of FORM_KEYS) {
    if ((k === "loadHourly" || k === "loadMonthly") && isLoadProfileKey(v.loadProfile)) continue; // implied by the profile
    if (k === "lat" || k === "lon" || asParam(v[k]) !== asParam(DEFAULTS[k])) q.set(k, asParam(v[k]));
  }
  q.set("v", HASH_VERSION);
  history.replaceState(null, "", `#${q}`);
}

export function readHash(): FormOverrides {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) {
    if (isFormKey(k)) out[k] = typeof DEFAULTS[k] === "boolean" ? v === "1" : v;
  }
  return out;
}

/** A form value that failed validation; field is the offending input. */
export class InputError extends Error {
  field?: FormField;
}

/** Bounds for num; an optional field may be left empty (num then returns null). */
export interface NumOptions {
  min?: number;
  max?: number;
  optional?: boolean;
}

export function invalid(key: FormKey, message: string): InputError {
  const el = form.elements[key];
  el.classList.add("invalid");
  el.setAttribute("aria-invalid", "true");
  const err = new InputError(message);
  err.field = el;
  return err;
}

/** The allowed range for a number's error message ("" when it is unbounded below). */
function rangeText(min: number, max: number): string {
  if (!Number.isFinite(min)) return "";
  return Number.isFinite(max) ? ` between ${min} and ${max}` : ` of at least ${min}`;
}

export function num(v: FormInput, key: StringFormKey, label: string, opts?: NumOptions & { optional?: false }): number;
export function num(v: FormInput, key: StringFormKey, label: string, opts: NumOptions): number | null;
export function num(
  v: FormInput,
  key: StringFormKey,
  label: string,
  { min = -Infinity, max = Infinity, optional = false }: NumOptions = {},
): number | null {
  if (v[key] === "" && optional) return null;
  const x = Number(v[key]);
  if (v[key] === "" || !Number.isFinite(x) || x < min || x > max) {
    throw invalid(key, `${label}: enter a number${rangeText(min, max)}.`);
  }
  return x;
}

export function list(v: FormInput, key: StringFormKey, label: string, n: number): number[] {
  const xs = v[key]
    .split(/[\s,;]+/u)
    .filter(Boolean)
    .map(Number);
  if (xs.length !== n || xs.some((x) => !Number.isFinite(x) || x < 0))
    throw invalid(key, `${label}: enter ${n} numbers (zero or more).`);
  return xs;
}

/** What has to be downloaded: location, period and panel orientation. */
export function dataRequest(v: FormInput): DataRequest {
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
export function captureParams(v: FormInput): Pick<ModelParams, "captureAreaM2" | "captureDesc"> {
  if (v.captureShape === "rect") {
    const w = num(v, "captureW", "Capture width", { min: 0.01, max: 500 });
    const h = num(v, "captureH", "Capture height", { min: 0.01, max: 500 });
    return { captureAreaM2: squareMetres(w * h), captureDesc: `${fmt(w, 2)} × ${fmt(h, 2)} m opening` };
  }
  const d = num(v, "captureM", "Diameter", { min: 0.01, max: 200 });
  return { captureAreaM2: circleArea(metres(d)), captureDesc: `${fmt(d, 2)} m diameter` };
}

/** The capture area (m²) the form describes, read leniently (NaN or 0 while a field is unfinished). */
export function enteredCaptureArea(): number {
  const el = form.elements;
  return el.captureShape.value === "rect"
    ? Number(el.captureW.value) * Number(el.captureH.value)
    : circleArea(metres(Number(el.captureM.value)));
}

/** Shows the diameter or width × height fields to match the opening shape, and the area they give. */
export function syncCapture(): void {
  const el = form.elements;
  const rect = el.captureShape.value === "rect";
  // Switching to a rectangle for the first time: start from a square as wide as the diameter.
  if (rect && el.captureW.value === "" && el.captureH.value === "")
    el.captureW.value = el.captureH.value = el.captureM.value;
  $("#captureRound").hidden = rect;
  $("#captureRect").hidden = !rect;
  const area = enteredCaptureArea();
  $("#captureArea").textContent = area > 0 ? `Capture area ${fmt(area, area < 10 ? 2 : 1)} m².` : "";
}

/** The model parameters from validated form input: where the numbers get their units. */
export function modelParams(v: FormInput): ModelParams {
  let curvePts: CurvePoint[];
  try {
    curvePts = parseCurve(v.curve);
  } catch (e: unknown) {
    throw invalid("curve", e instanceof Error ? e.message : String(e));
  }
  return {
    nTurbines: Math.round(num(v, "nTurbines", "Number of turbines", { min: 1, max: 100_000 })),
    hubHeight: metres(num(v, "hubHeight", "Hub height", { min: 1, max: 200 })),
    curvePts,
    ...captureParams(v),
    augmentation: num(v, "augmentation", "Duct augmentation", { min: 1, max: 10 }),
    clampPhysics: v.clampPhysics,
    densityCorrection: v.densityCorrection,
    windLossPct: percent(num(v, "windLossPct", "Wind system losses", { min: 0, max: 90 })),
    siteMeanKmh: kmh(num(v, "siteMeanKmh", "Measured mean wind", { min: 0, max: 100, optional: true }) ?? 0),
    windScale: num(v, "windScale", "Wind scale", { min: 0.1, max: 5 }),
    pvKwp: kw(num(v, "pvKwp", "PV size", { min: 0 })),
    pvLossPct: percent(num(v, "pvLossPct", "PV losses", { min: 0, max: 90 })),
    tempCoeffPct: num(v, "tempCoeffPct", "Temperature coefficient", { min: -2, max: 0 }),
    loadKwh: kwh(num(v, "loadKwh", "Annual use", { min: 0 })),
    loadProfile: v.loadProfile,
    loadHourly: list(v, "loadHourly", "Hourly shape", 24),
    loadMonthly: list(v, "loadMonthly", "Monthly shape", 12),
    battKwh: kwh(num(v, "battKwh", "Battery capacity", { min: 0 })),
    battKw: kw(num(v, "battKw", "Battery power", { min: 0 })),
    battMinSoc: fraction(num(v, "battMinSoc", "Minimum charge", { min: 0, max: 100 }) / 100),
    battRte: fraction(num(v, "battRte", "Round-trip efficiency", { min: 50, max: 100 }) / 100),
    inverterKw: kw(num(v, "inverterKw", "Inverter limit", { min: 0.1, optional: true }) ?? 0),
    currency: v.currency === "" ? "$" : v.currency,
    price: num(v, "price", "Grid price", { min: 0 }),
    exportCredit: num(v, "exportCredit", "Export credit", { min: 0 }),
    turbineCost: num(v, "turbineCost", "Installed cost", { min: 0 }),
    omPerTurbine: num(v, "omPerTurbine", "Maintenance", { min: 0 }),
  };
}
