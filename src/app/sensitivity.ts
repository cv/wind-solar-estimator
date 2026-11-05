// Works out the report's comparisons once it is shown (the wind sensitivity, every hour, other
// setups, then any station comparison): after a pause, one run per task, so typing and dragging stay
// quick and a newer analysis simply abandons the old one.
import { state } from "./state.ts";
import type { Analysis } from "./state.ts";
import { JOBS_PAUSE_MS, runJobs } from "./jobs.ts";
import { scheduleWindCases } from "./stationCompare.ts";
import { WIND_FACTORS, sensitivityPoint, windCase } from "../model/sensitivity.ts";
import type { SensitivityPoint } from "../model/sensitivity.ts";
import { setupCase, setupGrid } from "../model/setups.ts";
import type { SetupPoint } from "../model/setups.ts";
import { renderSensitivity } from "../report/sensitivity.ts";
import { renderSetups } from "../report/setups.ts";
import { renderHours } from "../report/hours.ts";
import { recordHours, weeksOf } from "../model/hours.ts";

let cancel = (): void => {
  // Nothing scheduled yet.
};

/** Starts over for a newly rendered analysis; each comparison is set and rendered when it is complete. */
export function scheduleSensitivity(a: Analysis): void {
  cancel();
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
    (): void => {
      const rec = recordHours(a.wx, a.params);
      a.hours = { rec, weeks: weeksOf(a.wx.year, rec) };
      renderHours(a);
    },
    ...setupGrid(a.params).map((s) => (): void => {
      setups.push(setupCase(a.wx, a.params, a.result, s));
    }),
    (): void => {
      a.setups = setups;
      renderSetups(a);
      scheduleWindCases(a, 0);
    },
  ];
  cancel = runJobs(jobs, () => state.analysis === a, JOBS_PAUSE_MS);
}
