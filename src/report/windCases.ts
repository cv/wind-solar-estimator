// "Which wind data": simple payback with each nearby station's measured wind and with the weather
// model alone, over the verdict's bands, the source in use marked. Clicking a bar uses that source.
import { COLORS } from "../app/constants.ts";
import { $ } from "../app/dom.ts";
import { setForm } from "../app/form.ts";
import { hooks } from "../app/hooks.ts";
import type { Analysis, WindCase } from "../app/state.ts";
import { BANDS_ABOVE_PX, PAYBACK_GRID, plotted, topYears, verdictBandsX, years } from "./bands.ts";
import { axis, drawChart } from "./chartKit.ts";

const OTHER = "#9db8d6";
const usable = (w: WindCase): boolean => w.reason === "";

/** "about 19 years" or "never". */
const paybackText = (pb: number): string => (Number.isFinite(pb) ? `about ${years(pb)}` : "never");

/** A source in a sentence: the station as labelled, or the weather model. */
const source = (w: WindCase): string => (w.id === "model" ? "the weather model alone" : w.label);

/** The sentence: what the other sources would give, and which couldn't be used. */
function windText(cases: readonly WindCase[]): string {
  const inUse = cases.find((w) => w.inUse);
  const others = cases.filter((w) => !w.inUse && usable(w)).toSorted((x, y) => x.payback - y.payback);
  const first = others[0],
    last = others.at(-1);
  const lead = inUse ? `With the wind data in use, ${source(inUse)}, payback is ${paybackText(inUse.payback)}. ` : "";
  let body = "";
  if (first && last && first !== last)
    body = `With another source's wind it would range from ${paybackText(first.payback)} with ${source(first)} to ${paybackText(last.payback)} with ${source(last)}.`;
  else if (first) body = `With ${source(first)} it would be ${paybackText(first.payback)}.`;
  const unusable = cases.filter((w) => !usable(w)).map((w) => `${w.label} (${w.reason})`);
  const tail = unusable.length > 0 ? ` Not compared: ${unusable.join("; ")}.` : "";
  return `${lead}${body} Stations usually sit in open places such as airports, so the closest match to the site's exposure matters more than the nearest.${tail}`;
}

/** Uses a source's wind for the analysis (it downloads only what isn't kept already). */
function useSource(w: WindCase): void {
  setForm({ windSource: w.id === "model" ? "model" : `eccc:${w.id}` });
  hooks.analyse();
}

function drawWind(cases: readonly WindCase[]): void {
  const shown = cases.filter((w) => usable(w));
  $("#windChartBox").style.height = `${90 + shown.length * 30}px`;
  drawChart("chWind", {
    type: "bar",
    data: {
      labels: shown.map((w) => (Number.isFinite(w.payback) ? w.label : `${w.label} (never)`)),
      datasets: [
        {
          label: "Simple payback",
          data: shown.map((w) => plotted(w.payback)),
          backgroundColor: shown.map((w) => (w.inUse ? COLORS.wind : OTHER)),
          barThickness: 16,
        },
      ],
    },
    options: {
      indexAxis: "y",
      layout: { padding: { top: BANDS_ABOVE_PX } },
      onHover: (_e, els, chart) => {
        const w = els[0] ? shown[els[0].index] : undefined;
        chart.canvas.style.cursor = w && !w.inUse ? "pointer" : "default";
      },
      onClick: (_e, els) => {
        const w = els[0] ? shown[els[0].index] : undefined;
        if (w && !w.inUse) useSource(w);
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `Payback: ${paybackText(c.parsed.x)}` } },
      },
      scales: {
        x: axis("Simple payback (years)", { min: 0, max: topYears(shown.map((w) => w.payback)), grid: PAYBACK_GRID }),
        y: { grid: { display: false } },
      },
    },
    plugins: [verdictBandsX],
  });
}

/** Shows the comparison once worked out; until then any earlier one stays, faded; hidden without one. */
export function renderWindCases(a: Analysis): void {
  const card = $("#windCard");
  const cases = a.windCases;
  card.classList.toggle("pending", cases === null);
  if (cases === null) return;
  card.hidden = false;
  $("#windText").textContent = windText(cases);
  drawWind(cases);
}
