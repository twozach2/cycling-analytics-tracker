import assert from "node:assert/strict";
import test from "node:test";
import { deriveRideMetrics, recommendRecovery } from "../lib/metrics.ts";

test("uses normalized power for intensity and load when available", () => {
  const metrics = deriveRideMetrics({
    movingTimeSeconds: 5400,
    averagePowerWatts: 130,
    normalizedPowerWatts: 138,
    averageHeartRateBpm: 143,
    ftpWatts: 165,
  });

  assert.equal(metrics.powerHeartRateRatio, 0.909);
  assert.equal(metrics.intensityFactor, 0.836);
  assert.equal(metrics.trainingLoad, 104.8);
  assert.equal(metrics.trainingLoadIsEstimated, false);
});

test("labels average-power intensity as estimated", () => {
  const metrics = deriveRideMetrics({
    movingTimeSeconds: 3600,
    averagePowerWatts: 110,
    normalizedPowerWatts: null,
    averageHeartRateBpm: 134,
    ftpWatts: 165,
  });

  assert.equal(metrics.intensityFactor, 0.667);
  assert.equal(metrics.intensityIsEstimated, true);
  assert.equal(metrics.trainingLoadIsEstimated, true);
});

test("pain overrides the numerical readiness estimate", () => {
  const metrics = deriveRideMetrics({
    movingTimeSeconds: 1800,
    averagePowerWatts: 80,
    normalizedPowerWatts: 82,
    averageHeartRateBpm: 110,
    ftpWatts: 165,
  });
  const recovery = recommendRecovery(metrics, 1800, 20, { kneePain: 3 });

  assert.equal(recovery.status, "pain flag");
  assert.match(recovery.nextSession, /No hard riding/);
});

test("adds explainable adjustments for accumulated load and heavy legs", () => {
  const metrics = deriveRideMetrics({
    movingTimeSeconds: 5058,
    averagePowerWatts: 130,
    normalizedPowerWatts: 138,
    averageHeartRateBpm: 143,
    ftpWatts: 165,
  });
  const recovery = recommendRecovery(metrics, 5058, 164, {
    sleepQuality: 4,
    legFreshness: "heavy",
    kneePain: 0,
  });

  assert.equal(recovery.status, "moderate fatigue");
  assert.ok(recovery.reasons.some((reason) => reason.includes("72-hour load")));
  assert.ok(recovery.reasons.some((reason) => reason.includes("heavy")));
});
