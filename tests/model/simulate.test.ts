import { test } from "node:test";
import assert from "node:assert/strict";
import { circleArea, betzLimitW } from "../../src/model/physics.ts";
import { exampleCurve } from "../../src/model/powerCurve.ts";
import { simulate, type ModelParams, type SimWeather } from "../../src/model/simulate.ts";
import { fraction, kmh, kw, kwh, metres, percent } from "../../src/model/units.ts";
import type { Weather } from "../../src/data/weather.ts";
import { at } from "../../src/util/checked.ts";
import { close } from "../helpers.ts";

/** One year of identical hours, so results are easy to check by hand. */
function syntheticYear({ w10 = 50, w100 = 50, temp = 15, gti = 0 } = {}): SimWeather & Pick<Weather, "missing"> {
  const n = 8760;
  const wx = {
    n,
    years: 1,
    elevation: 0,
    missing: 0,
    year: new Uint16Array(n).fill(2020),
    month: new Uint8Array(n),
    hour: new Uint8Array(n),
    w10: new Float32Array(n).fill(w10),
    w100: new Float32Array(n).fill(w100),
    temp: new Float32Array(n).fill(temp),
    gti: new Float32Array(n).fill(gti),
  };
  for (let i = 0; i < n; i++) {
    wx.hour[i] = i % 24;
    wx.month[i] = Math.min(11, Math.floor(i / 730));
  }
  return wx;
}

const base: ModelParams = {
  hubHeight: metres(10),
  siteMeanKmh: kmh(0),
  windScale: 1,
  curvePts: exampleCurve(),
  nTurbines: 1,
  densityCorrection: false,
  clampPhysics: false,
  captureAreaM2: circleArea(metres(0.3048)),
  augmentation: 1,
  windLossPct: percent(0),
  pvKwp: kw(0),
  pvLossPct: percent(0),
  tempCoeffPct: 0,
  loadKwh: kwh(0),
  loadProfile: "flat",
  loadHourly: Array.from({ length: 24 }, () => 1),
  loadMonthly: Array.from({ length: 12 }, () => 1),
  battKwh: kwh(0),
  battMinSoc: fraction(0),
  battRte: fraction(1),
  battKw: kw(0),
  inverterKw: kw(0),
  price: 0.2,
  exportCredit: 0,
  turbineCost: 25_000,
  omPerTurbine: 0,
};

test("constant rated wind gives rated output every hour", () => {
  const r = simulate(syntheticYear(), base);
  close(r.windKwh, 3.5 * 8760, 1e-6);
  close(r.capacityFactor, 1, 1e-9);
});

test("capping at the physical limit cuts output to Betz", () => {
  const r = simulate(syntheticYear(), { ...base, clampPhysics: true });
  close(r.windKwh, (betzLimitW(kmh(50), circleArea(metres(0.3048))) * 8760) / 1000, 0.01);
});

test("calibration scales hub wind to the measured mean", () => {
  const r = simulate(syntheticYear({ w10: 10, w100: 10 }), { ...base, siteMeanKmh: kmh(15) });
  close(r.scale, 1.5, 1e-6);
  close(r.meanHub, 15, 1e-4);
});

test("shear: hub wind interpolates between 10 m and 100 m", () => {
  const r = simulate(syntheticYear({ w10: 10, w100: 20 }), { ...base, hubHeight: metres(Math.sqrt(1000)) });
  close(r.meanHub, Math.sqrt(200), 1e-3); // halfway on a log-height scale
});

test("energy balance without a battery: import − export = load − generation", () => {
  const wx = syntheticYear({ w10: 20, w100: 25, gti: 300 });
  const r = simulate(wx, {
    ...base,
    pvKwp: kw(2),
    loadKwh: kwh(20_000),
    loadProfile: "x",
    loadHourly: Array.from({ length: 24 }, (_, h) => 1 + (h % 5)),
  });
  close(r.loadKwh, 20_000, 1e-3);
  const b = r.withWind;
  close(b.importKwh - b.exportKwh, r.loadKwh - r.pvKwh - r.windKwh, 1e-3);
  close(r.pvOnly.importKwh - r.pvOnly.exportKwh, r.loadKwh - r.pvKwh, 1e-3);
});

test("a lossless battery shifts surplus to deficit hours", () => {
  const wx = syntheticYear({ w10: 0, w100: 0, gti: 0 });
  for (let i = 0; i < wx.n; i++) wx.gti[i] = at(wx.hour, i) < 12 ? 1000 : 0; // 12 h of sun
  const p = { ...base, pvKwp: kw(2), loadKwh: kwh(8760), battKwh: kwh(100), battKw: kw(10) };
  const r = simulate(wx, p);
  close(r.pvKwh, 8760, 1e-3); // 2 kW × 12 h × 365
  assert.ok(r.pvOnly.importKwh < 1, `import ${r.pvOnly.importKwh}`); // sun covers the night through the battery
});

test("a shared inverter limit caps wind and solar together and counts what's lost", () => {
  // Rated wind (3.5 kW) every hour, no sun: a 2 kW inverter loses 1.5 kW every hour.
  const r = simulate(syntheticYear(), { ...base, inverterKw: kw(2) });
  close(r.windKwh, 3.5 * 8760, 1e-6); // generation itself is unchanged
  close(r.inverterLostKwh.withWind, 1.5 * 8760, 1e-6);
  close(r.inverterLostKwh.pvOnly, 0, 1e-9);
  close(r.withWind.exportKwh, 2 * 8760, 1e-6); // no load or battery: everything delivered is exported
  const open = simulate(syntheticYear(), base); // no limit
  close(open.inverterLostKwh.withWind, 0, 1e-9);
});
