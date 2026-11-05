import { test } from "node:test";
import assert from "node:assert/strict";
import { circleArea, betzLimitW } from "../../src/model/physics.ts";
import { EXAMPLE_ROTOR_M, exampleCurve, parseCurve, makeCurveFn, checkCurve } from "../../src/model/powerCurve.ts";
import { close } from "../helpers.ts";

test("example curve is plausible: starts at 6 km/h, rated 3.5 kW from 30 km/h, within the Betz limit", () => {
  const f = makeCurveFn(exampleCurve());
  assert.equal(f(5), 0);
  assert.ok(f(6) > 0 && f(10) < f(15) && f(15) < f(20));
  assert.equal(f(30), 3500);
  assert.equal(f(90), 3500);
  assert.equal(f(101), 0);
  assert.ok(checkCurve(exampleCurve(), circleArea(EXAMPLE_ROTOR_M), 1).worstRatio < 0.65);
});

test("parseCurve accepts common separators and rejects junk", () => {
  assert.deepEqual(parseCurve("10, 100\n0 0 # cut-in\n20;\t400"), [
    [0, 0],
    [10, 100],
    [20, 400],
  ]);
  assert.throws(() => parseCurve("10, abc\n20, 1"));
  assert.throws(() => parseCurve("10, 100"));
});

test("Betz limit flags a curve that claims too much for its capture area", () => {
  close(betzLimitW(30, circleArea(0.3048)), 15.4, 0.1); // a 12-inch circle at 30 km/h
  close(betzLimitW(30, 1), 210, 1); // per square metre of frontal area
  const { worstRatio, atKmh } = checkCurve(
    [
      [0, 0],
      [30, 3500],
    ],
    circleArea(0.3048),
    1,
  );
  assert.equal(atKmh, 30);
  close(worstRatio, 228, 1);
});
