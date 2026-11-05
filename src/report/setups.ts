// "Other setups": payback against hub height for each turbine count, from the same weather, with
// the entered setup marked. Clicking a point tries that setup.
import { COLORS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { money } from "../app/format.ts";
import { setForm } from "../app/form.ts";
import { hooks } from "../app/hooks.ts";
import type { Analysis } from "../app/state.ts";
import { isEntered } from "../model/setups.ts";
import type { SetupPoint } from "../model/setups.ts";
import { EDGE_CLIP, PAYBACK_GRID, plotted, topYears, verdictBands, years } from "./bands.ts";
import { axis, drawChart, legendLabels } from "./chartKit.ts";

/** Wind Blue, lighter for each further turbine count. */
const SHADES = [COLORS.wind, "#4f95c6", "#7fb2d7", "#aecfe8", "#cfe2f2"];
const shade = (i: number): string => SHADES[Math.min(i, SHADES.length - 1)] ?? COLORS.wind;

const turbines = (n: number): string => `${n} turbine${n === 1 ? "" : "s"}`;

/** The sentence: which setup pays back soonest, and why taller ones read as optimistic. */
function setupsText(a: Analysis, pts: readonly SetupPoint[]): string {
  const best = pts.filter((s) => Number.isFinite(s.payback)).toSorted((x, y) => x.payback - y.payback)[0];
  const caveat =
    ` Every height is costed at ${money(a.params.turbineCost)} a turbine installed; ` +
    "taller towers usually cost more, so read the taller options as optimistic.";
  if (!best) return `None of these setups pays back.${caveat}`;
  const lead = isEntered(a.params, best)
    ? `Of these, the setup entered pays back soonest, in about ${years(best.payback)}.`
    : `Of these, ${turbines(best.nTurbines)} at ${best.hubHeight} m pay${best.nTurbines === 1 ? "s" : ""} back soonest, in about ${years(best.payback)}.`;
  return lead + caveat;
}

/** Puts a setup in the form and runs it, as dragging its numbers would. */
function trySetup(s: SetupPoint): void {
  setForm({ nTurbines: String(s.nTurbines), hubHeight: String(s.hubHeight) });
  hooks.onChange("nTurbines", { live: true });
}

function drawSetups(a: Analysis, pts: readonly SetupPoint[]): void {
  const counts = [...new Set(pts.map((s) => s.nTurbines))];
  const lines = counts.map((n) => pts.filter((s) => s.nTurbines === n));
  const heights = pts.map((s) => s.hubHeight);
  drawChart("chSetups", {
    type: "line",
    data: {
      datasets: lines.map((line, i) => ({
        label: turbines(counts[i] ?? 0),
        data: line.map((s) => ({ x: s.hubHeight, y: plotted(s.payback) })),
        borderColor: shade(i),
        backgroundColor: shade(i),
        borderWidth: counts[i] === a.params.nTurbines ? 3 : 1.5,
        pointRadius: line.map((s) => (isEntered(a.params, s) ? 7 : 3)),
        pointHoverRadius: 7,
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        clip: EDGE_CLIP,
      })),
    },
    options: {
      interaction: { mode: "nearest", intersect: true },
      onHover: (_e, els, chart) => {
        chart.canvas.style.cursor = els.length > 0 ? "pointer" : "default";
      },
      onClick: (_e, els) => {
        const el = els[0];
        const s = el ? lines[el.datasetIndex]?.[el.index] : undefined;
        if (s) trySetup(s);
      },
      plugins: {
        legend: { labels: legendLabels },
        tooltip: {
          callbacks: { label: (c) => `${c.dataset.label ?? ""} at ${c.parsed.x} m: about ${years(c.parsed.y)}` },
        },
      },
      scales: {
        x: axis("Hub height (m)", { type: "linear" as const, min: Math.min(...heights), max: Math.max(...heights) }),
        y: axis("Simple payback (years)", { min: 0, max: topYears(pts.map((s) => s.payback)), grid: PAYBACK_GRID }),
      },
    },
    plugins: [verdictBands],
  });
}

/** Shows the other setups once worked out; until then any earlier ones stay, faded. */
export function renderSetups(a: Analysis): void {
  const card = $("#setupsCard");
  const pts = a.setups;
  card.classList.toggle("pending", pts === null);
  if (pts === null) return;
  card.hidden = false;
  $("#setupsText").textContent = setupsText(a, pts);
  drawSetups(a, pts);
}
