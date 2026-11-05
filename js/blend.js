// Combines measured station wind with the weather model (ERA5) hour by hour.
// Pure functions (no DOM, no network), so they can be unit-tested in Node.
//
// Station readings are used wherever they exist. Missing hours are filled from the
// weather model at the site, passed through a quantile mapping fitted on the hours both
// have, season by season: the filled hours then follow the station's own spread of wind
// speeds (calms, gusts), not just its average. Hub-height wind keeps the model's
// hour-by-hour 10 m -> 100 m shear, so the simulation itself needs no changes.

const SEASON = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0]; // Dec–Feb, Mar–May, Jun–Aug, Sep–Nov
const QUANTILES = 200;
const MIN_PAIRS_SEASON = 1000; // fewer than this and a season uses the all-year mapping
export const MIN_PAIRS = 500; // fewer than this (about three weeks) and the station isn't used
export const POOR_CORRELATION = 0.5; // below this, station and model follow different local winds

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
export function checkHomogeneity(yearly, { minYears = 5, minChange = 0.15, minT = 3, minSide = 2 } = {}) {
  const ys = yearly.filter((y) => y.coverage >= 0.5 && y.model > 0).map((y) => ({ year: y.year, ratio: y.station / y.model }));
  const n = ys.length;
  const out = { years: n, ratios: ys, trend: null, step: null, issue: null };
  if (n < minYears) return out;
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const r = ys.map((y) => y.ratio), x = ys.map((y) => y.year);
  const mr = avg(r), mx = avg(x);

  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (r[i] - mr); }
  const slope = sxy / sxx;
  let ssr = 0;
  for (let i = 0; i < n; i++) ssr += (r[i] - (mr + slope * (x[i] - mx))) ** 2;
  const se = Math.sqrt(ssr / (n - 2) / sxx);
  const start = mr + slope * (x[0] - mx), end = mr + slope * (x[n - 1] - mx);
  out.trend = { from: x[0], to: x[n - 1], start, end, change: end / start - 1, t: se > 0 ? Math.abs(slope) / se : Infinity };

  for (let k = minSide; k <= n - minSide; k++) {
    const b = r.slice(0, k), a = r.slice(k);
    const mb = avg(b), ma = avg(a);
    const ss = b.reduce((s, v) => s + (v - mb) ** 2, 0) + a.reduce((s, v) => s + (v - ma) ** 2, 0);
    const s = Math.sqrt(ss / (n - 2));
    const t = s > 0 ? Math.abs(ma - mb) / (s * Math.sqrt(1 / k + 1 / (n - k))) : Infinity;
    if (!out.step || t > out.step.t) out.step = { year: x[k], from: x[0], to: x[n - 1], before: mb, after: ma, change: ma / mb - 1, t };
  }

  const clear = (f) => f && Math.abs(f.change) >= minChange && f.t >= minT;
  if (clear(out.step) && (!clear(out.trend) || out.step.t >= out.trend.t)) out.issue = "step";
  else if (clear(out.trend)) out.issue = "trend";
  return out;
}

/** Station speeds lined up with the model's hours (NaN where the station has no reading). */
export function alignStation(t, obs) {
  const out = new Float32Array(t.length).fill(NaN);
  const index = new Map();
  for (let i = 0; i < t.length; i++) index.set(t[i], i);
  for (let k = 0; k < obs.hours.length; k++) {
    const i = index.get(obs.hours[k]);
    if (i !== undefined) out[i] = obs.wind[k];
  }
  return out;
}

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
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (qx[mid] <= v) lo = mid; else hi = mid;
  }
  const span = qx[hi] - qx[lo];
  return span > 0 ? qy[lo] + ((qy[hi] - qy[lo]) * (v - qx[lo])) / span : qy[lo];
}

/** The model's shear exponent for one hour, as the simulation computes it. */
export const shearAlpha = (w10, w100) => (w10 > 1 && w100 > 0 ? Math.min(0.6, Math.max(0, Math.log10(w100 / w10))) : 1 / 7);

/**
 * Replaces the model's 10 m wind with station readings, filling gaps as described above.
 * Returns null when the station has too few readings in the period. Otherwise returns
 * { wx, stats }: wx is a copy of the weather with new w10 and w100 series; stats compare
 * station and model over the hours both have.
 */
export function blendStation(wx, obs) {
  const st = alignStation(wx.t, obs);
  const n = wx.n;
  const px = [[], [], [], []], py = [[], [], [], []];
  let pairs = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, cx = 0, cy = 0;
  const years = new Map(); // year -> [hours, shared hours, station sum, model sum]
  for (let i = 0; i < n; i++) {
    const yr = years.get(wx.year[i]) ?? years.set(wx.year[i], [0, 0, 0, 0]).get(wx.year[i]);
    yr[0]++;
    const y = st[i];
    if (Number.isNaN(y)) continue;
    yr[1]++; yr[2] += y; yr[3] += wx.w10[i];
    const x = wx.w10[i];
    const s = SEASON[wx.month[i]];
    px[s].push(x); py[s].push(y);
    pairs++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; cx += x ** 3; cy += y ** 3;
  }
  if (pairs < MIN_PAIRS) return null;

  const all = fitQuantileMap(px.flat(), py.flat());
  const maps = px.map((x, s) => (x.length >= MIN_PAIRS_SEASON ? fitQuantileMap(x, py[s]) : all));
  const w10 = new Float32Array(n), w100 = new Float32Array(n);
  let filled = 0;
  for (let i = 0; i < n; i++) {
    let v = st[i];
    if (Number.isNaN(v)) { v = applyQuantileMap(maps[SEASON[wx.month[i]]], wx.w10[i]); filled++; }
    w10[i] = v;
    w100[i] = v * 10 ** shearAlpha(wx.w10[i], wx.w100[i]);
  }

  const yearly = [...years].sort((a, b) => a[0] - b[0]).map(([year, [h, k, s, m]]) =>
    ({ year, coverage: k / h, station: k ? s / k : NaN, model: k ? m / k : NaN }));
  const mx = sx / pairs, my = sy / pairs;
  const cov = sxy / pairs - mx * my;
  const vx = sxx / pairs - mx * mx, vy = syy / pairs - my * my;
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
