import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadiness, deriveRideMetrics, evaluateDecouplingEligibility, recommendRecovery } from "../lib/metrics.ts";

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

  assert.ok(readiness.score >= 85);
  assert.equal(readiness.label, "Ready for hard work");
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
