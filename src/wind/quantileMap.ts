// Quantile mapping: turns one distribution of wind speeds into another (pure functions).

const QUANTILES = 200;

function quantiles(sorted, q) {
  const out = new Float64Array(q);
  const last = sorted.length - 1;
  for (let k = 0; k < q; k++) {
    const pos = ((k + 0.5) / q) * last;
    const j = Math.floor(pos);
    const f = pos - j;
    out[k] = j >= last ? sorted[last] : sorted[j] * (1 - f) + sorted[j + 1] * f;
  }
  return out;
}

/** Fits a monotone mapping that turns the distribution of x into that of y (paired samples). */
export function fitQuantileMap(x, y, q = QUANTILES) {
  const xs = Float64Array.from(x).sort();
  const ys = Float64Array.from(y).sort();
  return { qx: quantiles(xs, q), qy: quantiles(ys, q) };
}

/** Applies a fitted mapping; beyond the fitted range it scales in proportion. */
export function applyQuantileMap({ qx, qy }, v) {
  const n = qx.length;
  if (v <= qx[0]) return qx[0] > 0 ? (qy[0] * v) / qx[0] : qy[0];
  if (v >= qx[n - 1]) return qx[n - 1] > 0 ? (qy[n - 1] * v) / qx[n - 1] : qy[n - 1];
  let lo = 0,
    hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (qx[mid] <= v) lo = mid;
    else hi = mid;
  }
  const span = qx[hi] - qx[lo];
  return span > 0 ? qy[lo] + ((qy[hi] - qy[lo]) * (v - qx[lo])) / span : qy[lo];
}
