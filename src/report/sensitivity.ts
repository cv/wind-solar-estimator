// "What the result hinges on": simple payback for wind weaker or stronger than the data says,
// against the verdict's bands, with a sentence that carries the point on paper.
import { COLORS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import type { Analysis } from "../app/state.ts";
import type { SensitivityPoint } from "../model/sensitivity.ts";
import { axis, drawChart } from "./chartKit.ts";
import { EDGE_CLIP, PAYBACK_GRID, plotted, topYears, verdictBands, years } from "./bands.ts";

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

function drawHinge(pts: readonly SensitivityPoint[]): void {
  drawChart("chHinge", {
    type: "line",
    data: {
      labels: pts.map((p) => factorLabel(p.factor)),
      datasets: [
        {
          label: "Simple payback",
          data: pts.map((p) => plotted(p.payback)),
          borderColor: COLORS.wind,
          backgroundColor: COLORS.wind,
          pointRadius: pts.map((p) => (p.factor === 1 ? 6 : 3)),
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
          clip: EDGE_CLIP,
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
        y: axis("Simple payback (years)", { min: 0, max: topYears(pts.map((p) => p.payback)), grid: PAYBACK_GRID }),
      },
    },
    plugins: [verdictBands],
  });
}

/** Shows the sensitivity once worked out; until then any earlier one stays, faded. */
export function renderSensitivity(a: Analysis): void {
  const pts = a.sensitivity;
  $("#hingeCard").classList.toggle("pending", pts === null);
  if (pts === null) return;
  $("#hinge").hidden = false;
  $("#hingeText").textContent = hingeText(pts);
  drawHinge(pts);
}
