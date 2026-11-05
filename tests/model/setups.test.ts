import { test } from "node:test";
import assert from "node:assert/strict";
import { setupGrid, setupParams } from "../../src/model/setups.ts";
import type { ModelParams, SimResult } from "../../src/model/simulate.ts";
import { kmh, metres } from "../../src/model/units.ts";

test("setupGrid covers one to four turbines at the usual heights, plus the entered setup", () => {
  const grid = setupGrid({ nTurbines: 6, hubHeight: metres(14) });
  const counts = [...new Set(grid.map((s) => s.nTurbines))];
  const heights = [...new Set(grid.map((s) => s.hubHeight))];
  assert.deepEqual(counts, [1, 2, 3, 4, 6]);
  assert.deepEqual(heights, [8, 12, 14, 16, 20, 25, 30]);
  assert.equal(grid.length, counts.length * heights.length);
  assert.equal(setupGrid({ nTurbines: 2, hubHeight: metres(16) }).length, 4 * 6);
});

test("setupParams keeps the entered setup's wind correction instead of re-calibrating at each height", () => {
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- only the fields setupParams reads
  const p = { nTurbines: 1, hubHeight: metres(16), siteMeanKmh: kmh(22), windScale: 1 } as ModelParams;
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- only the field setupParams reads
  const base = { scale: 1.37 } as SimResult;
  const q = setupParams(p, base, { nTurbines: 3, hubHeight: 25 });
  assert.equal(q.nTurbines, 3);
  assert.equal(q.hubHeight, 25);
  assert.equal(q.siteMeanKmh, 0);
  assert.equal(q.windScale, 1.37);
});
