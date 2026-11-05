// Constants and form defaults: colours, thresholds, DEFAULTS and the share-link version.
import { LOAD_PRESETS } from "../model/load.ts";
import { EXAMPLE_ROTOR_M, exampleCurve, formatCurve } from "../model/powerCurve.ts";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export type MonthName = (typeof MONTHS)[number];
export const API_KEY_STORAGE = "siteEstimator.apiKey";
export const COLORS = {
  wind: "#1f77b4",
  solar: "#f2a900",
  load: "#444",
  grey: "#9aa3b5",
  limit: "#c62828",
} as const satisfies Record<string, string>;
export type Colors = typeof COLORS;
export type ColorName = keyof Colors;
export const ERA5_CELL_DEG = 0.25;
export const AUTO_STATION_KM = 50; // "auto" uses the nearest station with hourly records within this distance
export const MIN_AUTO_COVERAGE = 0.5; // ...if it has wind readings for at least this share of the hours
export const ELEVATION_NOTE_M = 150; // a station this much higher or lower than the site gets a caution note
export const ELEVATION_SAY_M = 50; // below this, the picker doesn't mention the height difference

/** Every form field (by its name attribute) and its value: text as entered, or a checkbox's state. */
export interface FormValues {
  place: string;
  lat: string;
  lon: string;
  /** "auto", "model" or "eccc:<station id>". */
  windSource: string;
  years: string;
  endYear: string;
  nTurbines: string;
  hubHeight: string;
  curve: string;
  /** "round" or "rect". */
  captureShape: string;
  captureM: string;
  captureW: string;
  captureH: string;
  augmentation: string;
  clampPhysics: boolean;
  densityCorrection: boolean;
  windLossPct: string;
  siteMeanKmh: string;
  windScale: string;
  pvKwp: string;
  pvLossPct: string;
  tilt: string;
  azimuth: string;
  tempCoeffPct: string;
  loadKwh: string;
  /** A LoadProfileKey, or "custom". */
  loadProfile: string;
  loadHourly: string;
  loadMonthly: string;
  battKwh: string;
  battKw: string;
  battMinSoc: string;
  battRte: string;
  inverterKw: string;
  currency: string;
  price: string;
  exportCredit: string;
  turbineCost: string;
  omPerTurbine: string;
}

/** A form field name (and share-link key). */
export type FormKey = keyof FormValues;
/** Fields that are checkboxes. */
export type BooleanFormKey = { [K in FormKey]: FormValues[K] extends boolean ? K : never }[FormKey];
/** Fields holding text (numbers as typed included). */
export type StringFormKey = Exclude<FormKey, BooleanFormKey>;
/** What readForm returns: the form values plus the API key (kept out of share links). */
export type FormInput = FormValues & { apiKey: string };
/** Some form values, e.g. from a share link or older defaults. */
export type FormOverrides = Partial<FormValues>;

export const DEFAULTS: Readonly<FormValues> = {
  place: "Lethbridge, Alberta, Canada",
  lat: "49.6935",
  lon: "-112.8418",
  windSource: "auto",
  years: "20",
  endYear: String(new Date().getFullYear() - 1),
  nTurbines: "1",
  hubHeight: "16",
  curve: formatCurve(exampleCurve()),
  captureShape: "round",
  captureM: String(EXAMPLE_ROTOR_M),
  captureW: "",
  captureH: "",
  augmentation: "1",
  clampPhysics: false,
  densityCorrection: true,
  windLossPct: "5",
  siteMeanKmh: "",
  windScale: "1",
  pvKwp: "3",
  pvLossPct: "14",
  tilt: "",
  azimuth: "",
  tempCoeffPct: "-0.4",
  loadKwh: "11800",
  loadProfile: "residential",
  loadHourly: LOAD_PRESETS.residential.hourly.join(", "),
  loadMonthly: LOAD_PRESETS.residential.monthly.join(", "),
  battKwh: "48",
  battKw: "6",
  battMinSoc: "50",
  battRte: "82",
  inverterKw: "6",
  currency: "$",
  price: "0.20",
  exportCredit: "0.08",
  turbineCost: "20000",
  omPerTurbine: "200",
};

// Share links leave out values equal to the defaults, so they carry a version: a link
// without one was made with these earlier defaults, and keeps meaning what it meant.
export const HASH_VERSION = "2";
export const DEFAULTS_V1: Readonly<FormOverrides> = {
  place: "Amarillo, Texas, United States",
  hubHeight: "18",
  curve:
    "0, 0\n10.9, 0\n11, 40\n14, 120\n17, 260\n20, 440\n23, 660\n26, 960\n29, 1330\n32, 1780\n35, 2330\n38, 2990\n41, 3500\n90, 3500",
  captureM: "4",
  pvKwp: "10",
  loadKwh: "15000",
  battKwh: "20",
  battKw: "5",
  battMinSoc: "20",
  battRte: "90",
  inverterKw: "",
  turbineCost: "25000",
  omPerTurbine: "250",
};
