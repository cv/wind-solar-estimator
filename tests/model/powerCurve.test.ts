import { test } from "node:test";
import assert from "node:assert/strict";
import { circleArea, betzLimitW } from "../../src/model/physics.ts";
import {
  EXAMPLE_ROTOR_M,
  exampleCurve,
  parseCurve,
  makeCurveFn,
  checkCurve,
  movePoint,
  insertPoint,
  removePoint,
} from "../../src/model/powerCurve.ts";
import type { CurvePoint } from "../../src/model/powerCurve.ts";
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

const pts = (...xs: Array<[number, number]>): CurvePoint[] => xs.map(([v, w]) => [kmh(v), watts(w)]);

test("movePoint keeps a dragged point between its neighbours and its output non-negative", () => {
  const curve = pts([0, 0], [10, 100], [20, 400]);
  assert.deepEqual(movePoint(curve, 1, 12.34, 250), pts([0, 0], [12.3, 250], [20, 400]));
  assert.deepEqual(movePoint(curve, 1, 25, -5), pts([0, 0], [19.9, 0], [20, 400]));
  assert.deepEqual(movePoint(curve, 0, -3, 10), pts([0, 10], [10, 100], [20, 400]));
  assert.deepEqual(movePoint(curve, 2, 80, 500), pts([0, 0], [10, 100], [80, 500]));
  // Neighbours closer than the minimum gap: the speed stays put, the output still moves.
  assert.deepEqual(movePoint(pts([5.9, 0], [6, 50], [6.1, 80]), 1, 9, 60), pts([5.9, 0], [6, 60], [6.1, 80]));
});

test("insertPoint adds in speed order and skips a duplicate speed", () => {
  const curve = pts([0, 0], [20, 400]);
  assert.deepEqual(insertPoint(curve, 10.04, 120), pts([0, 0], [10, 120], [20, 400]));
  assert.deepEqual(insertPoint(curve, 20.04, 120), curve);
});

test("removePoint never leaves fewer than two points", () => {
  assert.deepEqual(removePoint(pts([0, 0], [10, 100], [20, 400]), 1), pts([0, 0], [20, 400]));
  assert.deepEqual(removePoint(pts([0, 0], [20, 400]), 1), pts([0, 0], [20, 400]));
});
