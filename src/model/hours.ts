// The hours behind the averages: every hour of the run with the turbines (one recorded run), and
// the record cut into weeks to find the telling ones.
import { f32, u16 } from "./checkedArrays.ts";
import { simulate } from "./simulate.ts";
import type { HourRecord, ModelParams, SimWeather } from "./simulate.ts";

export const HOURS_PER_WEEK = 168;

/** Simulates once more, keeping every hour. */
export function recordHours(wx: SimWeather, p: ModelParams): HourRecord {
  const arr = (): Float32Array => new Float32Array(wx.n);
  const rec: HourRecord = { wind: arr(), pv: arr(), load: arr(), grid: arr(), soc: arr() };
  simulate(wx, p, rec);
  return rec;
}

/** One week of the record: its year, its number within the year (0 first), its hours, and their sums (kWh). */
export interface Week {
  year: number;
  week: number;
  start: number;
  hours: number;
  windKwh: number;
  pvKwh: number;
  loadKwh: number;
  /** Bought from the grid, with the turbines. */
  importKwh: number;
}

function sumWeek(rec: HourRecord, at: Pick<Week, "year" | "week" | "start">, end: number): Week {
  let windKwh = 0,
    pvKwh = 0,
    loadKwh = 0,
    importKwh = 0;
  for (let i = at.start; i < end; i++) {
    windKwh += f32(rec.wind, i);
    pvKwh += f32(rec.pv, i);
    loadKwh += f32(rec.load, i);
    importKwh += Math.max(0, f32(rec.grid, i));
  }
  return { ...at, hours: end - at.start, windKwh, pvKwh, loadKwh, importKwh };
}

/** The record in weeks: each year from its first hour in 168-hour weeks, the last taking the year's leftover day or two. */
export function weeksOf(year: Uint16Array, rec: HourRecord): Week[] {
  const weeks: Week[] = [];
  const n = year.length;
  let i = 0;
  while (i < n) {
    const y = u16(year, i);
    let end = i;
    while (end < n && u16(year, end) === y) end++;
    const count = Math.max(1, Math.floor((end - i) / HOURS_PER_WEEK));
    for (let w = 0; w < count; w++) {
      const start = i + w * HOURS_PER_WEEK;
      weeks.push(sumWeek(rec, { year: y, week: w, start }, w === count - 1 ? end : start + HOURS_PER_WEEK));
    }
    i = end;
  }
  return weeks;
}

/** The weeks worth looking at first: the calmest and windiest for the turbines, and the one that needed most from the grid. */
export interface TellingWeeks {
  calmest: Week;
  windiest: Week;
  hardest: Week;
}

/** The telling weeks among those at least a week long, or null if there are none (by rate, so a year's longer last week doesn't win). */
export function tellingWeeks(weeks: readonly Week[]): TellingWeeks | null {
  const full = weeks.filter((w) => w.hours >= HOURS_PER_WEEK);
  const first = full[0];
  if (!first) return null;
  const most = (f: (w: Week) => number): Week =>
    full.reduce((a, b) => (f(b) / b.hours > f(a) / a.hours ? b : a), first);
  return { calmest: most((w) => -w.windKwh), windiest: most((w) => w.windKwh), hardest: most((w) => w.importKwh) };
}
