// Combines measured station wind with the weather model (ERA5) hour by hour.
// Pure functions (no DOM, no network), so they can be unit-tested in Node.
//
// Station readings are used wherever they exist. Missing hours are filled from the
// weather model at the site, passed through a quantile mapping fitted on the hours both
// have, season by season: the filled hours then follow the station's own spread of wind
// speeds (calms, gusts), not just its average. Hub-height wind keeps the model's
// hour-by-hour 10 m -> 100 m shear, so the simulation itself needs no changes.

import { fitQuantileMap, applyQuantileMap } from "./quantileMap.ts";
import { checkHomogeneity, type Homogeneity, type YearlyMeans } from "./homogeneity.ts";
import type { Weather } from "../data/weather.ts";
import type { StationHours } from "../data/stations.ts";

/** The weather fields blendStation reads. */
export type BlendWeather = Pick<Weather, "n" | "t" | "year" | "month" | "w10" | "w100">;

/** Station against model over the hours both have (speeds km/h at 10 m). */
export interface BlendStats {
  hours: number;
  /** Hours with a station reading. */
  measured: number;
  /** Hours filled from the model. */
  filled: number;
  /** measured / hours. */
  coverage: number;
  meanStation: number;
  meanModel: number;
  /** Mean of station speed³ over mean of model speed³. */
  energyRatio: number;
  correlation: number;
  yearly: YearlyMeans[];
  homogeneity: Homogeneity;
}

/** blendStation's result: the weather with blended w10 and w100, and the comparison stats. */
export interface Blend<W extends BlendWeather = Weather> {
  wx: W;
  stats: BlendStats;
}

const SEASON = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0]; // Dec–Feb, Mar–May, Jun–Aug, Sep–Nov
const MIN_PAIRS_SEASON = 1000; // fewer than this and a season uses the all-year mapping
export const MIN_PAIRS = 500; // fewer than this (about three weeks) and the station isn't used
export const POOR_CORRELATION = 0.5; // below this, station and model follow different local winds

/** Station speeds lined up with the model's hours (NaN where the station has no reading). */
export function alignStation(t: ArrayLike<number>, obs: StationHours): Float32Array {
  const out = new Float32Array(t.length).fill(NaN);
  const index = new Map<number, number>();
  for (let i = 0; i < t.length; i++) index.set(t[i], i);
  for (let k = 0; k < obs.hours.length; k++) {
    const i = index.get(obs.hours[k]);
    if (i !== undefined) out[i] = obs.wind[k];
  }
  return out;
}

/** The model's shear exponent for one hour, as the simulation computes it. */
export const shearAlpha = (w10: number, w100: number): number =>
  w10 > 1 && w100 > 0 ? Math.min(0.6, Math.max(0, Math.log10(w100 / w10))) : 1 / 7;

/**
 * Replaces the model's 10 m wind with station readings, filling gaps as described above.
 * Returns null when the station has too few readings in the period. Otherwise returns
 * { wx, stats }: wx is a copy of the weather with new w10 and w100 series; stats compare
 * station and model over the hours both have.
 */
export function blendStation<W extends BlendWeather = Weather>(wx: W, obs: StationHours): Blend<W> | null {
  const st = alignStation(wx.t, obs);
  const n = wx.n;
  const px: number[][] = [[], [], [], []],
    py: number[][] = [[], [], [], []];
  let pairs = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0,
    cx = 0,
    cy = 0;
  const years = new Map<number, [number, number, number, number]>(); // year -> [hours, shared hours, station sum, model sum]
  for (let i = 0; i < n; i++) {
    let yr = years.get(wx.year[i]);
    if (!yr) {
      yr = [0, 0, 0, 0];
      years.set(wx.year[i], yr);
    }
    yr[0]++;
    const y = st[i];
    if (Number.isNaN(y)) continue;
    yr[1]++;
    yr[2] += y;
    yr[3] += wx.w10[i];
    const x = wx.w10[i];
    const s = SEASON[wx.month[i]];
    px[s].push(x);
    py[s].push(y);
    pairs++;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    cx += x ** 3;
    cy += y ** 3;
  }
  if (pairs < MIN_PAIRS) return null;

  const all = fitQuantileMap(px.flat(), py.flat());
  const maps = px.map((x, s) => (x.length >= MIN_PAIRS_SEASON ? fitQuantileMap(x, py[s]) : all));
  const w10 = new Float32Array(n),
    w100 = new Float32Array(n);
  let filled = 0;
  for (let i = 0; i < n; i++) {
    let v = st[i];
    if (Number.isNaN(v)) {
      v = applyQuantileMap(maps[SEASON[wx.month[i]]], wx.w10[i]);
      filled++;
    }
    w10[i] = v;
    w100[i] = v * 10 ** shearAlpha(wx.w10[i], wx.w100[i]);
  }

  const yearly = [...years]
    .sort((a, b) => a[0] - b[0])
    .map(([year, [h, k, s, m]]): YearlyMeans => ({
      year,
      coverage: k / h,
      station: k ? s / k : NaN,
      model: k ? m / k : NaN,
    }));
  const mx = sx / pairs,
    my = sy / pairs;
  const cov = sxy / pairs - mx * my;
  const vx = sxx / pairs - mx * mx,
    vy = syy / pairs - my * my;
  return {
    wx: { ...wx, w10, w100 },
    stats: {
      hours: n,
      measured: pairs,
      filled,
      coverage: pairs / n,
      meanStation: my,
      meanModel: mx,
      energyRatio: cx > 0 ? cy / cx : NaN, // mean of speed³: what turbines care about
      correlation: vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : NaN,
      yearly,
      homogeneity: checkHomogeneity(yearly),
    },
  };
}
