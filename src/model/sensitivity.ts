// How the result moves if the wind at the turbine differs from the data: the biggest unknown in
// a site estimate, since wind energy rises with the cube of wind speed.
import { simulate } from "./simulate.ts";
import type { ModelParams, SimResult, SimWeather } from "./simulate.ts";
import { kmh } from "./units.ts";
import type { Kwh } from "./units.ts";

/** Wind at the turbine relative to the data: 30% weaker to 30% stronger. */
export const WIND_FACTORS: readonly number[] = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];

/** The result at one wind factor. */
export interface SensitivityPoint {
  factor: number;
  payback: number;
  netSavings: number;
  windKwh: Kwh;
}

/** The parameters with every hour's wind scaled by factor, on top of any calibration. */
export function withWindFactor(p: ModelParams, factor: number): ModelParams {
  return p.siteMeanKmh > 0
    ? { ...p, siteMeanKmh: kmh(p.siteMeanKmh * factor) }
    : { ...p, windScale: p.windScale * factor };
}

export const sensitivityPoint = (factor: number, r: SimResult): SensitivityPoint => ({
  factor,
  payback: r.econ.payback,
  netSavings: r.econ.netSavings,
  windKwh: r.windKwh,
});

/** Simulates the site with the wind scaled by factor. */
export const windCase = (wx: SimWeather, p: ModelParams, factor: number): SensitivityPoint =>
  sensitivityPoint(factor, simulate(wx, withWindFactor(p, factor)));
