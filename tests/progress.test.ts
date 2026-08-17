import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthlyProgress, buildProgressSummary, describeProgressSelection, filterProgressRides, type ProgressRide } from "../lib/progress.ts";

function ride(overrides: Partial<ProgressRide> = {}): ProgressRide {
  return {
    id: "ride-1",
    name: "Endurance ride",
    date: "2026-08-01T12:00:00Z",
    environment: "virtual",
    trainingType: "Zone 2",
    distanceMiles: 20,
    movingTimeSeconds: 3600,
    elevationFeet: 500,
    trainingLoad: 40,
    averagePower: 120,
    normalizedPower: 125,
    ftpAtRideWatts: 165,
    averageHeartRate: 135,
    averageCadence: 85,
    powerHeartRateRatio: 120 / 135,
    ...overrides,
  };
}

test("progress filters use the complete chronological selection", () => {
  const rides = [
    ride({ id: "new", date: "2026-08-10T12:00:00Z" }),
    ride({ id: "old", date: "2025-01-01T12:00:00Z" }),
    ride({ id: "outdoor", date: "2026-07-01T12:00:00Z", environment: "outdoor" }),
  ];
  const all = filterProgressRides(rides, { range: "all", environment: "all", trainingType: "all" }, new Date("2026-08-16T12:00:00Z"));
  assert.deepEqual(all.map((entry) => entry.id), ["old", "outdoor", "new"]);
  const recentVirtual = filterProgressRides(rides, { range: "90d", environment: "virtual", trainingType: "Zone 2" }, new Date("2026-08-16T12:00:00Z"));
  assert.deepEqual(recentVirtual.map((entry) => entry.id), ["new"]);
});

test("progress summary totals every selected ride without inventing missing values", () => {
  const summary = buildProgressSummary([
    ride(),
    ride({ id: "ride-2", date: "2026-08-02T12:00:00Z", movingTimeSeconds: 1800, distanceMiles: 8, elevationFeet: 100, trainingLoad: 20 }),
  ]);
  assert.equal(summary.rideCount, 2);
  assert.equal(summary.movingTimeSeconds, 5400);
  assert.equal(summary.distanceMiles, 28);
  assert.equal(summary.trainingLoad, 60);
});

test("monthly progress retains empty months between recorded rides", () => {
  const months = buildMonthlyProgress([
    ride({ date: "2026-01-15T12:00:00Z" }),
    ride({ id: "ride-2", date: "2026-03-15T12:00:00Z", movingTimeSeconds: 7200 }),
  ]);
  assert.deepEqual(months.map((month) => month.key), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(months[1].rideCount, 0);
  assert.equal(months[2].movingTimeSeconds, 7200);
});

test("progress labels mixed selections without making a fitness claim", () => {
  const focused = describeProgressSelection([ride(), ride({ id: "ride-2" })]);
  assert.equal(focused.focused, true);
  const mixed = describeProgressSelection([ride(), ride({ id: "ride-2", trainingType: "Tempo" })]);
  assert.equal(mixed.focused, false);
  assert.match(mixed.detail, /before interpreting a change as fitness progress/i);
});
