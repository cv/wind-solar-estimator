// Other setups for the same site: payback for each turbine count and hub height near the entered
// ones, so the reader sees the shape of the choice rather than a single answer.
import { simulate } from "./simulate.ts";
import type { ModelParams, SimResult, SimWeather } from "./simulate.ts";
import { kmh, metres } from "./units.ts";
import type { Kwh } from "./units.ts";

export interface Setup {
  nTurbines: number;
  hubHeight: number;
}

export interface SetupPoint extends Setup {
  payback: number;
  windKwh: Kwh;
}

const HEIGHTS = [8, 12, 16, 20, 25, 30];
const COUNTS = [1, 2, 3, 4];

const uniqueSorted = (xs: readonly number[]): number[] => [...new Set(xs)].toSorted((a, b) => a - b);

/** The setups to compare, by turbine count then height: these counts and heights, plus the entered ones. */
export function setupGrid(p: Pick<ModelParams, "nTurbines" | "hubHeight">): Setup[] {
  const heights = uniqueSorted([...HEIGHTS, p.hubHeight]);
  return uniqueSorted([...COUNTS, p.nTurbines]).flatMap((nTurbines) =>
    heights.map((hubHeight) => ({ nTurbines, hubHeight })),
  );
}

export const isEntered = (p: Pick<ModelParams, "nTurbines" | "hubHeight">, s: Setup): boolean =>
  s.nTurbines === p.nTurbines && s.hubHeight === p.hubHeight;

/**
 * The parameters for another setup. The wind keeps the entered setup's correction to the weather
 * model (base.scale), so a calibration to a measured mean carries over, and other heights follow
 * the model's shear.
 */
export function setupParams(p: ModelParams, base: SimResult, s: Setup): ModelParams {
  return { ...p, nTurbines: s.nTurbines, hubHeight: metres(s.hubHeight), siteMeanKmh: kmh(0), windScale: base.scale };
}

export const setupPoint = (s: Setup, r: SimResult): SetupPoint => ({
  ...s,
  payback: r.econ.payback,
  windKwh: r.windKwh,
});

/** Simulates one setup (the entered one is base itself). */
export const setupCase = (wx: SimWeather, p: ModelParams, base: SimResult, s: Setup): SetupPoint =>
  setupPoint(s, isEntered(p, s) ? base : simulate(wx, setupParams(p, base, s)));
