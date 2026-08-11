import assert from "node:assert/strict";
import test from "node:test";
import { assessRideDataQuality } from "../lib/data-quality.ts";
import { countActivitySampleRecords, countStravaStreamRecords } from "../lib/stream-counts.ts";

const completeRide = {
  source: "strava_export",
  sampleCount: 3600,
  availableStreams: ["time", "watts", "heartrate", "cadence", "distance", "altitude"],
  streamSampleCounts: { time: 3600, watts: 3598, heartrate: 3550, cadence: 3400, distance: 3600, altitude: 3599 },
  movingTimeSeconds: 3600,
  averagePowerWatts: 130,
  averageHeartRateBpm: 140,
  averageCadenceRpm: 87,
  distanceMeters: 25000,
  elevationGainMeters: 200,
  normalizedPowerSource: "recorded",
  intensityIsEstimated: false,
  trainingLoadIsEstimated: false,
  storedDataQuality: "high",
  metricsAlgorithmVersion: "phase3.3",
} as const;

test("recognizes detailed stream evidence without inventing a coverage percentage", () => {
  const quality = assessRideDataQuality(completeRide);
  assert.equal(quality.level, "high");
  assert.equal(quality.streamMode, "detailed");
  assert.equal(quality.recommendationEligible, true);
  assert.equal(quality.signals.find((signal) => signal.id === "power")?.status, "recorded_stream");
  assert.equal(quality.signals.find((signal) => signal.id === "power")?.recordCount, 3598);
  assert.equal(quality.signals.find((signal) => signal.id === "heart_rate")?.recordCount, 3550);
  assert.equal("coveragePercent" in quality, false);
});

test("distinguishes summary-only evidence from missing evidence", () => {
  const quality = assessRideDataQuality({
    ...completeRide,
    sampleCount: null,
    availableStreams: [],
    streamSampleCounts: {},
    averageCadenceRpm: null,
    normalizedPowerSource: "unavailable",
    intensityIsEstimated: true,
    trainingLoadIsEstimated: true,
    storedDataQuality: "medium",
  });
  assert.equal(quality.level, "moderate");
  assert.equal(quality.streamMode, "summary_only");
  assert.equal(quality.signals.find((signal) => signal.id === "power")?.status, "recorded_summary");
  assert.equal(quality.signals.find((signal) => signal.id === "cadence")?.status, "unavailable");
  assert.equal(quality.intensityStatus, "estimated");
});

test("marks power-free rides as ineligible for analytical recommendations", () => {
  const quality = assessRideDataQuality({
    source: "gpx",
    sampleCount: 2000,
    availableStreams: ["time", "distance", "altitude"],
    movingTimeSeconds: 2000,
    averagePowerWatts: null,
    averageHeartRateBpm: null,
    distanceMeters: 10000,
  });
  assert.equal(quality.level, "low");
  assert.equal(quality.recommendationEligible, false);
  assert.ok(quality.limitations.some((reason) => reason.includes("Power evidence")));
});
test("counts records independently instead of copying the timeline length", () => {
  assert.deepEqual(countStravaStreamRecords({
    time: { data: [0, 1, 2] },
    watts: { data: [120, 125] },
  }), { time: 3, watts: 2 });

  assert.deepEqual(countActivitySampleRecords([
    { time: 1, power: 120, heartRate: 130 },
    { time: 2, power: null, heartRate: 132 },
    { time: 3, power: 125, heartRate: null },
  ]), { time: 3, heartrate: 2, watts: 2 });
});
