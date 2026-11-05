// Chart.js charts: wind distribution, monthly energy, imports, battery charge, yearly wind and power curve.
import { at } from "../util/checked.ts";
import { MONTHS, COLORS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { fmt } from "../app/format.ts";
import { state } from "../app/state.ts";
import { betzLimitW } from "../model/physics.ts";
import { makeCurveFn } from "../model/powerCurve.ts";
import { kmh } from "../model/units.ts";
import type { ModelParams, SimResult } from "../model/simulate.ts";
import { axis, drawChart } from "./chartKit.ts";

const round = (a: readonly number[]): number[] => a.map((x) => Math.round(x));
const positive = (x: number): number | null => (x > 0 ? x : null);
/** State-of-charge fractions as percentages to one decimal, keeping gaps. */
const asPct = (a: ReadonlyArray<number | null>): Array<number | null> =>
  a.map((x) => (x == null ? null : Math.round(x * 1000) / 10));

export function renderCharts(r: SimResult, p: ModelParams): void {
  drawDistribution(r);
  drawMonthly(r);
  drawImports(r);
  drawSoc(r, p);
  drawYearly(r);
  drawCurve(p);
}

/** Wind speed distribution and energy by speed, up to the last bin with an hour or a kWh in it. */
function drawDistribution(r: SimResult): void {
  let last = r.hist.hours.length - 1;
  while (last > 0 && at(r.hist.hours, last) < 1 && at(r.hist.energy, last) < 1) last--;
  const bins = r.hist.hours.slice(0, last + 1).map((_, i) => `${i * r.hist.binKmh}`);
  drawChart("chDist", {
    data: {
      labels: bins,
      datasets: [
        {
          type: "bar",
          label: "Hours per year",
          data: r.hist.hours.slice(0, last + 1).map((x) => Math.round(x)),
          backgroundColor: "rgba(31,119,180,0.35)",
          yAxisID: "y",
        },
        {
          type: "line",
          label: "Wind energy (kWh/yr)",
          data: r.hist.energy.slice(0, last + 1).map((x) => Math.round(x)),
          borderColor: COLORS.wind,
          backgroundColor: COLORS.wind,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      scales: {
        x: axis(`Wind speed at hub, km/h (${r.hist.binKmh} km/h bins)`),
        y: axis("Hours per year", { beginAtZero: true }),
        y1: axis("kWh per year", { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } }),
      },
    },
  });
}

/** Wind and solar generation stacked by month, against electricity use. */
function drawMonthly(r: SimResult): void {
  drawChart("chMonthly", {
    data: {
      labels: [...MONTHS],
      datasets: [
        { type: "bar", label: "Wind", data: round(r.monthly.wind), backgroundColor: COLORS.wind, stack: "gen" },
        { type: "bar", label: "Solar", data: round(r.monthly.pv), backgroundColor: COLORS.solar, stack: "gen" },
        {
          type: "line",
          label: "Electricity use",
          data: round(r.monthly.load),
          borderColor: COLORS.load,
          backgroundColor: COLORS.load,
          pointRadius: 2,
        },
      ],
    },
    options: { scales: { x: { stacked: true }, y: axis("kWh per month", { stacked: true, beginAtZero: true }) } },
  });
}

/** Electricity bought each month, without and with wind. */
function drawImports(r: SimResult): void {
  drawChart("chImport", {
    type: "bar",
    data: {
      labels: [...MONTHS],
      datasets: [
        { label: "Solar + battery only", data: round(r.monthly.importPv), backgroundColor: COLORS.grey },
        { label: "With wind", data: round(r.monthly.importBoth), backgroundColor: COLORS.wind },
      ],
    },
    options: { scales: { y: axis("kWh bought per month", { beginAtZero: true }) } },
  });
}

/** Wind energy in each weather year, against the average. */
function drawYearly(r: SimResult): void {
  const mean = r.windKwh;
  drawChart("chYearly", {
    data: {
      labels: r.yearly.map((y) => String(y.year)),
      datasets: [
        {
          type: "bar",
          label: "Wind energy",
          data: r.yearly.map((y) => Math.round(y.kwh)),
          backgroundColor: COLORS.wind,
        },
        {
          type: "line",
          label: "Average",
          data: r.yearly.map(() => Math.round(mean)),
          borderColor: COLORS.load,
          borderDash: [5, 4],
          pointRadius: 0,
        },
      ],
    },
    options: { scales: { y: axis("kWh per year", { beginAtZero: true }) } },
  });
}

/** Powers of ten labelled on the power curve's log axis. */
const LOG_TICKS = new Set([0.1, 1, 10, 100, 1000, 10_000, 100_000]);

/** A log-axis tick label: powers of ten only, thousands as "k". */
function logTick(v: string | number): string {
  if (typeof v !== "number" || !LOG_TICKS.has(v)) return "";
  return v >= 1000 ? `${v / 1000}k` : String(v);
}

/** The entered power curve against the physical limit for the capture area, on a log scale. */
function drawCurve(p: ModelParams): void {
  const curve = makeCurveFn(p.curvePts);
  const speeds = Array.from({ length: 61 }, (_, i) => kmh(i));
  drawChart("chCurve", {
    type: "line",
    data: {
      labels: speeds.map(String),
      datasets: [
        {
          label: "Entered power curve (W)",
          data: speeds.map((s) => positive(curve(s))),
          borderColor: COLORS.wind,
          backgroundColor: COLORS.wind,
          pointRadius: 0,
        },
        {
          label: `Physical limit, ${fmt(p.captureAreaM2, p.captureAreaM2 < 10 ? 2 : 1)} m²${p.augmentation > 1 ? ` ×${fmt(p.augmentation, 1)}` : ""} (W)`,
          data: speeds.map((s) => positive(betzLimitW(s, p.captureAreaM2) * p.augmentation)),
          borderColor: COLORS.limit,
          backgroundColor: COLORS.limit,
          borderDash: [6, 4],
          pointRadius: 0,
        },
      ],
    },
    options: {
      scales: {
        x: axis("Wind speed (km/h)", { ticks: { maxTicksLimit: 13 } }),
        y: axis("Watts (log scale)", { type: "logarithmic" as const, min: 0.1, ticks: { callback: logTick } }),
      },
    },
  });
}

/** Redraws the battery-charge chart for the month picked in #socMonth (its change handler). */
export function renderSoc(): void {
  if (!state.analysis) return; // nothing analysed yet
  const { result, params } = state.analysis;
  drawSoc(result, params);
}

function drawSoc(r: SimResult, p: ModelParams): void {
  const mo = Number($("#socMonth", HTMLSelectElement).value) || 0;
  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  drawChart("chSoc", {
    type: "line",
    data: {
      labels: hours,
      datasets: [
        {
          label: "With wind",
          data: asPct(at(r.socDay.withWind, mo)),
          borderColor: COLORS.wind,
          backgroundColor: COLORS.wind,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: "Without wind",
          data: asPct(at(r.socDay.pvOnly, mo)),
          borderColor: COLORS.grey,
          backgroundColor: COLORS.grey,
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: "Minimum charge",
          data: hours.map(() => p.battMinSoc * 100),
          borderColor: COLORS.limit,
          borderWidth: 1,
          borderDash: [2, 3],
          pointRadius: 0,
        },
      ],
    },
    options: {
      scales: {
        y: axis("Battery charge (%)", { min: 0, max: 100 }),
        x: axis("Hour of day", { ticks: { maxTicksLimit: 8 } }),
      },
    },
  });
}
