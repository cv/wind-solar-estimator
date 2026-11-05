import { test } from "node:test";
import assert from "node:assert/strict";
import { circleArea, betzLimitW } from "../../src/model/physics.ts";
import { EXAMPLE_ROTOR_M, exampleCurve, parseCurve, makeCurveFn, checkCurve } from "../../src/model/powerCurve.ts";
import { kmh, metres, squareMetres, watts } from "../../src/model/units.ts";
import { close } from "../helpers.ts";

test("example curve is plausible: starts at 6 km/h, rated 3.5 kW from 30 km/h, within the Betz limit", () => {
  const f = makeCurveFn(exampleCurve());
  assert.equal(f(kmh(5)), 0);
  assert.ok(f(kmh(6)) > 0 && f(kmh(10)) < f(kmh(15)) && f(kmh(15)) < f(kmh(20)));
  assert.equal(f(kmh(30)), 3500);
  assert.equal(f(kmh(90)), 3500);
  assert.equal(f(kmh(101)), 0);
  const check = checkCurve(exampleCurve(), circleArea(EXAMPLE_ROTOR_M), 1);
  assert.equal(check.exceeds, false);
  assert.ok(check.worstRatio < 0.65);
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
  close(betzLimitW(kmh(30), circleArea(metres(0.3048))), 15.4, 0.1); // a 12-inch circle at 30 km/h
  close(betzLimitW(kmh(30), squareMetres(1)), 210, 1); // per square metre of frontal area
  const check = checkCurve(
    [
      [kmh(0), watts(0)],
      [kmh(30), watts(3500)],
    ],
    circleArea(metres(0.3048)),
    1,
  );
  assert.ok(check.exceeds);
  assert.equal(check.atKmh, 30);
  close(check.worstRatio, 228, 1);
});
