// Pure simulation code (no DOM), so it can be unit-tested in Node.
// Units: wind speed km/h, power W (turbine curve) or kW (system), energy kWh.

import { STD_RHO, betzLimitW, airDensity } from "./physics.ts";
import { makeCurveFn } from "./powerCurve.ts";
import { battery, type Battery } from "./battery.ts";
import { f32, f64, num, u16, u8 } from "./checkedArrays.ts";
import { fraction, kmh, kw, kwh, metres } from "./units.ts";
import type { Celsius, Kmh, Kwh } from "./units.ts";
import type { ModelParams, MonthlySeries, Scenario, SimResult, SimWeather, SocDay } from "./simTypes.ts";

export type { ModelParams, MonthlySeries, Scenario, SimResult, SimWeather, SocDay } from "./simTypes.ts";

export const HOURS_PER_YEAR = 8766;

const BIN = 2;
const NBINS = 50;

const zeros = (n: number): Float64Array => new Float64Array(n);

/** Hub-height wind (model scale) and the means it was derived from. */
interface HubWind {
  hub: Float32Array;
  meanW10: number;
  meanW100: number;
  meanAlpha: number;
  modelHubMean: number;
  /** Factor from model hub wind to site hub wind. */
  scale: number;
}

/** The hourly loop's inputs: hub wind and load shape, each with its scale factor. */
interface HourlyInputs {
  hub: Float32Array;
  scale: number;
  load: Float32Array;
  loadScale: number;
}

interface Batteries {
  pvOnly: Battery;
  withWind: Battery;
}

/** Per-month, per-bin, per-year and per-slot sums filled by the hourly loop. */
interface Tallies {
  m: Record<MonthlySeries, Float64Array>;
  histHours: Float64Array;
  histEnergy: Float64Array;
  byYear: Map<number, number>;
  /** Sums by month × 24 + hour. */
  soc: { pvOnly: Float64Array; withWind: Float64Array; count: Float64Array };
}

/** Whole-period sums from the hourly loop (kWh, except sumV and genHours). */
interface Totals {
  wind: number;
  pv: number;
  load: number;
  physicsCap: number;
  sumV: number;
  genHours: number;
  clipped: number;
  invLostPv: number;
  invLostBoth: number;
}

/** Wind at hub height: per-hour shear exponent from the 10 m and 100 m winds. */
function hubWind(wx: SimWeather, p: ModelParams): HubWind {
  const { n } = wx;
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
    if (a > 1 && b > 0) alpha = Math.min(0.6, Math.max(0, Math.log10(b / a)));
    const h = a * Math.exp(alpha * lnH);
    hub[i] = h;
    sum10 += a;
    sum100 += b;
    sumHub += Math.fround(h); // the value as stored in the Float32Array
    sumAlpha += alpha;
  }
  const modelHubMean = sumHub / n;
  return {
    hub,
    meanW10: sum10 / n,
    meanW100: sum100 / n,
    meanAlpha: sumAlpha / n,
    modelHubMean,
    scale: p.siteMeanKmh > 0 ? p.siteMeanKmh / modelHubMean : p.windScale,
  };
}

/** Load shape per hour, and the factor that makes its yearly total match the input. */
function loadShape(wx: SimWeather, p: ModelParams): { load: Float32Array; loadScale: number } {
  const { n } = wx;
  const load = new Float32Array(n);
  let loadRaw = 0;
  for (let i = 0; i < n; i++) {
    const l = num(p.loadHourly, u8(wx.hour, i)) * num(p.loadMonthly, u8(wx.month, i));
    load[i] = l;
    loadRaw += l;
  }
  return { load, loadScale: loadRaw > 0 ? (p.loadKwh * wx.years) / loadRaw : 0 };
}

function newTallies(): Tallies {
  return {
    m: { wind: zeros(12), pv: zeros(12), load: zeros(12), importPv: zeros(12), importBoth: zeros(12) },
    histHours: zeros(NBINS),
    histEnergy: zeros(NBINS),
    byYear: new Map<number, number>(),
    soc: { pvOnly: zeros(288), withWind: zeros(288), count: zeros(288) },
  };
}

/** The hot loop: wind and PV output, both batteries, and the tallies, hour by hour. */
function runHours(wx: SimWeather, p: ModelParams, inp: HourlyInputs, bat: Batteries, t: Tallies): Totals {
  const { hub, scale, load, loadScale } = inp;
  const { pvOnly, withWind } = bat;
  const { m, histHours, histEnergy, byYear, soc } = t;
  const curve = makeCurveFn(p.curvePts);
  let wind = 0,
    pv = 0,
    loadTot = 0,
    physicsCap = 0,
    sumV = 0,
    genHours = 0,
    clipped = 0,
    invLostPv = 0,
    invLostBoth = 0;
  const windLoss = 1 - p.windLossPct / 100;
  // A shared inverter caps what wind and solar together can deliver; the rest is lost.
  const inverter = p.inverterKw > 0 ? p.inverterKw : Infinity;
  const pvLoss = 1 - p.pvLossPct / 100;
  const elevation = metres(wx.elevation);

  for (let i = 0; i < wx.n; i++) {
    // This module's only unit casts: the typed arrays hold plain numbers, and a cast costs
    // nothing at runtime where a constructor call every hour might not.
    /* eslint-disable typescript/no-unsafe-type-assertion -- see above */
    const v = (f32(hub, i) * scale) as Kmh;
    const temp = f32(wx.temp, i) as Celsius;
    /* eslint-enable typescript/no-unsafe-type-assertion */
    const rho = airDensity(elevation, temp);
    let w: number = curve(v);
    if (p.densityCorrection) w *= rho / STD_RHO;
    const limit = betzLimitW(v, p.captureAreaM2, rho) * p.augmentation;
    if (p.clampPhysics && w > limit) {
      clipped += ((w - limit) * p.nTurbines) / 1000;
      w = limit;
    }
    const windKw = ((w * p.nTurbines) / 1000) * windLoss;

    const g = f32(wx.gti, i);
    const cellT = temp + (g * 25) / 800;
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
    // A year's first hour starts from 0; as before, a NaN running total also restarts from 0.
    const sofar = byYear.get(year) ?? 0;
    byYear.set(year, (Number.isNaN(sofar) ? 0 : sofar) + windKw);
    if (p.battKwh > 0) {
      soc.pvOnly[slot] = f64(soc.pvOnly, slot) + pvOnly.soc / p.battKwh;
      soc.withWind[slot] = f64(soc.withWind, slot) + withWind.soc / p.battKwh;
    }
    soc.count[slot] = f64(soc.count, slot) + 1;
  }
  return { wind, pv, load: loadTot, physicsCap, sumV, genHours, clipped, invLostPv, invLostBoth };
}

/** Average of a month × hour sum over its hour count; null where there are no hours. */
const socDayOf = (arr: Float64Array, count: Float64Array): SocDay =>
  Array.from({ length: 12 }, (_, mo) =>
    Array.from({ length: 24 }, (_slot, h) => {
      const c = f64(count, mo * 24 + h);
      return c ? fraction(f64(arr, mo * 24 + h) / c) : null;
    }),
  );

/** The tallies as per-year series. */
function perYearSeries(t: Tallies, nYears: number): Pick<SimResult, "monthly" | "yearly" | "hist" | "socDay"> {
  const perYear = (x: number): Kwh => kwh(x / nYears);
  const { m, soc } = t;
  return {
    monthly: {
      wind: Array.from(m.wind, perYear),
      pv: Array.from(m.pv, perYear),
      load: Array.from(m.load, perYear),
      importPv: Array.from(m.importPv, perYear),
      importBoth: Array.from(m.importBoth, perYear),
    },
    yearly: [...t.byYear.entries()].toSorted((a, b) => a[0] - b[0]).map(([year, total]) => ({ year, kwh: kwh(total) })),
    hist: {
      binKmh: kmh(BIN),
      hours: Array.from(t.histHours, (x) => x / nYears),
      energy: Array.from(t.histEnergy, perYear),
    },
    socDay: { pvOnly: socDayOf(soc.pvOnly, soc.count), withWind: socDayOf(soc.withWind, soc.count) },
  };
}

const scenarioOf = (b: Battery, nYears: number, loadTot: number): Scenario => ({
  importKwh: kwh(b.imported / nYears),
  exportKwh: kwh(b.exported / nYears),
  selfSufficiency: fraction(loadTot > 0 ? 1 - b.imported / loadTot : 0),
});

/** Yearly savings from the turbines against PV only, and what the turbines cost. */
function economics(p: ModelParams, A: Scenario, B: Scenario, windKwh: Kwh): SimResult["econ"] {
  const savings = (A.importKwh - B.importKwh) * p.price + (B.exportKwh - A.exportKwh) * p.exportCredit;
  const capex = p.turbineCost * p.nTurbines;
  const om = p.omPerTurbine * p.nTurbines;
  const netSavings = savings - om;
  return {
    savings,
    om,
    capex,
    netSavings,
    payback: netSavings > 0 ? capex / netSavings : Infinity,
    costPerKwh20: windKwh > 0 ? (capex + om * 20) / (windKwh * 20) : Infinity,
  };
}

/**
 * Hour-by-hour simulation of PV + battery, with and without the turbines.
 * wx: { n, years, elevation, year, month, hour, w10, w100, temp, gti } (dense arrays, local time)
 */
export function simulate(wx: SimWeather, p: ModelParams): SimResult {
  const { n, years: nYears } = wx;
  const ratedW = Math.max(...p.curvePts.map((q) => q[1]));
  const hw = hubWind(wx, p);
  const { load, loadScale } = loadShape(wx, p);
  const bat: Batteries = {
    pvOnly: battery(p.battKwh, p.battMinSoc, p.battRte, p.battKw),
    withWind: battery(p.battKwh, p.battMinSoc, p.battRte, p.battKw),
  };
  const tallies = newTallies();
  const tot = runHours(wx, p, { hub: hw.hub, scale: hw.scale, load, loadScale }, bat, tallies);

  const perYear = (x: number): Kwh => kwh(x / nYears);
  const A = scenarioOf(bat.pvOnly, nYears, tot.load);
  const B = scenarioOf(bat.withWind, nYears, tot.load);
  const windKwh = perYear(tot.wind);
  const ratedKw = kw((ratedW * p.nTurbines) / 1000);
  const series = perYearSeries(tallies, nYears);
  return {
    hours: n,
    years: nYears,
    meanW10: kmh(hw.meanW10),
    meanW100: kmh(hw.meanW100),
    meanAlpha: hw.meanAlpha,
    modelHubMean: kmh(hw.modelHubMean),
    scale: hw.scale,
    meanHub: kmh(tot.sumV / n),
    ratedKw,
    windKwh,
    windKwhPerTurbine: kwh(windKwh / p.nTurbines),
    capacityFactor: fraction(ratedW > 0 ? tot.wind / (ratedKw * n) : 0),
    generatingShare: fraction(tot.genHours / n),
    physicsCapKwh: perYear(tot.physicsCap),
    clippedKwh: perYear(tot.clipped),
    inverterLostKwh: { pvOnly: perYear(tot.invLostPv), withWind: perYear(tot.invLostBoth) },
    pvKwh: perYear(tot.pv),
    loadKwh: perYear(tot.load),
    pvOnly: A,
    withWind: B,
    monthly: series.monthly,
    yearly: series.yearly,
    hist: series.hist,
    socDay: series.socDay,
    econ: economics(p, A, B, windKwh),
  };
}
