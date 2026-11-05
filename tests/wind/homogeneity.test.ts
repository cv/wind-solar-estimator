import { test } from "node:test";
import assert from "node:assert/strict";
import { checkHomogeneity, type YearlyMeans } from "../../src/wind/homogeneity.ts";
import { close } from "../helpers.ts";

/** Annual means for 2006–2025: the model wobbles from year to year, the station follows it times ratio(year). */
function yearlyRecord(ratio: (year: number) => number, noise = 0.03): YearlyMeans[] {
  const out: YearlyMeans[] = [];
  for (let y = 2006; y <= 2025; y++) {
    const model = 9 + Math.sin(y * 1.7); // windy and calm years
    const wobble = 1 + noise * Math.sin(y * 2.3 + 1); // year-to-year scatter in the ratio
    out.push({ year: y, coverage: 0.99, model, station: model * ratio(y) * wobble });
  }
  return out;
}

test("checkHomogeneity leaves a steady record alone, even when it differs from the model", () => {
  const h = checkHomogeneity(yearlyRecord(() => 1.35));
  assert.equal(h.issue, null);
  assert.equal(h.years, 20);
});

test("checkHomogeneity finds a step (an instrument moved or replaced)", () => {
  const h = checkHomogeneity(yearlyRecord((y) => (y < 2008 ? 0.85 : 1.4)));
  assert.equal(h.issue, "step");
  assert.equal(h.step.year, 2008);
  close(h.step.change, 0.65, 0.05);
});

test("checkHomogeneity finds a steady drift (trees growing around the mast)", () => {
  const h = checkHomogeneity(yearlyRecord((y) => 1.4 - 0.02 * (y - 2006)));
  assert.equal(h.issue, "trend");
  close(h.trend.change, -0.27, 0.05);
});

test("checkHomogeneity ignores small changes, short records and thin years", () => {
  assert.equal(checkHomogeneity(yearlyRecord((y) => (y < 2016 ? 1.1 : 1.0), 0.01)).issue, null); // 9% step
  assert.equal(checkHomogeneity(yearlyRecord((y) => (y < 2008 ? 0.85 : 1.4)).slice(0, 4)).issue, null);
  const thin = yearlyRecord((y) => (y < 2008 ? 0.85 : 1.4)).map((r) => (r.year < 2008 ? { ...r, coverage: 0.2 } : r));
  assert.equal(checkHomogeneity(thin).issue, null);
});
