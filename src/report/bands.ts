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

/** The parts of a chart the bands draw on (any chart type). */
type BandChart = Pick<ChartJs, "ctx" | "chartArea" | "scales" | "canvas">;

/** Shades the verdict bands across the plot along the payback axis, each named in its ink. */
function drawBands(chart: BandChart, along: "x" | "y"): void {
  const { ctx, chartArea: a, scales } = chart;
  const s = scales[along];
  if (!s) return;
  ctx.save();
  ctx.font = `600 11px ${getComputedStyle(chart.canvas).fontFamily}`;
  ctx.textBaseline = "top";
  for (const b of BANDS) {
    const from = s.getPixelForValue(b.from),
      to = s.getPixelForValue(Math.min(b.to, s.max));
    ctx.fillStyle = b.wash;
    if (along === "y") {
      const top = Math.max(a.top, to),
        bottom = Math.min(a.bottom, from);
      if (bottom <= top) continue;
      ctx.fillRect(a.left, top, a.right - a.left, bottom - top);
      ctx.fillStyle = b.ink;
      ctx.textAlign = "right";
      ctx.fillText(b.label, a.right - 6, top + 4);
    } else {
      const left = Math.max(a.left, from),
        right = Math.min(a.right, to);
      if (right <= left) continue;
      ctx.fillRect(left, a.top, right - left, a.bottom - a.top);
      ctx.fillStyle = b.ink;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(b.label, left + 4, a.top - 3); // above the bars (the chart leaves room: BANDS_ABOVE_PX)
    }
  }
  ctx.restore();
}

/** Verdict bands for payback on the y axis (line charts). */
export const verdictBands: Plugin<"line"> = {
  id: "verdictBands",
  beforeDatasetsDraw: (chart) => drawBands(chart, "y"),
};

/** Room above a horizontal bar chart for verdictBandsX's labels. */
export const BANDS_ABOVE_PX = 18;

/** Verdict bands for payback on the x axis (horizontal bars), named above the plot. */
export const verdictBandsX: Plugin<"bar"> = {
  id: "verdictBandsX",
  beforeDatasetsDraw: (chart) => drawBands(chart, "x"),
};
