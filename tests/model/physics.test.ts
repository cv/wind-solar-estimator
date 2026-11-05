import { test } from "node:test";
import assert from "node:assert/strict";
import { airDensity } from "../../src/model/physics.ts";
import { close } from "../helpers.ts";

test("air density falls with altitude and rises with cold", () => {
  close(airDensity(0, 15), 1.225, 0.001);
  assert.ok(airDensity(1000, 15) < 1.13);
  assert.ok(airDensity(0, -30) > 1.4);
});
