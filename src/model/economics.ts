// What the turbines cost and save: capital and running costs against the grid purchases and
// exports they change (simple payback; no inflation, discounting or incentives).
import type { Kwh } from "./units.ts";
import type { ModelParams, Scenario, SimResult } from "./simTypes.ts";

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
