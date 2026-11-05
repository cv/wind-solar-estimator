// Turbine power curves: the built-in example, parsing, interpolation and a physics check.

import { STD_RHO, circleArea, betzLimitW } from "./physics.ts";
import { at } from "../util/checked.ts";

/** One point of a power curve: wind speed (km/h) and output (W). */
export type CurvePoint = readonly [kmh: number, watts: number];

/** checkCurve's result: the highest ratio of the curve to the physical limit, and the speed where it occurs. */
export interface CurveCheck {
  worstRatio: number;
  /** Speed (km/h) of the worst point, or null when no point has power. */
  atKmh: number | null;
}

export const EXAMPLE_ROTOR_M = 6;

/**
 * Illustrative power curve for a generic 3.5 kW turbine with a 6 m rotor: output from
 * 6 km/h, power coefficient rising from 0.12 to 0.36 by 16 km/h, rated 3.5 kW from about
 * 30 km/h and held there up to 100 km/h. It stays within the physical (Betz) limit at
 * every speed. Replace it with the real turbine's independently measured curve.
 */
export function exampleCurve(): CurvePoint[] {
  const area = circleArea(EXAMPLE_ROTOR_M);
  const pts: CurvePoint[] = [
    [0, 0],
    [5.9, 0],
  ];
  for (let v = 6; v <= 30; v += 2) {
    const cp = Math.min(0.36, 0.12 + (v - 6) * 0.024);
    const w = 0.5 * STD_RHO * area * (v / 3.6) ** 3 * cp;
    pts.push([v, Math.min(3500, Math.round(w / 10) * 10)]);
  }
  pts.push([100, 3500]);
  return pts;
}

/** Parses "km/h, W" lines (commas, spaces, tabs or semicolons; # starts a comment). */
export function parseCurve(text: string): CurvePoint[] {
  const pts: CurvePoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.replace(/#.*/, "").trim();
    if (!s) continue;
    const [v, w] = s.split(/[\s,;]+/).map(Number);
    if (v === undefined || w === undefined || !Number.isFinite(v) || !Number.isFinite(w) || v < 0 || w < 0) {
      throw new Error(`Power curve: can't read "${line.trim()}" (expected "km/h, W")`);
    }
    pts.push([v, w]);
  }
  if (pts.length < 2) throw new Error("Power curve needs at least two points");
  return pts.toSorted((a, b) => a[0] - b[0]);
}

export const formatCurve = (pts: readonly CurvePoint[]): string => pts.map(([v, w]) => `${v}, ${w}`).join("\n");

/** Linear interpolation of the curve; 0 above its last point (cut-out). */
export function makeCurveFn(pts: readonly CurvePoint[]): (v: number) => number {
  const first = at(pts, 0);
  const maxV = at(pts, pts.length - 1)[0];
  return (v: number): number => {
    if (!(v >= 0) || v > maxV) return 0;
    if (v <= first[0]) return first[1];
    // v > first[0] here, so the first point never matches and only seeds prev.
    let prev = first;
    for (const cur of pts) {
      const x1 = cur[0];
      if (v <= x1) {
        const y1 = cur[1],
          x0 = prev[0],
          y0 = prev[1];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (v - x0)) / (x1 - x0);
      }
      prev = cur;
    }
    return 0;
  };
}

/** How far the curve exceeds the physical limit for a capture area (ratio > 1 is impossible). */
export function checkCurve(pts: readonly CurvePoint[], areaM2: number, augmentation: number): CurveCheck {
  let worst = 0;
  let atKmh: number | null = null;
  for (const [v, w] of pts) {
    if (v <= 0 || w <= 0) continue;
    const ratio = w / (betzLimitW(v, areaM2) * augmentation);
    if (ratio > worst) [worst, atKmh] = [ratio, v];
  }
  return { worstRatio: worst, atKmh };
}
