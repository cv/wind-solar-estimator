// "What the result hinges on": simple payback for wind weaker or stronger than the data says,
// against the verdict's bands, with a sentence that carries the point on paper.
import type { Chart as ChartJs, Plugin } from "chart.js";
import { COLORS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { fmt } from "../app/format.ts";
import type { Analysis } from "../app/state.ts";
import type { SensitivityPoint } from "../model/sensitivity.ts";
import { axis, drawChart } from "./chartKit.ts";
import { MARGINAL_YEARS, PROMISING_YEARS } from "./verdict.ts";

/** The verdict bands behind the line: wash and ink of good, caution and problem. */
const BANDS = [
  { from: 0, to: PROMISING_YEARS, wash: "#e4f3e5", ink: "#1d5520", label: "Promising" },
  { from: PROMISING_YEARS, to: MARGINAL_YEARS, wash: "#fdf1df", ink: "#6b3d00", label: "Marginal" },
  { from: MARGINAL_YEARS, to: Infinity, wash: "#fde8e8", ink: "#8e1b1b", label: "Weak" },
] as const;

const years = (pb: number): string => `${fmt(pb, pb < 10 ? 1 : 0)} years`;
const factorLabel = (f: number): string => {
  const d = Math.round((f - 1) * 100);
  if (d === 0) return "As the data";
  return d > 0 ? `+${d}%` : `−${-d}%`;
};

/** The sentence: payback with the wind 20% weaker and 20% stronger than the data. */
function hingeText(pts: readonly SensitivityPoint[]): string {
  const weak = pts.find((p) => Math.abs(p.factor - 0.8) < 1e-9);
  const strong = pts.find((p) => Math.abs(p.factor - 1.2) < 1e-9);
  if (!weak || !strong) return "";
  const lead =
    "Wind energy rises with the cube of wind speed, so the wind at the turbine matters more than anything else here. ";
  const ifWeak = Number.isFinite(weak.payback)
    ? `If it is 20% weaker than the data says, the turbines would pay back in about ${years(weak.payback)}`
    : "If it is 20% weaker than the data says, the turbines would never pay back";
  const ifStrong = Number.isFinite(strong.payback)
    ? `; 20% stronger, in about ${years(strong.payback)}.`
    : "; even 20% stronger, they still wouldn't.";
  return lead + ifWeak + ifStrong;
}

/** The y axis's top: the paybacks shown, between 25 and 50 years. */
function topYears(pts: readonly SensitivityPoint[]): number {
  const finite = pts.map((p) => p.payback).filter((pb) => Number.isFinite(pb));
  return finite.length === 0 ? 25 : Math.min(50, Math.max(25, Math.ceil(Math.max(...finite) / 5) * 5));
}

/** Shades the verdict bands across the plot and names them at its right edge. */
const bands: Plugin<"line"> = {
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

function drawHinge(pts: readonly SensitivityPoint[]): void {
  drawChart("chHinge", {
    type: "line",
    data: {
      labels: pts.map((p) => factorLabel(p.factor)),
      datasets: [
        {
          label: "Simple payback",
          data: pts.map((p) => (Number.isFinite(p.payback) ? Math.round(p.payback * 10) / 10 : null)),
          borderColor: COLORS.wind,
          backgroundColor: COLORS.wind,
          pointRadius: pts.map((p) => (p.factor === 1 ? 6 : 3)),
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `Payback: about ${years(c.parsed.y)}` } },
      },
      scales: {
        x: axis("Wind at the turbine, compared with the data"),
        y: axis("Simple payback (years)", { min: 0, max: topYears(pts), grid: { color: "rgba(23,32,51,0.08)" } }),
      },
    },
    plugins: [bands],
  });
}

/** Shows the sensitivity once worked out; until then any earlier one stays, faded. */
export function renderSensitivity(a: Analysis): void {
  const section = $("#hinge");
  const pts = a.sensitivity;
  section.classList.toggle("pending", pts === null);
  if (pts === null) return;
  section.hidden = false;
  $("#hingeText").textContent = hingeText(pts);
  drawHinge(pts);
}
