import assert from "node:assert/strict";
import test from "node:test";
import { buildCadenceOverview, hasCadenceDistribution, type CadenceAnalyticsRide } from "../lib/cadence.ts";

const ride = (overrides: Partial<CadenceAnalyticsRide> = {}): CadenceAnalyticsRide => ({
  id: "ride-1",
  date: "2026-08-01",
  environment: "virtual",
  trainingType: "Zone 2",
  averageCadence: 88,
  cadenceStddev: 4,
  cadenceAcceptablePercent: 92,
  ...overrides,
});

test("cadence availability requires a real per-sample distribution", () => {
  assert.equal(hasCadenceDistribution(ride()), true);
  assert.equal(hasCadenceDistribution(ride({ cadenceAcceptablePercent: null })), false);
  assert.equal(hasCadenceDistribution(ride({ averageCadence: 0 })), false);
});

test("cadence overview includes every ride with streams and separates cohorts", () => {
  const overview = buildCadenceOverview([
    ride(),
    ride({
      id: "ride-2",
      date: "2026-08-02",
      environment: "outdoor",
      trainingType: "Tempo",
      averageCadence: 82,
      cadenceStddev: 8,
      cadenceAcceptablePercent: 70,
    }),
    ride({
      id: "ride-3",
      date: "2026-08-03",
      environment: "virtual",
      trainingType: "Zone 2",
      averageCadence: 90,
      cadenceStddev: 3,
      cadenceAcceptablePercent: 96,
    }),
    ride({ id: "missing", cadenceAcceptablePercent: null }),
  ]);

  assert.equal(overview.available.length, 3);
  assert.deepEqual(overview.recent.map((entry) => entry.id), ["ride-1", "ride-2", "ride-3"]);
  assert.deepEqual(overview.environments.map((entry) => entry.label), ["Virtual / Indoor", "Outdoor"]);
  assert.deepEqual(overview.trainingTypes.map((entry) => entry.label), ["Zone 2", "Tempo"]);

  const virtual = overview.environments[0];
  assert.equal(virtual.rideCount, 2);
  assert.equal(virtual.medianAverageCadence, 89);
  assert.equal(virtual.medianAcceptablePercent, 94);
  assert.equal(virtual.medianCadenceStddev, 3.5);
});

test("cadence recency limit affects only the trend, not cohort evidence", () => {
  const overview = buildCadenceOverview([
    ride({ id: "ride-1", date: "2026-08-01" }),
    ride({ id: "ride-2", date: "2026-08-02" }),
    ride({ id: "ride-3", date: "2026-08-03" }),
  ], 2);

  assert.deepEqual(overview.recent.map((entry) => entry.id), ["ride-2", "ride-3"]);
  assert.equal(overview.environments[0].rideCount, 3);
});
