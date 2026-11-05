// The unit brands: identity at runtime, and mixing units fails to compile (npm run typecheck covers tests/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { battery } from "../../src/model/battery.ts";
import { airDensity, betzLimitW, circleArea } from "../../src/model/physics.ts";
import { checkCurve, makeCurveFn } from "../../src/model/powerCurve.ts";
import type { CurveCheck } from "../../src/model/powerCurve.ts";
import type { ModelParams } from "../../src/model/simulate.ts";
import {
  celsius,
  fraction,
  kgPerM3,
  kmh,
  kw,
  kwh,
  metres,
  percent,
  squareMetres,
  watts,
} from "../../src/model/units.ts";
import type { Kmh } from "../../src/model/units.ts";
import type { Homogeneity } from "../../src/wind/homogeneity.ts";

const asSpeed = (v: Kmh): Kmh => v;

test("unit constructors are the identity at runtime", () => {
  for (const make of [kmh, watts, kw, kwh, metres, squareMetres, kgPerM3, celsius, fraction, percent]) {
    for (const x of [0, 1.5, -3, 1e9]) assert.equal(make(x), x);
  }
});

test("mixing units fails to compile", () => {
  const speed = kmh(30);
  const power = watts(100);
  const area = squareMetres(1);
  const curve = makeCurveFn([
    [kmh(0), watts(0)],
    [kmh(10), watts(100)],
  ]);
  // @ts-expect-error -- Watts where Kmh is expected
  betzLimitW(power, area);
  // @ts-expect-error -- a plain number has no unit
  betzLimitW(30, area);
  // @ts-expect-error -- a plain number is not an area
  betzLimitW(speed, 1);
  // @ts-expect-error -- a speed is not an area
  betzLimitW(speed, speed);
  // @ts-expect-error -- a power curve takes a speed, not a power
  curve(power);
  // @ts-expect-error -- and returns a power, not a speed
  asSpeed(curve(speed));
  // @ts-expect-error -- elevation and temperature swapped
  airDensity(celsius(15), metres(0));
  // @ts-expect-error -- a diameter, not an area
  circleArea(area);
  // @ts-expect-error -- minimum charge is a fraction, not a percentage
  battery(kwh(10), percent(20), fraction(0.9), kw(5));
  // @ts-expect-error -- capacity is energy, not power
  battery(kw(10), fraction(0.2), fraction(0.9), kw(5));

  // @ts-expect-error -- a model parameter needs its unit
  const height: ModelParams["hubHeight"] = 10;
  // Brands are numbers, so formatting and arithmetic take them as they are.
  const plain: number = betzLimitW(speed, area) + power;
  assert.ok(plain > 0 && height === 10);
});

test("the library's results are discriminated, so their details need the right case", () => {
  const check: CurveCheck = checkCurve(
    [
      [kmh(0), watts(0)],
      [kmh(30), watts(3500)],
    ],
    squareMetres(0.1),
    1,
  );
  // @ts-expect-error -- atKmh only exists once the curve is known to exceed the limit
  assert.equal(check.atKmh, 30);
  if (check.exceeds) assert.equal(check.atKmh satisfies Kmh, 30);

  const h = { years: 5, ratios: [], trend: null, step: null, issue: null } satisfies Homogeneity;
  // @ts-expect-error -- a step issue needs its step
  const broken: Homogeneity = { ...h, issue: "step" };
  assert.equal(broken.issue, "step");
});
