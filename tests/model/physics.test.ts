import { test } from "node:test";
import assert from "node:assert/strict";
import { airDensity } from "../../src/model/physics.ts";
import { celsius, metres } from "../../src/model/units.ts";
import { close } from "../helpers.ts";

test("air density falls with altitude and rises with cold", () => {
  close(airDensity(metres(0), celsius(15)), 1.225, 0.001);
  assert.ok(airDensity(metres(1000), celsius(15)) < 1.13);
  assert.ok(airDensity(metres(0), celsius(-30)) > 1.4);
});
