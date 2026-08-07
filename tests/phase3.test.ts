import assert from "node:assert/strict";
import test from "node:test";
import { derivePowerDuration, type ActivitySample } from "../lib/activity-parser.ts";
import { buildWeeklyPlan, predictFtp, projectFtpGoal, recommendWorkout } from "../lib/phase3.ts";

test("derives rolling power evidence from timestamped samples", () => {
  const samples: ActivitySample[] = Array.from({ length: 1201 }, (_, second) => ({
    time: second * 1000,
    power: 200,
    heartRate: 140,
    cadence: 88,
    distance: second * 8,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  const bests = derivePowerDuration(samples);
  assert.equal(bests.find((best) => best.durationSeconds === 1200)?.bestPowerWatts, 200);
});

test("FTP prediction returns a range and evidence rather than false precision", () => {
  const prediction = predictFtp([
    { durationSeconds: 1200, bestPowerWatts: 176 },
    { durationSeconds: 1800, bestPowerWatts: 171 },
    { durationSeconds: 3600, bestPowerWatts: 164 },
  ], 165);
  assert.equal(prediction.confidence, "high");
  assert.ok(prediction.minimumWatts! < prediction.maximumWatts!);
  assert.ok(prediction.signals.some((signal) => signal.includes("20m best")));
});

test("goal projection presents three scenarios", () => {
  const projection = projectFtpGoal(165, 200, "2026-08-07");
  assert.ok(projection.aggressiveDate! < projection.currentTrendDate!);
  assert.ok(projection.currentTrendDate! < projection.conservativeDate!);
  assert.match(projection.disclaimer, /not a promise/i);
});

test("pain makes workout guidance and the generated week cautious", () => {
  const input = { readinessScore: 80, kneePain: 3, acuteChronicRatio: 1, recentHardSessions: 0 };
  assert.match(recommendWorkout(input).primary, /Rest|recovery/);
  assert.equal(buildWeeklyPlan(input)[0].session, "Rest + mobility");
});
