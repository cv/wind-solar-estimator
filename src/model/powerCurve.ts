// Turbine power curves: the built-in example, parsing, interpolation and a physics check.

import { STD_RHO, circleArea, betzLimitW } from "./physics.ts";
import { kmh, metres, watts } from "./units.ts";
import type { Kmh, Metres, SquareMetres, Watts } from "./units.ts";
import { at } from "../util/checked.ts";

/** One point of a power curve: wind speed and output. */
export type CurvePoint = readonly [kmh: Kmh, watts: Watts];

/** checkCurve's result for a curve within the physical limit at every speed (worstRatio <= 1). */
export interface CurveWithinLimit {
  exceeds: false;
  /** The highest ratio of the curve to the limit (0 when no point has power). */
  worstRatio: number;
}

/** checkCurve's result for a curve that claims more than the physical limit (worstRatio > 1). */
export interface CurveExceedsLimit {
  exceeds: true;
  worstRatio: number;
  /** Speed of the worst point. */
  atKmh: Kmh;
}

/** checkCurve's result: the highest ratio of the curve to the physical limit, and where it exceeds it. */
export type CurveCheck = CurveWithinLimit | CurveExceedsLimit;

export const EXAMPLE_ROTOR_M: Metres = metres(6);

/**
 * Illustrative power curve for a generic 3.5 kW turbine with a 6 m rotor: output from
 * 6 km/h, power coefficient rising from 0.12 to 0.36 by 16 km/h, rated 3.5 kW from about
 * 30 km/h and held there up to 100 km/h. It stays within the physical (Betz) limit at
 * every speed. Replace it with the real turbine's independently measured curve.
 */
export function exampleCurve(): CurvePoint[] {
  const area = circleArea(EXAMPLE_ROTOR_M);
  const pts: CurvePoint[] = [
    [kmh(0), watts(0)],
    [kmh(5.9), watts(0)],
  ];
  for (let v = 6; v <= 30; v += 2) {
    const cp = Math.min(0.36, 0.12 + (v - 6) * 0.024);
    const w = 0.5 * STD_RHO * area * (v / 3.6) ** 3 * cp;
    pts.push([kmh(v), watts(Math.min(3500, Math.round(w / 10) * 10))]);
  }
  pts.push([kmh(100), watts(3500)]);
  return pts;
}

/** Parses "km/h, W" lines (commas, spaces, tabs or semicolons; # starts a comment). */
export function parseCurve(text: string): CurvePoint[] {
  const pts: CurvePoint[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const s = line.replace(/#.*/u, "").trim();
    if (!s) continue;
    const [v, w] = s.split(/[\s,;]+/u).map(Number);
    if (v === undefined || w === undefined || !Number.isFinite(v) || !Number.isFinite(w) || v < 0 || w < 0) {
      throw new Error(`Power curve: can't read "${line.trim()}" (expected "km/h, W")`);
    }
    pts.push([kmh(v), watts(w)]);
  }
  if (pts.length < 2) throw new Error("Power curve needs at least two points");
  return pts.toSorted((a, b) => a[0] - b[0]);
}

export const formatCurve = (pts: readonly CurvePoint[]): string => pts.map(([v, w]) => `${v}, ${w}`).join("\n");

/** Linear interpolation of the curve; 0 above its last point (cut-out). */
export function makeCurveFn(pts: readonly CurvePoint[]): (v: Kmh) => Watts {
  const first = at(pts, 0);
  const maxV = at(pts, pts.length - 1)[0];
  const none = watts(0);
  return (v: Kmh): Watts => {
    if (!(v >= 0) || v > maxV) return none;
    if (v <= first[0]) return first[1];
    // v > first[0] here, so the first point never matches and only seeds prev.
    let prev = first;
    for (const cur of pts) {
      const x1 = cur[0];
      if (v <= x1) {
        const y1 = cur[1],
          x0 = prev[0],
          y0 = prev[1];
        return x1 === x0 ? y1 : watts(y0 + ((y1 - y0) * (v - x0)) / (x1 - x0));
      }
      prev = cur;
    }
    return none;
  };
}

/** How far the curve exceeds the physical limit for a capture area (ratio > 1 is impossible). */
export function checkCurve(pts: readonly CurvePoint[], area: SquareMetres, augmentation: number): CurveCheck {
  let worst = 0;
  let atKmh = kmh(0);
  for (const [v, w] of pts) {
    if (v <= 0 || w <= 0) continue;
    const ratio = w / (betzLimitW(v, area) * augmentation);
    if (ratio > worst) [worst, atKmh] = [ratio, v];
  }
  // A ratio above 1 comes from a point with power, so atKmh is that point's speed.
  return worst > 1 ? { exceeds: true, worstRatio: worst, atKmh } : { exceeds: false, worstRatio: worst };
}
