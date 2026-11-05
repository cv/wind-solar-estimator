// Turbine power curves: the built-in example, parsing, interpolation and a physics check.

import { STD_RHO, circleArea, betzLimitW } from "./physics.ts";

export const EXAMPLE_ROTOR_M = 6;

/**
 * Illustrative power curve for a generic 3.5 kW turbine with a 6 m rotor: output from
 * 6 km/h, power coefficient rising from 0.12 to 0.36 by 16 km/h, rated 3.5 kW from about
 * 30 km/h and held there up to 100 km/h. It stays within the physical (Betz) limit at
 * every speed. Replace it with the real turbine's independently measured curve.
 */
export function exampleCurve() {
  const area = circleArea(EXAMPLE_ROTOR_M);
  const pts = [
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
export function parseCurve(text) {
  const pts = [];
  for (const line of String(text).split(/\r?\n/)) {
    const s = line.replace(/#.*/, "").trim();
    if (!s) continue;
    const [v, w] = s.split(/[\s,;]+/).map(Number);
    if (!Number.isFinite(v) || !Number.isFinite(w) || v < 0 || w < 0) {
      throw new Error(`Power curve: can't read "${line.trim()}" (expected "km/h, W")`);
    }
    pts.push([v, w]);
  }
  if (pts.length < 2) throw new Error("Power curve needs at least two points");
  return pts.sort((a, b) => a[0] - b[0]);
}

export const formatCurve = (pts) => pts.map(([v, w]) => `${v}, ${w}`).join("\n");

/** Linear interpolation of the curve; 0 above its last point (cut-out). */
export function makeCurveFn(pts) {
  const maxV = pts[pts.length - 1][0];
  return (v) => {
    if (!(v >= 0) || v > maxV) return 0;
    if (v <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (v <= pts[i][0]) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        return x1 === x0 ? y1 : y0 + ((y1 - y0) * (v - x0)) / (x1 - x0);
      }
    }
    return 0;
  };
}

/** How far the curve exceeds the physical limit for a capture area (ratio > 1 is impossible). */
export function checkCurve(pts, areaM2, augmentation) {
  let worst = 0;
  let atKmh = null;
  for (const [v, w] of pts) {
    if (v <= 0 || w <= 0) continue;
    const ratio = w / (betzLimitW(v, areaM2) * augmentation);
    if (ratio > worst) [worst, atKmh] = [ratio, v];
  }
  return { worstRatio: worst, atKmh };
}
