import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStationCsv, stationLabel } from "../../src/data/stations.ts";
import { distanceKm, direction } from "../../src/data/geo.ts";
import { close } from "../helpers.ts";

test("station CSV parsing skips hours without a wind reading", () => {
  const csv =
    "x,y,UTC_DATE,WIND_SPEED\r\n-113.6,50.0,2024-01-01T07:00:00,8\r\n-113.6,50.0,2024-01-01T08:00:00,\r\n-113.6,50.0,2024-01-01T09:00:00,17\r\n";
  const { hours, wind } = parseStationCsv(csv);
  assert.deepEqual([...wind], [8, 17]);
  assert.equal(hours[0], Date.UTC(2024, 0, 1, 7) / 3.6e6);
  assert.equal(hours[1] - hours[0], 2);
});

test("station names, distance and direction read naturally", () => {
  assert.equal(stationLabel("PINCHER CREEK A"), "Pincher Creek A");
  assert.equal(stationLabel("LETHBRIDGE CDA"), "Lethbridge CDA");
  assert.equal(stationLabel("PINCHER CREEK (AUT)"), "Pincher Creek (AUT)");
  close(distanceKm(50.1668, -113.6353, 50.0036, -113.6386), 18.1, 0.3); // Stavely to Claresholm
  assert.equal(direction(50.1668, -113.6353, 50.0036, -113.6386), "S");
});
