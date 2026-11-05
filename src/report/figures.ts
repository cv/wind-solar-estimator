// Headline figures and supporting statistics.
import { $ } from "../app/dom.ts";
import { esc, fmt, pct, money } from "../app/format.ts";
import type { DataRequest, WindSource } from "../app/state.ts";
import type { ModelParams, SimResult } from "../model/simulate.ts";
import { scrubbable } from "./scrubbable.ts";

/** A value's unit as a span, or nothing when it has none (""). */
const unitSpan = (unit: string): string => (unit === "" ? "" : `<span class="unit">${esc(unit)}</span>`);

/** A supporting line: text, or HTML already escaped (for draggable numbers). */
type Sub = string | { html: string };

/** A supporting line, or nothing when there is none (""). */
function subLine(sub: Sub): string {
  const html = typeof sub === "string" ? esc(sub) : sub.html;
  return html === "" ? "" : `<dd class="sub">${html}</dd>`;
}

/** One figure: label, value (with optional unit) and a supporting line. */
export const figure = (label: string, value: string, unit: string, sub: Sub, cls = ""): string =>
  `<div><dt>${esc(label)}</dt><dd class="value ${cls}">${esc(value)}${unitSpan(unit)}</dd>${subLine(sub)}</div>`;

/** One supporting statistic: label, value (with optional unit) and a supporting line. */
const stat = (label: string, value: string, unit: string, sub: string): string =>
  `<div><dt>${esc(label)}</dt><dd>${esc(value)}${unitSpan(unit)}</dd>${subLine(sub)}</div>`;

/** "on $20,000 installed", the cost per turbine draggable (with the total when there are several). */
function installed(p: ModelParams, capex: number): Sub {
  const each = scrubbable("turbineCost", p.turbineCost, money(p.turbineCost));
  return { html: p.nTurbines === 1 ? `on ${each} installed` : `on ${esc(money(capex))} installed (${each} each)` };
}

export function renderFigures(r: SimResult, p: ModelParams, req: DataRequest, source: WindSource | null): void {
  const measured = source?.kind === "measured" ? source.stats : null;
  const A = r.pvOnly,
    B = r.withWind,
    e = r.econ;
  const cut = A.importKwh - B.importKwh;
  const cutShare =
    A.importKwh > 0 ? `${pct(cut / A.importKwh)} less than without wind` : "No grid purchases even without wind";
  $("#figures").innerHTML = [
    figure("Wind energy", fmt(r.windKwh), "kWh/yr", `${pct(r.capacityFactor, 1)} capacity factor`, "wind"),
    figure("Grid purchases cut by", fmt(cut), "kWh/yr", cutShare),
    figure("Savings from wind", money(e.savings), "/yr", `${money(e.netSavings)}/yr after maintenance`),
    Number.isFinite(e.payback)
      ? figure("Simple payback", fmt(e.payback, e.payback < 10 ? 1 : 0), "years", installed(p, e.capex))
      : figure("Simple payback", "Never", "", installed(p, e.capex)),
  ].join("");

  // Supporting figures only: anything already in the summary or the assumptions isn't repeated here.
  $("#stats").innerHTML = [
    stat(
      "Mean wind at hub",
      fmt(r.meanHub, 1),
      "km/h",
      measured
        ? `${fmt(r.meanW10, 1)} at 10 m, measured with gaps filled`
        : `Weather data: ${fmt(r.meanW10, 1)} at 10 m, ${fmt(r.meanW100, 1)} at 100 m`,
    ),
    ...(measured
      ? [
          stat(
            "Station vs weather model",
            `${fmt(measured.meanStation, 1)} vs ${fmt(measured.meanModel, 1)}`,
            "km/h",
            `at 10 m, same hours; ${fmt(measured.energyRatio, 1)}× the wind energy`,
          ),
          stat("Measured hours", pct(measured.coverage, 1), "", `${fmt(measured.filled)} hours filled from the model`),
        ]
      : []),
    stat("Turbines producing", pct(r.generatingShare), "", "of all hours"),
    p.nTurbines > 1
      ? stat("Per turbine", fmt(r.windKwhPerTurbine), "kWh/yr", `${fmt(r.windKwhPerTurbine / 365, 1)} kWh a day`)
      : "",
    stat("Wind cost per kWh", money(e.costPerKwh20, 2), "", `over 20 years, vs ${money(p.price, 2)} from the grid`),
    stat("Solar energy", fmt(r.pvKwh), "kWh/yr", `${fmt(p.pvKwp, 1)} kWp, tilt ${req.tilt}°, facing ${req.compass}°`),
    stat("Self-sufficiency", pct(B.selfSufficiency), "", `${pct(A.selfSufficiency)} without wind`),
    stat("Surplus exported", fmt(B.exportKwh), "kWh/yr", `${fmt(A.exportKwh)} without wind`),
    p.inverterKw > 0
      ? stat(
          "Lost to the inverter limit",
          fmt(r.inverterLostKwh.withWind),
          "kWh/yr",
          `${fmt(r.inverterLostKwh.pvOnly)} without wind`,
        )
      : "",
  ].join("");
}
