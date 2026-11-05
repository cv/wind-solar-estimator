import { test } from "node:test";
import assert from "node:assert/strict";
import { alignStation, fitQuantileMap, applyQuantileMap, blendStation, shearAlpha, checkHomogeneity, MIN_PAIRS } from "../js/blend.js";
import { parseStationCsv, stationLabel, distanceKm, direction, pickStation } from "../js/stations.js";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);

/** A year of model weather with a repeating daily wind pattern; t counts UTC hours from 2020. */
function modelYear() {
  const n = 8760, t0 = Date.UTC(2020, 0, 1) / 3.6e6;
  const wx = { n, years: 1, t: new Int32Array(n), year: new Uint16Array(n).fill(2020), month: new Uint8Array(n), hour: new Uint8Array(n), w10: new Float32Array(n), w100: new Float32Array(n) };
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

/** Annual means for 2006–2025: the model wobbles from year to year, the station follows it times ratio(year). */
function yearlyRecord(ratio, noise = 0.03) {
  const out = [];
  for (let y = 2006; y <= 2025; y++) {
    const model = 9 + Math.sin(y * 1.7); // windy and calm years
    const wobble = 1 + noise * Math.sin(y * 2.3 + 1); // year-to-year scatter in the ratio
    out.push({ year: y, coverage: 0.99, model, station: model * ratio(y) * wobble });
  }
  return out;
}

test("checkHomogeneity leaves a steady record alone, even when it differs from the model", () => {
  const h = checkHomogeneity(yearlyRecord(() => 1.35));
  assert.equal(h.issue, null);
  assert.equal(h.years, 20);
});

test("checkHomogeneity finds a step (an instrument moved or replaced)", () => {
  const h = checkHomogeneity(yearlyRecord((y) => (y < 2008 ? 0.85 : 1.4)));
  assert.equal(h.issue, "step");
  assert.equal(h.step.year, 2008);
  close(h.step.change, 0.65, 0.05);
});

test("checkHomogeneity finds a steady drift (trees growing around the mast)", () => {
  const h = checkHomogeneity(yearlyRecord((y) => 1.4 - 0.02 * (y - 2006)));
  assert.equal(h.issue, "trend");
  close(h.trend.change, -0.27, 0.05);
});

test("checkHomogeneity ignores small changes, short records and thin years", () => {
  assert.equal(checkHomogeneity(yearlyRecord((y) => (y < 2016 ? 1.1 : 1.0), 0.01)).issue, null); // 9% step
  assert.equal(checkHomogeneity(yearlyRecord((y) => (y < 2008 ? 0.85 : 1.4)).slice(0, 4)).issue, null);
  const thin = yearlyRecord((y) => (y < 2008 ? 0.85 : 1.4)).map((r) => (r.year < 2008 ? { ...r, coverage: 0.2 } : r));
  assert.equal(checkHomogeneity(thin).issue, null);
});

test("blendStation reports yearly means and the homogeneity check", () => {
  const wx = modelYear();
  const { stats } = blendStation(wx, stationFrom(wx, (v) => v * 1.2));
  assert.equal(stats.yearly.length, 1);
  assert.equal(stats.yearly[0].year, 2020);
  close(stats.yearly[0].station / stats.yearly[0].model, 1.2, 0.02);
  assert.equal(stats.homogeneity.issue, null); // one year can't show a break
});

test("auto station choice weighs elevation difference against distance", () => {
  const ok = () => true;
  const hilltop = { id: "hill", distanceKm: 17.9, rise: 330 };
  const plain = { id: "plain", distanceKm: 18.1, rise: -25 };
  const far = { id: "far", distanceKm: 45, rise: 0 };
  assert.equal(pickStation([hilltop, plain, far], ok).id, "plain");
  assert.equal(pickStation([hilltop, far], ok).id, "far"); // 17.9 + 33 > 45
  assert.equal(pickStation([{ id: "x", distanceKm: 5, rise: NaN }, plain], ok).id, "x"); // unknown elevation: distance only
  assert.equal(pickStation([hilltop, plain], (s) => s.id !== "plain").id, "hill");
  assert.equal(stationLabel("STAVELY AAFC"), "Stavely AAFC");
});

test("auto station choice prefers the record that covers the period", () => {
  // Three stations in one town; the period is 2006–2025.
  const old = { id: "aut", distanceKm: 5, rise: 53, first: 1994, last: 2012 };
  const climate = { id: "climate", distanceKm: 5.6, rise: 53, first: 2010, last: 2026 };
  const town = { id: "town", distanceKm: 5, rise: 53, first: 2011, last: 2026 };
  const missing = (s) => 20 - (Math.min(s.last, 2025) - Math.max(s.first, 2006) + 1);
  assert.equal(pickStation([old, climate, town], () => true, missing).id, "climate");
  assert.equal(pickStation([old, climate, town], () => true).id, "aut"); // distance and height alone
});
