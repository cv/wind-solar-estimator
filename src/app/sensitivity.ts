// Works out the report's comparisons once it is shown (the wind sensitivity, then other setups):
// after a pause, one run per task, so typing and dragging stay quick and a newer analysis simply
// abandons the old one.
import { state } from "./state.ts";
import type { Analysis } from "./state.ts";
import { WIND_FACTORS, sensitivityPoint, windCase } from "../model/sensitivity.ts";
import type { SensitivityPoint } from "../model/sensitivity.ts";
import { setupCase, setupGrid } from "../model/setups.ts";
import type { SetupPoint } from "../model/setups.ts";
import { renderSensitivity } from "../report/sensitivity.ts";
import { renderSetups } from "../report/setups.ts";

/** Pause after the last change before the extra runs start. */
const PAUSE_MS = 300;

let pending: ReturnType<typeof setTimeout> | undefined;

/** Starts over for a newly rendered analysis; each comparison is set and rendered when it is complete. */
export function scheduleSensitivity(a: Analysis): void {
  clearTimeout(pending);
  const wind: SensitivityPoint[] = [];
  const setups: SetupPoint[] = [];
  const jobs: Array<() => void> = [
    ...WIND_FACTORS.map((f) => (): void => {
      wind.push(f === 1 ? sensitivityPoint(1, a.result) : windCase(a.wx, a.params, f));
    }),
    (): void => {
      a.sensitivity = wind;
      renderSensitivity(a);
    },
    ...setupGrid(a.params).map((s) => (): void => {
      setups.push(setupCase(a.wx, a.params, a.result, s));
    }),
    (): void => {
      a.setups = setups;
      renderSetups(a);
    },
  ];
  let k = 0;
  const step = (): void => {
    const job = jobs[k];
    if (state.analysis !== a || job === undefined) return; // superseded, or done
    job();
    k++;
    pending = setTimeout(step, 0);
  };
  pending = setTimeout(step, PAUSE_MS);
}
