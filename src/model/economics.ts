// What the turbines cost and save: capital and running costs against the grid purchases and
// exports they change (simple payback; no inflation, discounting or incentives).
import { fraction, kwh } from "./units.ts";
import type { Kwh } from "./units.ts";
import type { Battery } from "./battery.ts";
import type { ModelParams, Scenario, SimResult } from "./simTypes.ts";

/** One system's grid exchange per year, from its battery's totals over the run. */
export const scenarioOf = (b: Battery, nYears: number, loadTot: number): Scenario => ({
  importKwh: kwh(b.imported / nYears),
  exportKwh: kwh(b.exported / nYears),
  selfSufficiency: fraction(loadTot > 0 ? 1 - b.imported / loadTot : 0),
});

/** Grid totals so far, kWh: bought and sold without the turbines, then with them. */
export type YearMark = readonly [importPv: number, exportPv: number, importBoth: number, exportBoth: number];

export const markOf = (pvOnly: Battery, withWind: Battery): YearMark => [
  pvOnly.imported,
  pvOnly.exported,
  withWind.imported,
  withWind.exported,
];

/** What the turbines saved each year (before maintenance), from the grid totals at each year's first hour and at the end. */
export function savingsByYear(
  marks: ReadonlyMap<number, YearMark>,
  end: YearMark,
  p: Pick<ModelParams, "price" | "exportCredit">,
): Map<number, number> {
  const years = [...marks.keys()].toSorted((a, b) => a - b);
  const out = new Map<number, number>();
  for (const [k, year] of years.entries()) {
    const a = marks.get(year),
      next = years[k + 1];
    const b = (next === undefined ? undefined : marks.get(next)) ?? end;
    if (!a) continue;
    const importCut = b[0] - a[0] - (b[2] - a[2]);
    const exportGain = b[3] - a[3] - (b[1] - a[1]);
    out.set(year, importCut * p.price + exportGain * p.exportCredit);
  }
  return out;
}

/** What one turbine costs installed: the turbine, and its tower by the metre when that is priced separately. */
export const turbineCapex = (p: Pick<ModelParams, "turbineCost" | "towerCostPerM" | "hubHeight">): number =>
  p.turbineCost + p.towerCostPerM * p.hubHeight;

/** Yearly savings from the turbines against PV only, and what the turbines cost. */
export function economics(p: ModelParams, A: Scenario, B: Scenario, windKwh: Kwh): SimResult["econ"] {
  const savings = (A.importKwh - B.importKwh) * p.price + (B.exportKwh - A.exportKwh) * p.exportCredit;
  const capex = turbineCapex(p) * p.nTurbines;
  const om = p.omPerTurbine * p.nTurbines;
  const netSavings = savings - om;
  return {
    savings,
    om,
    capex,
    netSavings,
    payback: netSavings > 0 ? capex / netSavings : Infinity,
    costPerKwh20: windKwh > 0 ? (capex + om * 20) / (windKwh * 20) : Infinity,
  };
}
