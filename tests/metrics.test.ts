import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadiness, deriveRideMetrics, elapsedHoursSince, evaluateDecouplingEligibility, recommendRecovery } from "../lib/metrics.ts";

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

test("a localized pain concern overrides the numerical recovery estimate", () => {
  const metrics = deriveRideMetrics({
    movingTimeSeconds: 1800,
    averagePowerWatts: 80,
    normalizedPowerWatts: 82,
    averageHeartRateBpm: 110,
    ftpWatts: 165,
  });
  const recovery = recommendRecovery(metrics, 1800, 20, { bodyCondition: "pain_concern", painLocation: "knee", painSeverity: 3 });

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
    bodyCondition: "normal",
  });

  assert.equal(recovery.status, "moderate fatigue");
  assert.ok(recovery.reasons.some((reason) => reason.includes("72-hour load")));
  assert.ok(recovery.reasons.some((reason) => reason.includes("heavy")));
});

test("readiness combines objective load and the recovery questionnaire", () => {
  const readiness = calculateReadiness({
    hoursSinceLastHardRide: 48,
    acuteChronicRatio: 1.05,
    subjective: { sleepQuality: 5, legFreshness: "fresh", bodyCondition: "normal", motivation: 5 },
  });

  assert.equal(readiness.score, 100);
  assert.equal(readiness.label, "Ready for hard work");
});

test("readiness recovery time advances against the current clock instead of the latest ride", () => {
  const hardRide = "2026-08-07T12:00:00.000Z";
  assert.equal(elapsedHoursSince(hardRide, Date.parse("2026-08-09T12:00:00.000Z")), 48);
  assert.equal(elapsedHoursSince(hardRide, Date.parse("2026-08-07T06:00:00.000Z")), 0);
  assert.equal(elapsedHoursSince(null, Date.parse("2026-08-09T12:00:00.000Z")), 72);
});

test("a substantial pain concern caps readiness even when every other signal is strong", () => {
  const readiness = calculateReadiness({
    hoursSinceLastHardRide: 72,
    acuteChronicRatio: 0.9,
    subjective: { sleepQuality: 5, legFreshness: "fresh", bodyCondition: "pain_concern", painSeverity: 5, motivation: 5 },
  });

  assert.equal(readiness.score, 39);
  assert.equal(readiness.label, "Rest / recovery recommended");
});

test("ordinary soreness affects readiness without acting as an injury override", () => {
  const mild = calculateReadiness({
    hoursSinceLastHardRide: 72,
    acuteChronicRatio: 0.9,
    subjective: { sleepQuality: 5, legFreshness: "fresh", bodyCondition: "mild_soreness", motivation: 5 },
  });
  const painConcern = calculateReadiness({
    hoursSinceLastHardRide: 72,
    acuteChronicRatio: 0.9,
    subjective: { sleepQuality: 5, legFreshness: "fresh", bodyCondition: "pain_concern", painSeverity: 3, motivation: 5 },
  });

  assert.ok(mild.score > painConcern.score);
  assert.equal(painConcern.score, 54);
  assert.equal(painConcern.label, "Easy ride preferred");
});

test("decoupling eligibility rejects short, variable, stopped, and warm-up-dominated rides", () => {
  const steady = {
    movingTimeSeconds: 3600,
    variabilityIndex: 1.04,
    stoppedPercent: 1.5,
    pairedSampleCount: 3500,
    pairedCoveragePercent: 97,
    aerobicDecouplingPercent: 3.2,
    isIntervalWorkout: false,
  };
  assert.equal(evaluateDecouplingEligibility(steady).eligible, true);
  assert.match(evaluateDecouplingEligibility({ ...steady, movingTimeSeconds: 2400 }).reason, /45 minutes/);
  assert.match(evaluateDecouplingEligibility({ ...steady, variabilityIndex: 1.12 }).reason, /1\.08 VI/);
  assert.match(evaluateDecouplingEligibility({ ...steady, stoppedPercent: 8 }).reason, /Stopped time/);
  assert.match(evaluateDecouplingEligibility({ ...steady, aerobicDecouplingPercent: -11.2 }).reason, /warm-up/i);
  assert.match(evaluateDecouplingEligibility({ ...steady, isIntervalWorkout: true }).reason, /workouts/i);
});

test("illness is a readiness and recovery safety override", () => {
  const readiness = calculateReadiness({
    hoursSinceLastHardRide: 72,
    acuteChronicRatio: 0.9,
    subjective: { sleepQuality: 5, legFreshness: "fresh", bodyCondition: "illness", illnessSeverity: 5, motivation: 5 },
  });
  const metrics = deriveRideMetrics({ movingTimeSeconds: 3600, averagePowerWatts: 110, normalizedPowerWatts: 112, averageHeartRateBpm: 130, ftpWatts: 165 });
  const recovery = recommendRecovery(metrics, 3600, 0, { bodyCondition: "illness", illnessSeverity: 5 });
  assert.equal(readiness.score, 30);
  assert.equal(recovery.status, "illness flag");
  assert.match(recovery.nextSession, /withheld/i);
});
test("completed training today lowers remaining readiness with an auditable reason", () => {
  const subjective = { sleepQuality: 5, legFreshness: "fresh" as const, bodyCondition: "normal" as const, motivation: 5 };
  const before = calculateReadiness({ hoursSinceLastHardRide: 72, acuteChronicRatio: 0.9, subjective });
  const after = calculateReadiness({
    hoursSinceLastHardRide: 0,
    acuteChronicRatio: 0.9,
    subjective,
    todayTrainingLoad: 81,
    todayIntensityFactor: 0.885,
    todayMovingTimeSeconds: 3723,
  });

  assert.equal(before.score, 100);
  assert.equal(after.score, 54);
  assert.equal(after.postRideAdjusted, true);
  assert.match(after.adjustments[0], /81 load/);
});
