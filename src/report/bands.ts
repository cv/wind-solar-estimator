// Simple payback over the verdict's bands: the shared look of the charts in "What the result hinges on".
import type { Chart as ChartJs, Plugin } from "chart.js";
import { fmt } from "../app/format.ts";
import { MARGINAL_YEARS, PROMISING_YEARS } from "./verdict.ts";

/** The verdict bands behind the lines: wash and ink of good, caution and problem. */
const BANDS = [
  { from: 0, to: PROMISING_YEARS, wash: "#e4f3e5", ink: "#1d5520", label: "Promising" },
  { from: PROMISING_YEARS, to: MARGINAL_YEARS, wash: "#fdf1df", ink: "#6b3d00", label: "Marginal" },
  { from: MARGINAL_YEARS, to: Infinity, wash: "#fde8e8", ink: "#8e1b1b", label: "Weak" },
] as const;

/** Lets points at the plot's left and right edges show whole, while lines stay cut at its top. */
export const EDGE_CLIP = { left: 8, right: 8, top: 0, bottom: 8 };

/** Grid lines that read over the washes. */
export const PAYBACK_GRID = { color: "rgba(23,32,51,0.08)" };

export const years = (pb: number): string => `${fmt(pb, pb < 10 ? 1 : 0)} years`;

/** A payback to plot: to a tenth of a year, or a gap (NaN) when it never pays back. */
export const plotted = (pb: number): number => (Number.isFinite(pb) ? Math.round(pb * 10) / 10 : Number.NaN);

/** The y axis's top for these paybacks: between 25 and 50 years. */
export function topYears(paybacks: readonly number[]): number {
  const finite = paybacks.filter((pb) => Number.isFinite(pb));
  return finite.length === 0 ? 25 : Math.min(50, Math.max(25, Math.ceil(Math.max(...finite) / 5) * 5));
}

/** Shades the verdict bands across the plot and names them at its right edge. */
export const verdictBands: Plugin<"line"> = {
  id: "verdictBands",
  beforeDatasetsDraw(chart: ChartJs<"line">) {
    const { ctx, chartArea: a, scales } = chart;
    const y = scales["y"];
    if (!y) return;
    ctx.save();
    ctx.font = `600 11px ${getComputedStyle(chart.canvas).fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    for (const b of BANDS) {
      const top = Math.max(a.top, y.getPixelForValue(Math.min(b.to, y.max)));
      const bottom = Math.min(a.bottom, y.getPixelForValue(b.from));
      if (bottom <= top) continue;
      ctx.fillStyle = b.wash;
      ctx.fillRect(a.left, top, a.right - a.left, bottom - top);
      ctx.fillStyle = b.ink;
      ctx.fillText(b.label, a.right - 6, top + 4);
    }
    ctx.restore();
  },
};
