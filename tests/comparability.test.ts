import assert from "node:assert/strict";
import test from "node:test";
import { buildComparableRouteCohorts, buildZone2BenchmarkCohort, evaluateZone2Benchmark, type ComparableRouteRide, type Zone2BenchmarkRide } from "../lib/comparability.ts";

const routeRide = (overrides: Partial<ComparableRouteRide> = {}): ComparableRouteRide => ({
  id: "route-1",
  route: "Watopia - Tempus Fugit",
  environment: "virtual",
  trainingType: "Zone 2",
  context: "ordinary",
  distanceMiles: 20,
  averagePower: 115,
  averageHeartRate: 130,
  powerHeartRateRatio: 0.885,
  classificationConfidence: "high",
  ...overrides,
});

const benchmarkRide = (overrides: Partial<Zone2BenchmarkRide> = {}): Zone2BenchmarkRide => ({
  id: "benchmark-1",
  date: "2026-08-01",
  trainingType: "Zone 2",
  context: "benchmark",
  environment: "virtual",
  movingTimeSeconds: 60 * 60,
  averagePower: 110,
  averageHeartRate: 130,
  averageCadence: 88,
  intensityFactor: 0.67,
  variabilityIndex: 1.03,
  stoppedPercent: 0.5,
  powerHeartRateRatio: 0.846,
  decouplingEligible: true,
  classificationConfidence: "high",
  ...overrides,
});

test("route cohorts require matching route, environment, stimulus, context, distance, power, and heart rate", () => {
  const result = buildComparableRouteCohorts([
    routeRide(),
    routeRide({ id: "route-2", distanceMiles: 20.2 }),
    routeRide({ id: "tempo", trainingType: "Tempo" }),
    routeRide({ id: "group", context: "group_ride" }),
    routeRide({ id: "long", distanceMiles: 22 }),
    routeRide({ id: "no-hr", averageHeartRate: 0, powerHeartRateRatio: 0 }),
  ]);

  assert.equal(result.cohorts.length, 1);
  assert.deepEqual(result.cohorts[0].rides.map((ride) => ride.id), ["route-1", "route-2"]);
  assert.equal(result.cohorts[0].confidence, "high");
  assert.ok(result.excluded.some((entry) => entry.rideId === "tempo" && /No second ride/.test(entry.reason)));
  assert.ok(result.excluded.some((entry) => entry.rideId === "group" && /not treated as repeatable/.test(entry.reason)));
  assert.ok(result.excluded.some((entry) => entry.rideId === "long" && /within 8%/.test(entry.reason)));
  assert.ok(result.excluded.some((entry) => entry.rideId === "no-hr" && /power and heart rate/.test(entry.reason)));
});

test("outdoor route comparisons are capped at moderate confidence", () => {
  const result = buildComparableRouteCohorts([
    routeRide({ id: "outside-1", environment: "outdoor" }),
    routeRide({ id: "outside-2", environment: "outdoor", distanceMiles: 20.1 }),
  ]);
  assert.equal(result.cohorts[0].confidence, "moderate");
  assert.match(result.cohorts[0].reasons.join(" "), /wind.*drafting/i);
});

test("controlled Zone 2 benchmark eligibility enforces the complete protocol", () => {
  const eligible = evaluateZone2Benchmark(benchmarkRide());
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.confidence, "high");
  assert.match(eligible.reasons.join(" "), /IF 0\.67.*VI 1\.03/);

  const failures = evaluateZone2Benchmark(benchmarkRide({
    movingTimeSeconds: 45 * 60,
    intensityFactor: 0.8,
    variabilityIndex: 1.08,
    stoppedPercent: 4,
    averageCadence: 75,
    decouplingEligible: false,
  }));
  assert.equal(failures.eligible, false);
  assert.ok(failures.failures.some((reason) => /50 and 70 minutes/.test(reason)));
  assert.ok(failures.failures.some((reason) => /0\.60 and 0\.75/.test(reason)));
  assert.ok(failures.failures.some((reason) => /1\.05/.test(reason)));
  assert.ok(failures.failures.some((reason) => /2%/.test(reason)));
  assert.ok(failures.failures.some((reason) => /80 and 95 rpm/.test(reason)));
  assert.ok(failures.failures.some((reason) => /paired power and heart-rate/.test(reason)));
});

test("benchmark trends require three rides in one environment and a narrow IF cohort", () => {
  const cohort = buildZone2BenchmarkCohort([
    benchmarkRide({ id: "b1", date: "2026-06-01", intensityFactor: 0.66 }),
    benchmarkRide({ id: "b2", date: "2026-07-01", intensityFactor: 0.67 }),
    benchmarkRide({ id: "b3", date: "2026-08-01", intensityFactor: 0.68 }),
    benchmarkRide({ id: "outdoor", date: "2026-08-02", environment: "outdoor", intensityFactor: 0.67 }),
    benchmarkRide({ id: "hard", date: "2026-08-03", intensityFactor: 0.74 }),
  ]);

  assert.equal(cohort.trendReady, true);
  assert.equal(cohort.confidence, "high");
  assert.equal(cohort.environment, "virtual");
  assert.deepEqual(cohort.rides.map((ride) => ride.id), ["b3", "b2", "b1"]);
  assert.ok(cohort.excluded.some((entry) => entry.rideId === "outdoor"));
  assert.ok(cohort.excluded.some((entry) => entry.rideId === "hard"));
});

test("two otherwise eligible benchmarks establish observations but not a trend", () => {
  const cohort = buildZone2BenchmarkCohort([
    benchmarkRide({ id: "b1", date: "2026-07-01" }),
    benchmarkRide({ id: "b2", date: "2026-08-01", intensityFactor: 0.68 }),
  ]);
  assert.equal(cohort.rides.length, 2);
  assert.equal(cohort.trendReady, false);
  assert.equal(cohort.confidence, "low");
  assert.match(cohort.reasons.join(" "), /withheld until 3/);
});
