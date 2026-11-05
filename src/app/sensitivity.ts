// Works out the wind sensitivity once the report is shown: after a pause, one wind case per task,
// so typing and dragging stay quick and a newer analysis simply abandons the old one.
import { state } from "./state.ts";
import type { Analysis } from "./state.ts";
import { WIND_FACTORS, sensitivityPoint, windCase } from "../model/sensitivity.ts";
import type { SensitivityPoint } from "../model/sensitivity.ts";
import { renderSensitivity } from "../report/sensitivity.ts";

/** Pause after the last change before the extra runs start. */
const PAUSE_MS = 300;

let pending: ReturnType<typeof setTimeout> | undefined;

/** Starts over for a newly rendered analysis; its sensitivity is set and rendered when every case is done. */
export function scheduleSensitivity(a: Analysis): void {
  clearTimeout(pending);
  const pts: SensitivityPoint[] = [];
  let k = 0;
  const step = (): void => {
    if (state.analysis !== a) return; // superseded
    const f = WIND_FACTORS[k];
    if (f === undefined) {
      a.sensitivity = pts;
      renderSensitivity(a);
      return;
    }
    pts.push(f === 1 ? sensitivityPoint(1, a.result) : windCase(a.wx, a.params, f));
    k++;
    pending = setTimeout(step, 0);
  };
  pending = setTimeout(step, PAUSE_MS);
}
