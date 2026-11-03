// Pure simulation code (no DOM), so it can be unit-tested in Node.
// Units: wind speed km/h, power W (turbine curve) or kW (system), energy kWh.

export const BETZ = 16 / 27; // 0.593, the most any open rotor can extract
export const STD_RHO = 1.225; // kg/m³ at sea level, 15 °C (power curves are quoted at this)
export const HOURS_PER_YEAR = 8766;

export const EXAMPLE_ROTOR_M = 4;

/** Area (m²) of a circle of this diameter (m). */
export const circleArea = (diameterM) => Math.PI * (diameterM / 2) ** 2;

/**
 * Illustrative power curve for a generic 3.5 kW turbine with a 4 m rotor: cut-in at
 * 11 km/h, power coefficient rising from 0.2 to 0.33, rated from about 40 km/h,
 * cut-out above 90 km/h. Replace it with the real turbine's measured curve.
 */
export function exampleCurve() {
  const area = circleArea(EXAMPLE_ROTOR_M);
  const pts = [[0, 0], [10.9, 0]];
  for (let v = 11; v <= 41; v += 3) {
    const cp = Math.min(0.33, 0.2 + (v - 11) * 0.02);
    const w = 0.5 * STD_RHO * area * (v / 3.6) ** 3 * cp;
    pts.push([v, Math.min(3500, Math.round(w / 10) * 10)]);
  }
  pts.push([90, 3500]);
  return pts;
}

/** Parses "km/h, W" lines (commas, spaces, tabs or semicolons; # starts a comment). */
export function parseCurve(text) {
  const pts = [];
  for (const line of String(text).split(/\r?\n/)) {
    const s = line.replace(/#.*/, "").trim();
    if (!s) continue;
    const [v, w] = s.split(/[\s,;]+/).map(Number);
    if (!Number.isFinite(v) || !Number.isFinite(w) || v < 0 || w < 0) {
      throw new Error(`Power curve: can't read "${line.trim()}" (expected "km/h, W")`);
    }
    pts.push([v, w]);
  }
  if (pts.length < 2) throw new Error("Power curve needs at least two points");
  return pts.sort((a, b) => a[0] - b[0]);
}

export const formatCurve = (pts) => pts.map(([v, w]) => `${v}, ${w}`).join("\n");

/** Linear interpolation of the curve; 0 above its last point (cut-out). */
export function makeCurveFn(pts) {
  const maxV = pts[pts.length - 1][0];
  return (v) => {
    if (!(v >= 0) || v > maxV) return 0;
    if (v <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (v <= pts[i][0]) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (v - x0)) / (x1 - x0);
      }
    }
    return 0;
  };
}

/**
 * Most power (W) any device can take from the wind blowing through its frontal capture
 * area (m², the outline the wind sees). What happens inside (ducts, spirals, gearing,
 * torque multiplication) can redirect this energy but not add to it.
 */
export function betzLimitW(vKmh, areaM2, rho = STD_RHO) {
  return 0.5 * rho * areaM2 * (vKmh / 3.6) ** 3 * BETZ;
}

/** Air density from site elevation (standard atmosphere pressure) and air temperature. */
export function airDensity(elevationM, tempC) {
  const pressure = 101325 * Math.pow(1 - 2.25577e-5 * elevationM, 5.25588);
  return pressure / (287.05 * (tempC + 273.15));
}

/** How far the curve exceeds the physical limit for a capture area (ratio > 1 is impossible). */
export function checkCurve(pts, areaM2, augmentation) {
  let worst = 0;
  let atKmh = null;
  for (const [v, w] of pts) {
    if (v <= 0 || w <= 0) continue;
    const ratio = w / (betzLimitW(v, areaM2) * augmentation);
    if (ratio > worst) [worst, atKmh] = [ratio, v];
  }
  return { worstRatio: worst, atKmh };
}

export const LOAD_PRESETS = {
  residential: {
    label: "Farm house / residential",
    hourly: [0.6, 0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.1, 0.9, 0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 1.1, 1.5, 1.7, 1.6, 1.4, 1.2, 0.9, 0.7],
    monthly: [1.3, 1.2, 1.05, 0.95, 0.85, 0.8, 0.85, 0.85, 0.85, 0.95, 1.15, 1.3],
  },
  farm: {
    label: "Farm operation (daytime work)",
    hourly: [0.5, 0.5, 0.5, 0.5, 0.6, 0.8, 1.1, 1.4, 1.5, 1.5, 1.5, 1.4, 1.3, 1.4, 1.5, 1.5, 1.4, 1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5],
    monthly: [1.1, 1.05, 1.0, 1.0, 1.05, 1.0, 0.95, 1.0, 1.05, 1.0, 0.95, 1.05],
  },
  greenhouse: {
    label: "Greenhouse (grow lights 04–22 h, winter-heavy)",
    hourly: [0.5, 0.5, 0.5, 0.5, 1.3, 1.3, 1.3, 1.3, 1.2, 1.1, 1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.3, 1.3, 1.3, 1.3, 1.3, 0.5, 0.5],
    monthly: [1.5, 1.4, 1.2, 1.0, 0.8, 0.65, 0.6, 0.65, 0.85, 1.05, 1.3, 1.5],
  },
  flat: {
    label: "Flat (constant load)",
    hourly: Array(24).fill(1),
    monthly: Array(12).fill(1),
  },
};

function battery(capKwh, minFrac, roundTrip, maxKw) {
  const eff = Math.sqrt(roundTrip); // split losses between charging and discharging
  const floor = capKwh * minFrac;
  return {
    soc: capKwh, // start full
    imported: 0,
    exported: 0,
    /** One hour with net kW (generation − load); returns grid kWh (+ import, − export). */
    step(net) {
      if (net >= 0) {
        const charge = Math.max(0, Math.min(net, maxKw, (capKwh - this.soc) / eff));
        this.soc += charge * eff;
        this.exported += net - charge;
        return -(net - charge);
      }
      const need = -net;
      const give = Math.max(0, Math.min(need, maxKw, (this.soc - floor) * eff));
      this.soc -= give / eff;
      this.imported += need - give;
      return need - give;
    },
  };
}

const zeros = (n) => Array(n).fill(0);

/**
 * Hour-by-hour simulation of PV + battery, with and without the turbines.
 * wx: { n, years, elevation, year, month, hour, w10, w100, temp, gti } (dense arrays, local time)
 */
export function simulate(wx, p) {
  const { n } = wx;
  const curve = makeCurveFn(p.curvePts);
  const ratedW = Math.max(...p.curvePts.map((q) => q[1]));
  const nYears = wx.years;

  // 1. Wind at hub height: per-hour shear exponent from the 10 m and 100 m winds.
  const hub = new Float32Array(n);
  const lnH = Math.log(p.hubHeight / 10);
  let sum10 = 0, sum100 = 0, sumHub = 0, sumAlpha = 0;
  for (let i = 0; i < n; i++) {
    const a = wx.w10[i];
    const b = wx.w100[i];
    let alpha = 1 / 7;
    if (a > 1 && b > 0) alpha = Math.min(0.6, Math.max(0, Math.log(b / a) / Math.LN10));
    hub[i] = a * Math.exp(alpha * lnH);
    sum10 += a; sum100 += b; sumHub += hub[i]; sumAlpha += alpha;
  }
  const modelHubMean = sumHub / n;
  const scale = p.siteMeanKmh > 0 ? p.siteMeanKmh / modelHubMean : p.windScale;

  // 2. Load shape, scaled so the yearly total matches the input.
  const load = new Float32Array(n);
  let loadRaw = 0;
  for (let i = 0; i < n; i++) loadRaw += load[i] = p.loadHourly[wx.hour[i]] * p.loadMonthly[wx.month[i]];
  const loadScale = loadRaw > 0 ? (p.loadKwh * nYears) / loadRaw : 0;

  const pvOnly = battery(p.battKwh, p.battMinSoc, p.battRte, p.battKw);
  const withWind = battery(p.battKwh, p.battMinSoc, p.battRte, p.battKw);

  const BIN = 2, NBINS = 50;
  const hist = { binKmh: BIN, hours: zeros(NBINS), energy: zeros(NBINS) };
  const m = { wind: zeros(12), pv: zeros(12), load: zeros(12), importPv: zeros(12), importBoth: zeros(12) };
  const byYear = new Map();
  const soc = { pvOnly: zeros(288), withWind: zeros(288), count: zeros(288) };
  let wind = 0, pv = 0, loadTot = 0, physicsCap = 0, sumV = 0, genHours = 0, clipped = 0;
  const windLoss = 1 - p.windLossPct / 100;
  const pvLoss = 1 - p.pvLossPct / 100;

  for (let i = 0; i < n; i++) {
    const v = hub[i] * scale;
    const t = wx.temp[i];
    const rho = airDensity(wx.elevation, t);
    let w = curve(v);
    if (p.densityCorrection) w *= rho / STD_RHO;
    const limit = betzLimitW(v, p.captureAreaM2, rho) * p.augmentation;
    if (p.clampPhysics && w > limit) { clipped += (w - limit) * p.nTurbines / 1000; w = limit; }
    const windKw = (w * p.nTurbines / 1000) * windLoss;

    const g = wx.gti[i];
    const cellT = t + (g * 25) / 800;
    const pvKw = Math.max(0, (p.pvKwp * g / 1000) * pvLoss * (1 + (p.tempCoeffPct / 100) * (cellT - 25)));
    const L = load[i] * loadScale;

    const gridPv = pvOnly.step(pvKw - L);
    const gridBoth = withWind.step(pvKw + windKw - L);

    const mo = wx.month[i];
    const slot = mo * 24 + wx.hour[i];
    wind += windKw; pv += pvKw; loadTot += L; sumV += v;
    physicsCap += (limit * p.nTurbines) / 1000;
    if (windKw > 0) genHours++;
    m.wind[mo] += windKw; m.pv[mo] += pvKw; m.load[mo] += L;
    if (gridPv > 0) m.importPv[mo] += gridPv;
    if (gridBoth > 0) m.importBoth[mo] += gridBoth;
    const bin = Math.min(NBINS - 1, Math.floor(v / BIN));
    hist.hours[bin]++; hist.energy[bin] += windKw;
    byYear.set(wx.year[i], (byYear.get(wx.year[i]) || 0) + windKw);
    if (p.battKwh > 0) {
      soc.pvOnly[slot] += pvOnly.soc / p.battKwh;
      soc.withWind[slot] += withWind.soc / p.battKwh;
    }
    soc.count[slot]++;
  }

  const perYear = (x) => x / nYears;
  for (const k of Object.keys(m)) m[k] = m[k].map(perYear);
  hist.hours = hist.hours.map(perYear);
  hist.energy = hist.energy.map(perYear);
  const socDay = (arr) => Array.from({ length: 12 }, (_, mo) =>
    Array.from({ length: 24 }, (_, h) => (soc.count[mo * 24 + h] ? arr[mo * 24 + h] / soc.count[mo * 24 + h] : null)));

  const scenario = (b) => ({
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
    capacityFactor: ratedW > 0 ? wind / ((ratedW * p.nTurbines / 1000) * n) : 0,
    generatingShare: genHours / n,
    physicsCapKwh: perYear(physicsCap),
    clippedKwh: perYear(clipped),
    pvKwh: perYear(pv),
    loadKwh: perYear(loadTot),
    pvOnly: A,
    withWind: B,
    monthly: m,
    yearly: [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, kwh]) => ({ year, kwh })),
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
