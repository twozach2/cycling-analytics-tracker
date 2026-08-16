import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateHeartRateZones,
  deriveHeartRateZones,
  describeHeartRateDistribution,
  heartRateCueForMode,
  heartRateZoneRange,
} from "../lib/heart-rate";

test("derives five LTHR zones from every valid recorded sample", () => {
  const result = deriveHeartRateZones([120, 130, 140, 145, 150, 155, null, 0], 150);
  assert.deepEqual(result, {
    thresholdBpm: 150,
    sampleCount: 6,
    zone1Percent: 16.7,
    zone2Percent: 16.7,
    zone3Percent: 16.7,
    zone4Percent: 16.7,
    zone5Percent: 33.3,
  });
});

test("withholds zones when LTHR is absent or implausible", () => {
  assert.equal(deriveHeartRateZones([120, 130], null), null);
  assert.equal(deriveHeartRateZones([120, 130], 250), null);
  assert.equal(deriveHeartRateZones([], 150), null);
});

test("uses explicit, non-overlapping boundary labels", () => {
  assert.equal(heartRateZoneRange(150, 0), "below 122 bpm");
  assert.equal(heartRateZoneRange(150, 1), "122–134 bpm");
  assert.equal(heartRateZoneRange(150, 4), "150+ bpm");
});

test("weekly aggregation is sample weighted", () => {
  const result = aggregateHeartRateZones([
    { thresholdBpm: 150, sampleCount: 100, zone1Percent: 100, zone2Percent: 0, zone3Percent: 0, zone4Percent: 0, zone5Percent: 0 },
    { thresholdBpm: 150, sampleCount: 300, zone1Percent: 0, zone2Percent: 100, zone3Percent: 0, zone4Percent: 0, zone5Percent: 0 },
  ]);
  assert.equal(result?.sampleCount, 400);
  assert.equal(result?.zone1Percent, 25);
  assert.equal(result?.zone2Percent, 75);
});

test("classification context remains descriptive and coach cues use LTHR", () => {
  const context = describeHeartRateDistribution("Zone 2", {
    thresholdBpm: 150,
    sampleCount: 100,
    zone1Percent: 20,
    zone2Percent: 30,
    zone3Percent: 30,
    zone4Percent: 15,
    zone5Percent: 5,
  });
  assert.equal(context.title, "A varied aerobic ride");
  assert.doesNotMatch(`${context.title} ${context.detail}`, /pass|fail|mismatch/i);
  assert.equal(heartRateCueForMode("endurance", 150), "Mostly Z2 · 122–134 bpm · brief Z3 hills are fine");
  assert.equal(heartRateCueForMode("endurance", null), null);
});
