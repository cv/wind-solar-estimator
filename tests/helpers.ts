// Shared test helpers.

import assert from "node:assert/strict";

export const close = (a, b, tol, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} ± ${tol}, got ${a}`);
