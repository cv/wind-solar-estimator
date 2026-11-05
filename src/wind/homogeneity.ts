// Checks a station record for breaks (moves, new instruments, sheltering) against the weather model.

import { at } from "../util/checked.ts";

/** Station and model annual means over the hours both have, and the share of hours the station has. */
export interface YearlyMeans {
  year: number;
  coverage: number;
  station: number;
  model: number;
}

/** Straight-line trend in the station/model ratio. */
export interface Trend {
  from: number;
  to: number;
  /** Fitted ratio at the first and last year. */
  start: number;
  end: number;
  /** end / start − 1. */
  change: number;
  /** t statistic of the slope. */
  t: number;
}

/** Best single step in the station/model ratio, from the given year on. */
export interface Step {
  year: number;
  from: number;
  to: number;
  /** Mean ratio before and after the step. */
  before: number;
  after: number;
  /** after / before − 1. */
  change: number;
  t: number;
}

export interface Homogeneity {
  /** Years with enough coverage to use. */
  years: number;
  ratios: Array<{ year: number; ratio: number }>;
  trend: Trend | null;
  step: Step | null;
  issue: "step" | "trend" | null;
}

export interface HomogeneityOptions {
  minYears?: number;
  minChange?: number;
  minT?: number;
  minSide?: number;
}

const avg = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0) / a.length;

/**
 * Looks for a break in a station record by comparing it with the weather model year by
 * year: the ratio of their annual means cancels windy and calm years, so what's left is
 * a change at the instrument (moved, raised, replaced, or sheltered by trees and
 * buildings). yearly is [{ year, coverage, station, model }] (means over shared hours).
 *
 * Tests a straight-line trend in the ratio and the best single step (at least minSide
 * years on each side). Either counts as an issue when it changes the ratio by at least
 * minChange and is clear of year-to-year noise (t >= minT); the clearer one wins.
 * Checked on real records: Claresholm (+63% step in 2008) and Salmon Arm (-31% trend)
 * are flagged; Calgary, Lethbridge, Revelstoke and Vernon (a 9% step) are not.
 */
export function checkHomogeneity(
  yearly: readonly YearlyMeans[],
  { minYears = 5, minChange = 0.15, minT = 3, minSide = 2 }: HomogeneityOptions = {},
): Homogeneity {
  const ys = yearly
    .filter((y) => y.coverage >= 0.5 && y.model > 0)
    .map((y) => ({ year: y.year, ratio: y.station / y.model }));
  const n = ys.length;
  const out: Homogeneity = { years: n, ratios: ys, trend: null, step: null, issue: null };
  if (n < minYears) return out;
  const r = ys.map((y) => y.ratio),
    x = ys.map((y) => y.year);
  const mr = avg(r),
    mx = avg(x);

  let sxx = 0,
    sxy = 0;
  for (const { year, ratio } of ys) {
    sxx += (year - mx) ** 2;
    sxy += (year - mx) * (ratio - mr);
  }
  const slope = sxy / sxx;
  let ssr = 0;
  for (const { year, ratio } of ys) ssr += (ratio - (mr + slope * (year - mx))) ** 2;
  const se = Math.sqrt(ssr / (n - 2) / sxx);
  const first = at(x, 0),
    last = at(x, n - 1);
  const start = mr + slope * (first - mx),
    end = mr + slope * (last - mx);
  out.trend = {
    from: first,
    to: last,
    start,
    end,
    change: end / start - 1,
    t: se > 0 ? Math.abs(slope) / se : Infinity,
  };

  for (let k = minSide; k <= n - minSide; k++) {
    const b = r.slice(0, k),
      a = r.slice(k);
    const mb = avg(b),
      ma = avg(a);
    const ss = b.reduce((s, v) => s + (v - mb) ** 2, 0) + a.reduce((s, v) => s + (v - ma) ** 2, 0);
    const s = Math.sqrt(ss / (n - 2));
    const t = s > 0 ? Math.abs(ma - mb) / (s * Math.sqrt(1 / k + 1 / (n - k))) : Infinity;
    if (!out.step || t > out.step.t)
      out.step = { year: at(x, k), from: first, to: last, before: mb, after: ma, change: ma / mb - 1, t };
  }

  const clear = <F extends Trend | Step>(f: F | null): f is F =>
    f !== null && Math.abs(f.change) >= minChange && f.t >= minT;
  if (clear(out.step) && (!clear(out.trend) || out.step.t >= out.trend.t)) out.issue = "step";
  else if (clear(out.trend)) out.issue = "trend";
  return out;
}
