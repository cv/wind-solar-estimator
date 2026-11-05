// Quantile mapping: turns one distribution of wind speeds into another (pure functions).

import { at } from "../util/checked.ts";

const QUANTILES = 200;

/** A fitted mapping: matching quantiles of the source (qx) and target (qy) distributions. */
export interface QuantileMap {
  qx: Float64Array;
  qy: Float64Array;
}

function quantiles(sorted: Float64Array, q: number): Float64Array {
  const out = new Float64Array(q);
  const last = sorted.length - 1;
  for (let k = 0; k < q; k++) {
    const pos = ((k + 0.5) / q) * last;
    const j = Math.floor(pos);
    const f = pos - j;
    out[k] = j >= last ? at(sorted, last) : at(sorted, j) * (1 - f) + at(sorted, j + 1) * f;
  }
  return out;
}

/** Fits a monotone mapping that turns the distribution of x into that of y (paired samples). */
export function fitQuantileMap(x: ArrayLike<number>, y: ArrayLike<number>, q: number = QUANTILES): QuantileMap {
  const xs = Float64Array.from(x).toSorted();
  const ys = Float64Array.from(y).toSorted();
  return { qx: quantiles(xs, q), qy: quantiles(ys, q) };
}

/** Applies a fitted mapping; beyond the fitted range it scales in proportion. */
export function applyQuantileMap({ qx, qy }: QuantileMap, v: number): number {
  const n = qx.length;
  const x0 = at(qx, 0),
    y0 = at(qy, 0);
  if (v <= x0) return x0 > 0 ? (y0 * v) / x0 : y0;
  const xn = at(qx, n - 1),
    yn = at(qy, n - 1);
  if (v >= xn) return xn > 0 ? (yn * v) / xn : yn;
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(qx, mid) <= v) lo = mid;
    else hi = mid;
  }
  const xlo = at(qx, lo),
    ylo = at(qy, lo);
  const span = at(qx, hi) - xlo;
  return span > 0 ? ylo + ((at(qy, hi) - ylo) * (v - xlo)) / span : ylo;
}
