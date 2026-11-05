import { test } from "node:test";
import assert from "node:assert/strict";
import { alignStation, fitQuantileMap, applyQuantileMap, blendStation, shearAlpha, MIN_PAIRS } from "../js/blend.js";
import { parseStationCsv, stationLabel, distanceKm, direction } from "../js/stations.js";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);

/** A year of model weather with a repeating daily wind pattern; t counts UTC hours from 2020. */
function modelYear() {
  const n = 8760, t0 = Date.UTC(2020, 0, 1) / 3.6e6;
  const wx = { n, years: 1, t: new Int32Array(n), month: new Uint8Array(n), hour: new Uint8Array(n), w10: new Float32Array(n), w100: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    wx.t[i] = t0 + i;
    wx.month[i] = Math.min(11, Math.floor(i / 730));
    wx.hour[i] = i % 24;
    wx.w10[i] = 2 + ((i * 7) % 23); // 2..24 km/h, well mixed
    wx.w100[i] = wx.w10[i] * 1.6;
  }
  return wx;
}

/** Station readings derived from the model hours by f, skipping hours where skip(i) is true. */
function stationFrom(wx, f, skip = () => false) {
  const hours = [], wind = [];
  for (let i = 0; i < wx.n; i++) if (!skip(i)) { hours.push(wx.t[i]); wind.push(Math.round(f(wx.w10[i]))); }
  return { hours: Int32Array.from(hours), wind: Uint8Array.from(wind) };
}

test("alignStation places readings by UTC hour and leaves gaps as NaN", () => {
  const out = alignStation(Int32Array.from([10, 11, 12, 13]), { hours: Int32Array.from([11, 13, 99]), wind: Uint8Array.from([5, 7, 9]) });
  assert.ok(Number.isNaN(out[0]) && Number.isNaN(out[2]));
  assert.equal(out[1], 5);
  assert.equal(out[3], 7);
});

test("quantile mapping reproduces a monotone transform, and scales beyond the fitted range", () => {
  const x = Array.from({ length: 5000 }, (_, i) => (i % 500) / 20); // 0..25
  const g = (v) => 0.05 * v * v + v; // a gustier, skewed distribution
  const m = fitQuantileMap(x, x.map(g));
  for (const v of [1, 5, 10, 20]) close(applyQuantileMap(m, v), g(v), 0.1 * g(v) + 0.2, `at ${v}`);
  close(applyQuantileMap(m, 50) / applyQuantileMap(m, 25), 2, 0.1, "proportional above the range");
});

test("blendStation keeps readings, fills gaps on the station's scale and keeps the model's shear", () => {
  const wx = modelYear();
  const obs = stationFrom(wx, (v) => 1.5 * v, (i) => i % 5 === 0); // 20% of hours missing
  const { wx: out, stats } = blendStation(wx, obs);
  close(stats.coverage, 0.8, 0.001);
  assert.equal(stats.filled, wx.n / 5);
  for (const i of [1, 2, 3]) assert.equal(out.w10[i], Math.round(1.5 * wx.w10[i]), "measured hours are kept");
  for (const i of [0, 5, 500, 5000]) close(out.w10[i], 1.5 * wx.w10[i], 1.2, `filled hour ${i}`);
  for (const i of [0, 1, 4000]) close(out.w100[i] / out.w10[i], 10 ** shearAlpha(wx.w10[i], wx.w100[i]), 1e-5, "shear");
  close(stats.meanStation / stats.meanModel, 1.5, 0.05);
  close(stats.energyRatio, 1.5 ** 3, 0.2);
  assert.ok(stats.correlation > 0.99);
});

test("blendStation declines a station with too few readings", () => {
  const wx = modelYear();
  assert.equal(blendStation(wx, stationFrom(wx, (v) => v, (i) => i >= MIN_PAIRS - 1)), null);
});

test("station CSV parsing skips hours without a wind reading", () => {
  const csv = "x,y,UTC_DATE,WIND_SPEED\r\n-113.6,50.0,2024-01-01T07:00:00,8\r\n-113.6,50.0,2024-01-01T08:00:00,\r\n-113.6,50.0,2024-01-01T09:00:00,17\r\n";
  const { hours, wind } = parseStationCsv(csv);
  assert.deepEqual([...wind], [8, 17]);
  assert.equal(hours[0], Date.UTC(2024, 0, 1, 7) / 3.6e6);
  assert.equal(hours[1] - hours[0], 2);
});

test("station names, distance and direction read naturally", () => {
  assert.equal(stationLabel("PINCHER CREEK A"), "Pincher Creek A");
  assert.equal(stationLabel("LETHBRIDGE CDA"), "Lethbridge CDA");
  assert.equal(stationLabel("PINCHER CREEK (AUT)"), "Pincher Creek (AUT)");
  close(distanceKm(50.1668, -113.6353, 50.0036, -113.6386), 18.1, 0.3); // Stavely to Claresholm
  assert.equal(direction(50.1668, -113.6353, 50.0036, -113.6386), "S");
});
