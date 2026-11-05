import { test } from "node:test";
import assert from "node:assert/strict";
import { pickStation } from "../../src/wind/stationChoice.ts";
import { stationLabel } from "../../src/data/stations.ts";

test("auto station choice weighs elevation difference against distance", () => {
  const ok = () => true;
  const hilltop = { id: "hill", distanceKm: 17.9, rise: 330 };
  const plain = { id: "plain", distanceKm: 18.1, rise: -25 };
  const far = { id: "far", distanceKm: 45, rise: 0 };
  assert.equal(pickStation([hilltop, plain, far], ok).id, "plain");
  assert.equal(pickStation([hilltop, far], ok).id, "far"); // 17.9 + 33 > 45
  assert.equal(pickStation([{ id: "x", distanceKm: 5, rise: NaN }, plain], ok).id, "x"); // unknown elevation: distance only
  assert.equal(pickStation([hilltop, plain], (s) => s.id !== "plain").id, "hill");
  assert.equal(stationLabel("STAVELY AAFC"), "Stavely AAFC");
});

test("auto station choice prefers the record that covers the period", () => {
  // Three stations in one town; the period is 2006–2025.
  const old = { id: "aut", distanceKm: 5, rise: 53, first: 1994, last: 2012 };
  const climate = { id: "climate", distanceKm: 5.6, rise: 53, first: 2010, last: 2026 };
  const town = { id: "town", distanceKm: 5, rise: 53, first: 2011, last: 2026 };
  const missing = (s) => 20 - (Math.min(s.last, 2025) - Math.max(s.first, 2006) + 1);
  assert.equal(pickStation([old, climate, town], () => true, missing).id, "climate");
  assert.equal(pickStation([old, climate, town], () => true).id, "aut"); // distance and height alone
});
