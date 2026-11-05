// Shared test helpers.

import assert from "node:assert/strict";

export const close = (a: number, b: number, tol: number, msg?: string): void =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);
