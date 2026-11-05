// The power curve editor's chart: the curve and its points against the physical (Betz) limit,
// with the region above the limit shaded, plus the axis ranges and steps the editor works in.
import type { Chart as ChartJs, ChartConfiguration, Plugin } from "chart.js";
import { COLORS } from "../app/constants.ts";
import { betzLimitW } from "../model/physics.ts";
import type { CurvePoint } from "../model/powerCurve.ts";
import { kmh, squareMetres } from "../model/units.ts";
import { at } from "../util/checked.ts";

/** A chart point: wind speed (km/h) and power (kW). */
interface XY {
  x: number;
  y: number;
}
export type CurveChart = ChartJs<"line", XY[]>;

/** What the chart shows. */
export interface CurveView {
  pts: CurvePoint[];
  /** Capture area (m²) times duct augmentation: what the physical limit scales with (0 when unknown). */
  limitArea: number;
  /** Axis ranges, km/h and kW. */
  xMax: number;
  yMax: number;
  /** The highlighted point. */
  active: number | null;
}

const LIMIT_WASH = "#fde8e8";
const LIMIT_INK = "#8e1b1b";

/** The physical limit at v km/h for this area, in kW. */
export const limitKw = (v: number, area: number): number => betzLimitW(kmh(v), squareMetres(area)) / 1000;

/** x rounded to a multiple of step, without float noise in the text. */
export const roundTo = (x: number, step: number): number => Number((Math.round(x / step) * step).toPrecision(12));

/** The smallest of 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten at or above x. */
function niceCeil(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8].map((m) => m * p).find((n) => n >= x - 1e-9) ?? 10 * p;
}

/** Output step (W) for dragging and the arrow keys: about 1/400 of a chart yMax kW tall, rounded to 1, 2 or 5. */
export function wattStep(yMax: number): number {
  const s = (yMax * 1000) / 400;
  const p = 10 ** Math.floor(Math.log10(s));
  return [1, 2, 5].map((m) => m * p).find((n) => n >= s) ?? 10 * p;
}

/** Axis ranges for a curve: to a little past rated output (at least 40 km/h), and a quarter above its peak. */
export function curveRanges(pts: readonly CurvePoint[]): Pick<CurveView, "xMax" | "yMax"> {
  const maxW = Math.max(...pts.map(([, w]) => w));
  const ratedKmh = (pts.find(([, w]) => w >= maxW) ?? at(pts, 0))[0];
  const lastKmh = at(pts, pts.length - 1)[0];
  return {
    xMax: Math.max(10, Math.min(lastKmh, Math.max(40, Math.ceil((ratedKmh * 1.3) / 5) * 5))),
    yMax: niceCeil(Math.max(maxW / 1000, 0.1) * 1.25),
  };
}

/** Labels the shaded region above the limit, where it reaches the top left corner. */
function impossibleLabel(view: CurveView): Plugin<"line"> {
  return {
    id: "impossibleLabel",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales } = chart;
      const x = scales["x"],
        y = scales["y"];
      if (view.limitArea <= 0 || !x || !y) return;
      const text = "Beyond the physical limit";
      ctx.save();
      ctx.font = `600 11px ${getComputedStyle(chart.canvas).fontFamily}`;
      const v = x.getValueForPixel(a.left + 8 + ctx.measureText(text).width);
      const top = y.getValueForPixel(a.top + 20);
      if (v !== undefined && top !== undefined && limitKw(v, view.limitArea) < top) {
        ctx.fillStyle = LIMIT_INK;
        ctx.textBaseline = "top";
        ctx.fillText(text, a.left + 8, a.top + 6);
      }
      ctx.restore();
    },
  };
}

/** The chart's axes, for the view's ranges. */
type Scales = NonNullable<NonNullable<ChartConfiguration<"line", XY[]>["options"]>["scales"]>;

const scales = (view: CurveView): Scales => ({
  x: {
    type: "linear",
    min: 0,
    max: view.xMax,
    title: { display: true, text: "Wind speed (km/h)" },
    ticks: { maxTicksLimit: 9 },
  },
  y: { type: "linear", min: 0, max: view.yMax, title: { display: true, text: "kW per turbine" } },
});

/** A chart of view (read again on every draw); it ignores the pointer, which the editor handles. */
export function createCurveChart(canvas: HTMLCanvasElement, view: CurveView): CurveChart {
  const overLimit = (i: number): boolean => {
    const p = view.pts[i];
    return p !== undefined && view.limitArea > 0 && p[1] / 1000 > limitKw(p[0], view.limitArea);
  };
  return new Chart<"line", XY[]>(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Physical limit",
          data: [],
          borderColor: COLORS.limit,
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: "end",
          backgroundColor: LIMIT_WASH,
          order: 2,
        },
        {
          label: "Power curve",
          data: [],
          borderColor: COLORS.wind,
          borderWidth: 2,
          pointRadius: (c) => (c.dataIndex === view.active ? 6 : 4),
          pointBackgroundColor: (c) => (overLimit(c.dataIndex) ? COLORS.limit : COLORS.wind),
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: [],
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: scales(view),
    },
    plugins: [impossibleLabel(view)],
  });
}

/** Redraws the chart for view; stale fades it while the curve text can't be read. */
export function drawCurveChart(chart: CurveChart, view: CurveView, stale: boolean): void {
  const [limit, curve] = chart.data.datasets;
  if (!limit || !curve) return;
  const n = 120;
  const speeds = Array.from({ length: n + 1 }, (_, i) => (view.xMax * i) / n);
  limit.data = view.limitArea > 0 ? speeds.map((v) => ({ x: v, y: limitKw(v, view.limitArea) })) : [];
  curve.data = view.pts.map(([v, w]) => ({ x: v, y: w / 1000 }));
  chart.options.scales = scales(view);
  chart.canvas.parentElement?.classList.toggle("stale", stale);
  chart.update("none");
}
