import { test } from "node:test";
import assert from "node:assert/strict";
import { HOURS_PER_WEEK, tellingWeeks, weeksOf } from "../../src/model/hours.ts";
import type { HourRecord } from "../../src/model/simulate.ts";

const weekOf = (i: number): number => Math.floor((i < 8760 ? i : i - 8760) / HOURS_PER_WEEK);

/** Two years (8760 and 8784 hours) where wind is the week's number, and the grid is bought in week 3 of the first year. */
function record(): { year: Uint16Array; rec: HourRecord } {
  const n = 8760 + 8784;
  const year = Uint16Array.from({ length: n }, (_, i) => (i < 8760 ? 2019 : 2020));
  const rec: HourRecord = {
    wind: Float32Array.from({ length: n }, (_, i) => Math.min(weekOf(i), 51)),
    pv: new Float32Array(n),
    load: new Float32Array(n).fill(1),
    grid: Float32Array.from({ length: n }, (_, i) => (i < 8760 && weekOf(i) === 3 ? 1 : -0.5)),
    soc: new Float32Array(n),
  };
  return { year, rec };
}

test("weeksOf cuts each year into 52 weeks, the last taking the leftover hours", () => {
  const { year, rec } = record();
  const weeks = weeksOf(year, rec);
  assert.equal(weeks.length, 104);
  const last2019 = weeks[51];
  assert.ok(last2019);
  assert.equal(last2019.hours, 8760 - 51 * HOURS_PER_WEEK);
  assert.equal(weeks[52]?.start, 8760);
  assert.equal(weeks[3]?.importKwh, HOURS_PER_WEEK);
  assert.equal(weeks[4]?.importKwh, 0);
});

test("tellingWeeks finds the calmest, windiest and hardest weeks", () => {
  const { year, rec } = record();
  const t = tellingWeeks(weeksOf(year, rec));
  assert.ok(t);
  assert.equal(t.calmest.week, 0);
  assert.equal(t.windiest.week, 51);
  assert.deepEqual([t.hardest.year, t.hardest.week], [2019, 3]);
});
