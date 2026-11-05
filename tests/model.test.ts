import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLE_ROTOR_M,
  circleArea,
  exampleCurve,
  parseCurve,
  makeCurveFn,
  betzLimitW,
  checkCurve,
  airDensity,
  simulate,
} from "../src/model.ts";

const close = (a, b, tol, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);

/** One year of identical hours, so results are easy to check by hand. */
function syntheticYear({ w10 = 50, w100 = 50, temp = 15, gti = 0 } = {}) {
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

const base = {
  hubHeight: 10,
  siteMeanKmh: 0,
  windScale: 1,
  curvePts: exampleCurve(),
  nTurbines: 1,
  densityCorrection: false,
  clampPhysics: false,
  captureAreaM2: circleArea(0.3048),
  augmentation: 1,
  windLossPct: 0,
  pvKwp: 0,
  pvLossPct: 0,
  tempCoeffPct: 0,
  loadKwh: 0,
  loadProfile: "flat",
  loadHourly: Array(24).fill(1),
  loadMonthly: Array(12).fill(1),
  battKwh: 0,
  battMinSoc: 0,
  battRte: 1,
  battKw: 0,
  price: 0.2,
  exportCredit: 0,
  turbineCost: 25000,
  omPerTurbine: 0,
};

test("example curve is plausible: starts at 6 km/h, rated 3.5 kW from 30 km/h, within the Betz limit", () => {
  const f = makeCurveFn(exampleCurve());
  assert.equal(f(5), 0);
  assert.ok(f(6) > 0 && f(10) < f(15) && f(15) < f(20));
  assert.equal(f(30), 3500);
  assert.equal(f(90), 3500);
  assert.equal(f(101), 0);
  assert.ok(checkCurve(exampleCurve(), circleArea(EXAMPLE_ROTOR_M), 1).worstRatio < 0.65);
});

test("parseCurve accepts common separators and rejects junk", () => {
  assert.deepEqual(parseCurve("10, 100\n0 0 # cut-in\n20;\t400"), [
    [0, 0],
    [10, 100],
    [20, 400],
  ]);
  assert.throws(() => parseCurve("10, abc\n20, 1"));
  assert.throws(() => parseCurve("10, 100"));
});

test("Betz limit flags a curve that claims too much for its capture area", () => {
  close(betzLimitW(30, circleArea(0.3048)), 15.4, 0.1); // a 12-inch circle at 30 km/h
  close(betzLimitW(30, 1), 210, 1); // per square metre of frontal area
  const { worstRatio, atKmh } = checkCurve(
    [
      [0, 0],
      [30, 3500],
    ],
    circleArea(0.3048),
    1,
  );
  assert.equal(atKmh, 30);
  close(worstRatio, 228, 1);
});

test("air density falls with altitude and rises with cold", () => {
  close(airDensity(0, 15), 1.225, 0.001);
  assert.ok(airDensity(1000, 15) < 1.13);
  assert.ok(airDensity(0, -30) > 1.4);
});

test("constant rated wind gives rated output every hour", () => {
  const r = simulate(syntheticYear(), base);
  close(r.windKwh, 3.5 * 8760, 1e-6);
  close(r.capacityFactor, 1, 1e-9);
});

test("capping at the physical limit cuts output to Betz", () => {
  const r = simulate(syntheticYear(), { ...base, clampPhysics: true });
  close(r.windKwh, (betzLimitW(50, circleArea(0.3048)) * 8760) / 1000, 0.01);
});

test("calibration scales hub wind to the measured mean", () => {
  const r = simulate(syntheticYear({ w10: 10, w100: 10 }), { ...base, siteMeanKmh: 15 });
  close(r.scale, 1.5, 1e-6);
  close(r.meanHub, 15, 1e-4);
});

test("shear: hub wind interpolates between 10 m and 100 m", () => {
  const r = simulate(syntheticYear({ w10: 10, w100: 20 }), { ...base, hubHeight: Math.sqrt(1000) });
  close(r.meanHub, Math.sqrt(200), 1e-3); // halfway on a log-height scale
});

test("energy balance without a battery: import − export = load − generation", () => {
  const wx = syntheticYear({ w10: 20, w100: 25, gti: 300 });
  const r = simulate(wx, {
    ...base,
    pvKwp: 2,
    loadKwh: 20000,
    loadProfile: "x",
    loadHourly: Array.from({ length: 24 }, (_, h) => 1 + (h % 5)),
  });
  close(r.loadKwh, 20000, 1e-3);
  const b = r.withWind;
  close(b.importKwh - b.exportKwh, r.loadKwh - r.pvKwh - r.windKwh, 1e-3);
  close(r.pvOnly.importKwh - r.pvOnly.exportKwh, r.loadKwh - r.pvKwh, 1e-3);
});

test("a lossless battery shifts surplus to deficit hours", () => {
  const wx = syntheticYear({ w10: 0, w100: 0, gti: 0 });
  for (let i = 0; i < wx.n; i++) wx.gti[i] = wx.hour[i] < 12 ? 1000 : 0; // 12 h of sun
  const p = { ...base, pvKwp: 2, loadKwh: 8760, battKwh: 100, battKw: 10 };
  const r = simulate(wx, p);
  close(r.pvKwh, 8760, 1e-3); // 2 kW × 12 h × 365
  assert.ok(r.pvOnly.importKwh < 1, `import ${r.pvOnly.importKwh}`); // sun covers the night through the battery
});

test("a shared inverter limit caps wind and solar together and counts what's lost", () => {
  // Rated wind (3.5 kW) every hour, no sun: a 2 kW inverter loses 1.5 kW every hour.
  const r = simulate(syntheticYear(), { ...base, inverterKw: 2 });
  close(r.windKwh, 3.5 * 8760, 1e-6); // generation itself is unchanged
  close(r.inverterLostKwh.withWind, 1.5 * 8760, 1e-6);
  close(r.inverterLostKwh.pvOnly, 0, 1e-9);
  close(r.withWind.exportKwh, 2 * 8760, 1e-6); // no load or battery: everything delivered is exported
  const open = simulate(syntheticYear(), base); // no limit
  close(open.inverterLostKwh.withWind, 0, 1e-9);
});
