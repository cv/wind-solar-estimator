// Input and result types of the hourly simulation (see simulate.ts).

import type { CurvePoint } from "./powerCurve.ts";
import type { Fraction, Kmh, Kw, Kwh, Metres, Percent, SquareMetres } from "./units.ts";
import type { Weather } from "../data/weather.ts";

/** The weather fields simulate reads. */
export type SimWeather = Pick<
  Weather,
  "n" | "years" | "elevation" | "year" | "month" | "hour" | "w10" | "w100" | "temp" | "gti"
>;

/** Simulation inputs; the types carry the units (see units.ts). */
export interface ModelParams {
  nTurbines: number;
  hubHeight: Metres;
  curvePts: readonly CurvePoint[];
  captureAreaM2: SquareMetres;
  /** Readable description of the capture area (display only). */
  captureDesc?: string;
  augmentation: number;
  clampPhysics: boolean;
  densityCorrection: boolean;
  windLossPct: Percent;
  /** Measured mean wind at hub height; 0 = use windScale instead. */
  siteMeanKmh: Kmh;
  windScale: number;
  pvKwp: Kw;
  pvLossPct: Percent;
  /** PV output change per °C of cell temperature, % (negative). */
  tempCoeffPct: number;
  /** Yearly use. */
  loadKwh: Kwh;
  /** A LoadProfileKey, or another name (e.g. "custom") for a hand-entered shape. */
  loadProfile: string;
  loadHourly: readonly number[];
  loadMonthly: readonly number[];
  battKwh: Kwh;
  battKw: Kw;
  battMinSoc: Fraction;
  /** Round-trip efficiency. */
  battRte: Fraction;
  /** Shared inverter limit; 0 = no limit. */
  inverterKw: Kw;
  /** Currency symbol (display only). */
  currency?: string;
  price: number;
  exportCredit: number;
  turbineCost: number;
  /** Cost per metre of hub height, per turbine, added to turbineCost; 0 = the tower is in turbineCost. */
  towerCostPerM: number;
  omPerTurbine: number;
}

/** Grid exchange per year for one system (PV only, or PV with the turbines). */
export interface Scenario {
  importKwh: Kwh;
  exportKwh: Kwh;
  selfSufficiency: Fraction;
}

export type MonthlySeries = "wind" | "pv" | "load" | "importPv" | "importBoth";

/** Average state of charge by month (12) and hour (24); null where there are no hours. */
export type SocDay = Array<Array<Fraction | null>>;

export interface SimResult {
  hours: number;
  years: number;
  meanW10: Kmh;
  meanW100: Kmh;
  meanAlpha: number;
  modelHubMean: Kmh;
  scale: number;
  meanHub: Kmh;
  ratedKw: Kw;
  /** Energy figures are per year. */
  windKwh: Kwh;
  windKwhPerTurbine: Kwh;
  capacityFactor: Fraction;
  generatingShare: Fraction;
  physicsCapKwh: Kwh;
  clippedKwh: Kwh;
  inverterLostKwh: { pvOnly: Kwh; withWind: Kwh };
  pvKwh: Kwh;
  loadKwh: Kwh;
  pvOnly: Scenario;
  withWind: Scenario;
  /** kWh per calendar month (12 values each), per year. */
  monthly: Record<MonthlySeries, Kwh[]>;
  yearly: Array<{ year: number; kwh: Kwh }>;
  /** Hours and wind energy per year by hub wind speed bin. */
  hist: { binKmh: Kmh; hours: number[]; energy: Kwh[] };
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
