import { test } from "node:test";
import assert from "node:assert/strict";
import { circleArea } from "../../src/model/physics.ts";
import { exampleCurve } from "../../src/model/powerCurve.ts";
import { WIND_FACTORS, windCase, withWindFactor } from "../../src/model/sensitivity.ts";
import type { ModelParams, SimWeather } from "../../src/model/simulate.ts";
import { fraction, kmh, kw, kwh, metres, percent } from "../../src/model/units.ts";
import { close } from "../helpers.ts";

/** One year of steady 15 km/h wind (below rated, so stronger wind means more energy). */
function steadyYear(): SimWeather {
  const n = 8760;
  return {
    n,
    years: 1,
    elevation: 0,
    year: new Uint16Array(n).fill(2020),
    month: Uint8Array.from({ length: n }, (_, i) => Math.min(11, Math.floor(i / 730))),
    hour: Uint8Array.from({ length: n }, (_, i) => i % 24),
    w10: new Float32Array(n).fill(15),
    w100: new Float32Array(n).fill(15),
    temp: new Float32Array(n).fill(15),
    gti: new Float32Array(n),
  };
}

const p: ModelParams = {
  hubHeight: metres(10),
  siteMeanKmh: kmh(0),
  windScale: 1,
  curvePts: exampleCurve(),
  nTurbines: 1,
  densityCorrection: false,
  clampPhysics: false,
  captureAreaM2: circleArea(metres(6)),
  augmentation: 1,
  windLossPct: percent(0),
  pvKwp: kw(0),
  pvLossPct: percent(0),
  tempCoeffPct: 0,
  loadKwh: kwh(20_000),
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
  turbineCost: 20_000,
  omPerTurbine: 0,
};

test("withWindFactor scales the calibration in use", () => {
  close(withWindFactor({ ...p, windScale: 1.5 }, 0.8).windScale, 1.2, 1e-12);
  const calibrated = withWindFactor({ ...p, siteMeanKmh: kmh(20) }, 1.1);
  close(calibrated.siteMeanKmh, 22, 1e-12);
  assert.equal(calibrated.windScale, 1);
});

test("stronger wind means more energy and a shorter payback", () => {
  const wx = steadyYear();
  const cases = WIND_FACTORS.map((f) => windCase(wx, p, f));
  for (let i = 1; i < cases.length; i++) {
    const [prev, cur] = [cases[i - 1], cases[i]];
    assert.ok(prev && cur && cur.windKwh > prev.windKwh && cur.payback < prev.payback);
  }
});
