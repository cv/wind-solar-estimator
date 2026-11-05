// Input and result types of the hourly simulation (see simulate.ts).

import type { CurvePoint } from "./powerCurve.ts";
import type { Weather } from "../data/weather.ts";

/** The weather fields simulate reads. */
export type SimWeather = Pick<
  Weather,
  "n" | "years" | "elevation" | "year" | "month" | "hour" | "w10" | "w100" | "temp" | "gti"
>;

/** Simulation inputs. Units: km/h, m, m², kW, kWh, %, fractions (0–1) where noted. */
export interface ModelParams {
  nTurbines: number;
  hubHeight: number;
  curvePts: readonly CurvePoint[];
  captureAreaM2: number;
  /** Readable description of the capture area (display only). */
  captureDesc?: string;
  augmentation: number;
  clampPhysics: boolean;
  densityCorrection: boolean;
  windLossPct: number;
  /** Measured mean wind at hub height; 0 = use windScale instead. */
  siteMeanKmh: number;
  windScale: number;
  pvKwp: number;
  pvLossPct: number;
  tempCoeffPct: number;
  loadKwh: number;
  /** A LoadProfileKey, or another name (e.g. "custom") for a hand-entered shape. */
  loadProfile: string;
  loadHourly: readonly number[];
  loadMonthly: readonly number[];
  battKwh: number;
  battKw: number;
  /** Fraction 0–1. */
  battMinSoc: number;
  /** Round-trip efficiency, fraction 0–1. */
  battRte: number;
  /** Shared inverter limit (kW); 0 or absent = no limit. */
  inverterKw?: number;
  /** Currency symbol (display only). */
  currency?: string;
  price: number;
  exportCredit: number;
  turbineCost: number;
  omPerTurbine: number;
}

/** Grid exchange per year for one system (PV only, or PV with the turbines). */
export interface Scenario {
  importKwh: number;
  exportKwh: number;
  selfSufficiency: number;
}

export type MonthlySeries = "wind" | "pv" | "load" | "importPv" | "importBoth";

/** Average state of charge (0–1) by month (12) and hour (24); null where there are no hours. */
export type SocDay = Array<Array<number | null>>;

export interface SimResult {
  hours: number;
  years: number;
  meanW10: number;
  meanW100: number;
  meanAlpha: number;
  modelHubMean: number;
  scale: number;
  meanHub: number;
  ratedKw: number;
  windKwh: number;
  windKwhPerTurbine: number;
  capacityFactor: number;
  generatingShare: number;
  physicsCapKwh: number;
  clippedKwh: number;
  inverterLostKwh: { pvOnly: number; withWind: number };
  pvKwh: number;
  loadKwh: number;
  pvOnly: Scenario;
  withWind: Scenario;
  /** kWh per calendar month (12 values each), per year. */
  monthly: Record<MonthlySeries, number[]>;
  yearly: Array<{ year: number; kwh: number }>;
  /** Hours and wind energy per year by hub wind speed bin. */
  hist: { binKmh: number; hours: number[]; energy: number[] };
  socDay: { pvOnly: SocDay; withWind: SocDay };
  econ: {
    savings: number;
    om: number;
    capex: number;
    netSavings: number;
    payback: number;
    costPerKwh20: number;
  };
}
