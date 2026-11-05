import { test } from "node:test";
import assert from "node:assert/strict";
import { alignStation, blendStation, shearAlpha, MIN_PAIRS, type BlendWeather } from "../../src/wind/blend.ts";
import type { StationHours } from "../../src/data/stations.ts";
import { close } from "../helpers.ts";

/** A year of model weather with a repeating daily wind pattern; t counts UTC hours from 2020. */
function modelYear() {
  const n = 8760,
    t0 = Date.UTC(2020, 0, 1) / 3.6e6;
  const wx = {
    n,
    years: 1,
    t: new Int32Array(n),
    year: new Uint16Array(n).fill(2020),
    month: new Uint8Array(n),
    hour: new Uint8Array(n),
    w10: new Float32Array(n),
    w100: new Float32Array(n),
  };
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
function stationFrom(
  wx: BlendWeather,
  f: (v: number) => number,
  skip: (i: number) => boolean = () => false,
): StationHours {
  const hours: number[] = [],
    wind: number[] = [];
  for (let i = 0; i < wx.n; i++)
    if (!skip(i)) {
      hours.push(wx.t[i]);
      wind.push(Math.round(f(wx.w10[i])));
    }
  return { hours: Int32Array.from(hours), wind: Uint8Array.from(wind) };
}

test("alignStation places readings by UTC hour and leaves gaps as NaN", () => {
  const out = alignStation(Int32Array.from([10, 11, 12, 13]), {
    hours: Int32Array.from([11, 13, 99]),
    wind: Uint8Array.from([5, 7, 9]),
  });
  assert.ok(Number.isNaN(out[0]) && Number.isNaN(out[2]));
  assert.equal(out[1], 5);
  assert.equal(out[3], 7);
});

test("blendStation keeps readings, fills gaps on the station's scale and keeps the model's shear", () => {
  const wx = modelYear();
  const obs = stationFrom(
    wx,
    (v) => 1.5 * v,
    (i) => i % 5 === 0,
  ); // 20% of hours missing
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
  assert.equal(
    blendStation(
      wx,
      stationFrom(
        wx,
        (v) => v,
        (i) => i >= MIN_PAIRS - 1,
      ),
    ),
    null,
  );
});

test("blendStation reports yearly means and the homogeneity check", () => {
  const wx = modelYear();
  const { stats } = blendStation(
    wx,
    stationFrom(wx, (v) => v * 1.2),
  );
  assert.equal(stats.yearly.length, 1);
  assert.equal(stats.yearly[0].year, 2020);
  close(stats.yearly[0].station / stats.yearly[0].model, 1.2, 0.02);
  assert.equal(stats.homogeneity.issue, null); // one year can't show a break
});
