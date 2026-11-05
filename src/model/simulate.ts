// Pure simulation code (no DOM), so it can be unit-tested in Node.
// Units: wind speed km/h, power W (turbine curve) or kW (system), energy kWh.

import { STD_RHO, betzLimitW, airDensity } from "./physics.ts";
import { makeCurveFn, type CurvePoint } from "./powerCurve.ts";
import { battery, type Battery } from "./battery.ts";
import type { Weather } from "../data/weather.ts";

export const HOURS_PER_YEAR = 8766;

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
export type SocDay = (number | null)[][];

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
  yearly: { year: number; kwh: number }[];
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

// Checked reads for the hourly loops. Same contract as at() in ../util/checked.ts, but one
// function per element kind: the shared at() sees every array type in the app, so V8 can't
// inline its load (simulate() took ~28 ms instead of ~17 ms in scripts/bench.ts).
const outOfRange = (i: number, length: number): RangeError =>
  new RangeError(`index ${i} out of range (length ${length})`);
function f32(arr: Float32Array, i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}
function u8(arr: Uint8Array, i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}
function u16(arr: Uint16Array, i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}
function f64(arr: Float64Array, i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}
function num(arr: readonly number[], i: number): number {
  const v = arr[i];
  if (v === undefined) throw outOfRange(i, arr.length);
  return v;
}

const zeros = (n: number): Float64Array => new Float64Array(n);

/**
 * Hour-by-hour simulation of PV + battery, with and without the turbines.
 * wx: { n, years, elevation, year, month, hour, w10, w100, temp, gti } (dense arrays, local time)
 */
export function simulate(wx: SimWeather, p: ModelParams): SimResult {
  const { n } = wx;
  const curve = makeCurveFn(p.curvePts);
  const ratedW = Math.max(...p.curvePts.map((q) => q[1]));
  const nYears = wx.years;

  // 1. Wind at hub height: per-hour shear exponent from the 10 m and 100 m winds.
  const hub = new Float32Array(n);
  const lnH = Math.log(p.hubHeight / 10);
  let sum10 = 0,
    sum100 = 0,
    sumHub = 0,
    sumAlpha = 0;
  for (let i = 0; i < n; i++) {
    const a = f32(wx.w10, i);
    const b = f32(wx.w100, i);
    let alpha = 1 / 7;
    if (a > 1 && b > 0) alpha = Math.min(0.6, Math.max(0, Math.log(b / a) / Math.LN10));
    const h = a * Math.exp(alpha * lnH);
    hub[i] = h;
    sum10 += a;
    sum100 += b;
    sumHub += Math.fround(h); // the value as stored in the Float32Array
    sumAlpha += alpha;
  }
  const modelHubMean = sumHub / n;
  const scale = p.siteMeanKmh > 0 ? p.siteMeanKmh / modelHubMean : p.windScale;

  // 2. Load shape, scaled so the yearly total matches the input.
  const load = new Float32Array(n);
  let loadRaw = 0;
  for (let i = 0; i < n; i++) {
    const l = num(p.loadHourly, u8(wx.hour, i)) * num(p.loadMonthly, u8(wx.month, i));
    load[i] = l;
    loadRaw += l;
  }
  const loadScale = loadRaw > 0 ? (p.loadKwh * nYears) / loadRaw : 0;

  const pvOnly = battery(p.battKwh, p.battMinSoc, p.battRte, p.battKw);
  const withWind = battery(p.battKwh, p.battMinSoc, p.battRte, p.battKw);

  const BIN = 2,
    NBINS = 50;
  const histHours = zeros(NBINS),
    histEnergy = zeros(NBINS);
  const m: Record<MonthlySeries, Float64Array> = {
    wind: zeros(12),
    pv: zeros(12),
    load: zeros(12),
    importPv: zeros(12),
    importBoth: zeros(12),
  };
  const byYear = new Map<number, number>();
  const soc = { pvOnly: zeros(288), withWind: zeros(288), count: zeros(288) };
  let wind = 0,
    pv = 0,
    loadTot = 0,
    physicsCap = 0,
    sumV = 0,
    genHours = 0,
    clipped = 0;
  const windLoss = 1 - p.windLossPct / 100;
  // A shared inverter caps what wind and solar together can deliver; the rest is lost.
  const inverterKw = p.inverterKw ?? 0;
  const inverter = inverterKw > 0 ? inverterKw : Infinity;
  let invLostPv = 0,
    invLostBoth = 0;
  const pvLoss = 1 - p.pvLossPct / 100;

  for (let i = 0; i < n; i++) {
    const v = f32(hub, i) * scale;
    const t = f32(wx.temp, i);
    const rho = airDensity(wx.elevation, t);
    let w = curve(v);
    if (p.densityCorrection) w *= rho / STD_RHO;
    const limit = betzLimitW(v, p.captureAreaM2, rho) * p.augmentation;
    if (p.clampPhysics && w > limit) {
      clipped += ((w - limit) * p.nTurbines) / 1000;
      w = limit;
    }
    const windKw = ((w * p.nTurbines) / 1000) * windLoss;

    const g = f32(wx.gti, i);
    const cellT = t + (g * 25) / 800;
    const pvKw = Math.max(0, ((p.pvKwp * g) / 1000) * pvLoss * (1 + (p.tempCoeffPct / 100) * (cellT - 25)));
    const L = f32(load, i) * loadScale;

    const outPv = Math.min(pvKw, inverter);
    const outBoth = Math.min(pvKw + windKw, inverter);
    invLostPv += pvKw - outPv;
    invLostBoth += pvKw + windKw - outBoth;
    const gridPv = pvOnly.step(outPv - L);
    const gridBoth = withWind.step(outBoth - L);

    const mo = u8(wx.month, i);
    const slot = mo * 24 + u8(wx.hour, i);
    wind += windKw;
    pv += pvKw;
    loadTot += L;
    sumV += v;
    physicsCap += (limit * p.nTurbines) / 1000;
    if (windKw > 0) genHours++;
    m.wind[mo] = f64(m.wind, mo) + windKw;
    m.pv[mo] = f64(m.pv, mo) + pvKw;
    m.load[mo] = f64(m.load, mo) + L;
    if (gridPv > 0) m.importPv[mo] = f64(m.importPv, mo) + gridPv;
    if (gridBoth > 0) m.importBoth[mo] = f64(m.importBoth, mo) + gridBoth;
    const bin = Math.min(NBINS - 1, Math.floor(v / BIN));
    // A negative or NaN speed (never in real data, possible in synthetic tests) has no bin and stays out of the histogram.
    if (bin >= 0) {
      histHours[bin] = f64(histHours, bin) + 1;
      histEnergy[bin] = f64(histEnergy, bin) + windKw;
    }
    const year = u16(wx.year, i);
    byYear.set(year, (byYear.get(year) || 0) + windKw); // a year's first hour starts from 0
    if (p.battKwh > 0) {
      soc.pvOnly[slot] = f64(soc.pvOnly, slot) + pvOnly.soc / p.battKwh;
      soc.withWind[slot] = f64(soc.withWind, slot) + withWind.soc / p.battKwh;
    }
    soc.count[slot] = f64(soc.count, slot) + 1;
  }

  const perYear = (x: number): number => x / nYears;
  const monthly: Record<MonthlySeries, number[]> = {
    wind: Array.from(m.wind, perYear),
    pv: Array.from(m.pv, perYear),
    load: Array.from(m.load, perYear),
    importPv: Array.from(m.importPv, perYear),
    importBoth: Array.from(m.importBoth, perYear),
  };
  const hist = { binKmh: BIN, hours: Array.from(histHours, perYear), energy: Array.from(histEnergy, perYear) };
  const socDay = (arr: Float64Array): SocDay =>
    Array.from({ length: 12 }, (_, mo) =>
      Array.from({ length: 24 }, (_slot, h) => {
        const count = f64(soc.count, mo * 24 + h);
        return count ? f64(arr, mo * 24 + h) / count : null;
      }),
    );

  const scenario = (b: Battery): Scenario => ({
    importKwh: perYear(b.imported),
    exportKwh: perYear(b.exported),
    selfSufficiency: loadTot > 0 ? 1 - b.imported / loadTot : 0,
  });
  const A = scenario(pvOnly);
  const B = scenario(withWind);
  const windKwh = perYear(wind);

  const savings = (A.importKwh - B.importKwh) * p.price + (B.exportKwh - A.exportKwh) * p.exportCredit;
  const capex = p.turbineCost * p.nTurbines;
  const om = p.omPerTurbine * p.nTurbines;
  const netSavings = savings - om;

  return {
    hours: n,
    years: nYears,
    meanW10: sum10 / n,
    meanW100: sum100 / n,
    meanAlpha: sumAlpha / n,
    modelHubMean,
    scale,
    meanHub: sumV / n,
    ratedKw: (ratedW * p.nTurbines) / 1000,
    windKwh,
    windKwhPerTurbine: windKwh / p.nTurbines,
    capacityFactor: ratedW > 0 ? wind / (((ratedW * p.nTurbines) / 1000) * n) : 0,
    generatingShare: genHours / n,
    physicsCapKwh: perYear(physicsCap),
    clippedKwh: perYear(clipped),
    inverterLostKwh: { pvOnly: perYear(invLostPv), withWind: perYear(invLostBoth) },
    pvKwh: perYear(pv),
    loadKwh: perYear(loadTot),
    pvOnly: A,
    withWind: B,
    monthly,
    yearly: [...byYear.entries()].toSorted((a, b) => a[0] - b[0]).map(([year, kwh]) => ({ year, kwh })),
    hist,
    socDay: { pvOnly: socDay(soc.pvOnly), withWind: socDay(soc.withWind) },
    econ: {
      savings,
      om,
      capex,
      netSavings,
      payback: netSavings > 0 ? capex / netSavings : Infinity,
      costPerKwh20: windKwh > 0 ? (capex + om * 20) / (windKwh * 20) : Infinity,
    },
  };
}
