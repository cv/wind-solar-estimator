// Headline figures and supporting statistics.
import { $ } from "../app/dom.ts";
import { esc, fmt, pct, money } from "../app/format.ts";
import type { DataRequest } from "../app/state.ts";
import { state } from "../app/state.ts";
import type { ModelParams, SimResult } from "../model/simulate.ts";

/** One figure: label, value (with optional unit) and a supporting line. */
export const figure = (label: string, value: string, unit: string, sub: string, cls: string = ""): string =>
  `<div><dt>${esc(label)}</dt><dd class="value ${cls}">${esc(value)}${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</dd>` +
  (sub ? `<dd class="sub">${esc(sub)}</dd>` : "") +
  `</div>`;

/** One supporting statistic: label, value (with optional unit) and a supporting line. */
const stat = (label: string, value: string, unit: string, sub: string): string =>
  `<div><dt>${esc(label)}</dt><dd>${esc(value)}${unit ? `<span class="unit">${esc(unit)}</span>` : ""}</dd>${sub ? `<dd class="sub">${esc(sub)}</dd>` : ""}</div>`;

export function renderFigures(r: SimResult, p: ModelParams, req: DataRequest): void {
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
      ? figure("Simple payback", fmt(e.payback, e.payback < 10 ? 1 : 0), "years", `on ${money(e.capex)} installed`)
      : figure("Simple payback", "Never", "", `on ${money(e.capex)} installed`),
  ].join("");

  // Supporting figures only: anything already in the summary or the assumptions isn't repeated here.
  $("#stats").innerHTML = [
    stat(
      "Mean wind at hub",
      fmt(r.meanHub, 1),
      "km/h",
      state.source?.stats
        ? `${fmt(r.meanW10, 1)} at 10 m, measured with gaps filled`
        : `Weather data: ${fmt(r.meanW10, 1)} at 10 m, ${fmt(r.meanW100, 1)} at 100 m`,
    ),
    ...(state.source?.stats
      ? [
          stat(
            "Station vs weather model",
            `${fmt(state.source.stats.meanStation, 1)} vs ${fmt(state.source.stats.meanModel, 1)}`,
            "km/h",
            `at 10 m, same hours; ${fmt(state.source.stats.energyRatio, 1)}× the wind energy`,
          ),
          stat(
            "Measured hours",
            pct(state.source.stats.coverage, 1),
            "",
            `${fmt(state.source.stats.filled)} hours filled from the model`,
          ),
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
    (p.inverterKw ?? 0) > 0
      ? stat(
          "Lost to the inverter limit",
          fmt(r.inverterLostKwh.withWind),
          "kWh/yr",
          `${fmt(r.inverterLostKwh.pvOnly)} without wind`,
        )
      : "",
  ].join("");
}
