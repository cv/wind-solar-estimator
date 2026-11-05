// Times simulate() and blendStation() on 20 synthetic years: run before and after changes
// to hot loops (node scripts/bench.ts).
import { simulate } from "../src/model/simulate.ts";
import type { ModelParams } from "../src/model/simulate.ts";
import { exampleCurve } from "../src/model/powerCurve.ts";
import { circleArea } from "../src/model/physics.ts";
import { blendStation } from "../src/wind/blend.ts";

const n = 20 * 8766;
const t0 = Date.UTC(2006, 0, 1) / 3.6e6;
const wx = {
  n,
  years: 20,
  elevation: 900,
  missing: 0,
  t: Int32Array.from({ length: n }, (_, i) => t0 + i),
  year: Uint16Array.from({ length: n }, (_, i) => 2006 + Math.floor(i / 8766)),
  month: Uint8Array.from({ length: n }, (_, i) => Math.floor((i % 8766) / 730.5) % 12),
  hour: Uint8Array.from({ length: n }, (_, i) => i % 24),
  w10: Float32Array.from({ length: n }, (_, i) => 8 + 7 * Math.sin(i / 37) + 4 * Math.sin(i / 5)),
  w100: Float32Array.from({ length: n }, (_, i) => 13 + 9 * Math.sin(i / 37) + 5 * Math.sin(i / 5)),
  temp: Float32Array.from({ length: n }, (_, i) => 5 + 15 * Math.sin(i / 1400)),
  gti: Float32Array.from({ length: n }, (_, i) => Math.max(0, 800 * Math.sin((((i % 24) - 6) / 12) * Math.PI))),
};
const p: ModelParams = {
  hubHeight: 16,
  siteMeanKmh: 0,
  windScale: 1,
  curvePts: exampleCurve(),
  nTurbines: 1,
  densityCorrection: true,
  clampPhysics: false,
  captureAreaM2: circleArea(6),
  augmentation: 1,
  windLossPct: 5,
  pvKwp: 3,
  pvLossPct: 14,
  tempCoeffPct: -0.4,
  loadKwh: 11800,
  loadProfile: "residential",
  loadHourly: Array(24).fill(1),
  loadMonthly: Array(12).fill(1),
  battKwh: 48,
  battMinSoc: 0.5,
  battRte: 0.82,
  battKw: 6,
  inverterKw: 6,
  price: 0.2,
  exportCredit: 0.08,
  turbineCost: 20000,
  omPerTurbine: 200,
};
const obs = {
  hours: Int32Array.from({ length: n }, (_, i) => t0 + i).filter((_, i) => i % 50 !== 0),
  wind: Uint8Array.from({ length: n - Math.ceil(n / 50) }, (_, i) => Math.round(9 + 6 * Math.sin(i / 37))),
};
const time = (label: string, f: () => unknown, reps = 7) => {
  f();
  const ts: number[] = [];
  for (let k = 0; k < reps; k++) {
    const s = performance.now();
    f();
    ts.push(performance.now() - s);
  }
  ts.sort((a, b) => a - b);
  console.log(`${label}: median ${ts[Math.floor(reps / 2)]?.toFixed(1)} ms`);
};
time("simulate (20 years)", () => simulate(wx, p));
time("blendStation (20 years)", () => blendStation(wx, obs));
