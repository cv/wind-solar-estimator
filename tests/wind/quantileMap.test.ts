import { test } from "node:test";
import { fitQuantileMap, applyQuantileMap } from "../../src/wind/quantileMap.ts";
import { close } from "../helpers.ts";

const g = (v: number): number => 0.05 * v * v + v; // a gustier, skewed distribution

test("quantile mapping reproduces a monotone transform, and scales beyond the fitted range", () => {
  const x = Array.from({ length: 5000 }, (_, i) => (i % 500) / 20); // 0..25
  const m = fitQuantileMap(
    x,
    x.map((v) => g(v)),
  );
  for (const v of [1, 5, 10, 20]) close(applyQuantileMap(m, v), g(v), 0.1 * g(v) + 0.2, `at ${v}`);
  close(applyQuantileMap(m, 50) / applyQuantileMap(m, 25), 2, 0.1, "proportional above the range");
});
