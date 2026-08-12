import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachReport, detectEnduranceTrend, type CoachRide } from "../lib/coach.ts";

const ride = (overrides: Partial<CoachRide> = {}): CoachRide => ({
  id: "ride",
  name: "Zone 2",
  date: "2026-08-01T12:00:00Z",
  trainingType: "Zone 2",
  context: "ordinary",
  environment: "virtual",
  movingTimeSeconds: 3600,
  trainingLoad: 45,
  intensityFactor: 0.68,
  averagePower: 115,
  averageHeartRate: 135,
  powerHeartRateRatio: 0.852,
  classificationConfidence: "high",
  dataQualityLevel: "high",
  ...overrides,
});

test("does not declare a trend from one ride", () => {
  const trend = detectEnduranceTrend([ride()]);
  assert.equal(trend.status, "insufficient");
  assert.equal(trend.direction, "unknown");
});

test("requires five comparable rides across three weeks for an established trend", () => {
  const rides = [
    ride({ id: "1", date: "2026-06-01T12:00:00Z", powerHeartRateRatio: 0.78 }),
    ride({ id: "2", date: "2026-06-08T12:00:00Z", powerHeartRateRatio: 0.79 }),
    ride({ id: "3", date: "2026-06-15T12:00:00Z", powerHeartRateRatio: 0.81 }),
    ride({ id: "4", date: "2026-06-22T12:00:00Z", powerHeartRateRatio: 0.84 }),
    ride({ id: "5", date: "2026-06-29T12:00:00Z", powerHeartRateRatio: 0.85 }),
  ];
  const trend = detectEnduranceTrend(rides);
  assert.equal(trend.status, "established");
  assert.equal(trend.direction, "improving");
  assert.equal(trend.confidence, "high");
});

test("illness and substantial pain withhold training instead of fabricating a workout", () => {
  const base = {
    rides: [ride({ date: "2026-08-09T12:00:00Z" })],
    readinessScore: 90,
    checkInRecorded: true,
    referenceDate: "2026-08-10T12:00:00Z",
  } as const;
  const illness = buildCoachReport({ ...base, subjective: { bodyCondition: "illness", illnessSeverity: 5, sleepQuality: 4, legFreshness: "normal", motivation: 4 } });
  const pain = buildCoachReport({ ...base, subjective: { bodyCondition: "pain_concern", painSeverity: 6, sleepQuality: 4, legFreshness: "normal", motivation: 4 } });
  assert.equal(illness.recommendationWithheld, true);
  assert.equal(pain.recommendationWithheld, true);
  assert.match(illness.primary, /withheld/i);
});

test("hard advice is capped when the check-in or recent evidence is incomplete", () => {
  const report = buildCoachReport({
    rides: [ride({ date: "2026-08-08T12:00:00Z", dataQualityLevel: "low" })],
    readinessScore: 92,
    subjective: { bodyCondition: "normal", sleepQuality: 5, legFreshness: "fresh", motivation: 5 },
    checkInRecorded: false,
    referenceDate: "2026-08-10T12:00:00Z",
  });
  assert.equal(report.mode, "endurance");
  assert.equal(report.confidence, "low");
  assert.ok(report.cautions.some((reason) => reason.includes("check-in")));
  assert.ok(report.weeklyPlan.every((day) => !day.session.includes("Tempo")));
});

test("coach exposes every recommendation input and creates an adaptive seven-day plan", () => {
  const rides = Array.from({ length: 6 }, (_, index) => ride({
    id: String(index),
    date: new Date(Date.UTC(2026, 6, 20 + index * 3, 12)).toISOString(),
  }));
  const report = buildCoachReport({
    rides,
    readinessScore: 84,
    subjective: { bodyCondition: "normal", sleepQuality: 5, legFreshness: "fresh", motivation: 5 },
    checkInRecorded: true,
    referenceDate: "2026-08-10T12:00:00Z",
  });
  assert.equal(report.weeklyPlan.length, 7);
  assert.ok(report.positives.length >= 3);
  assert.equal(report.weeklyPlan[0].adaptive, false);
  assert.ok(report.weeklyPlan.slice(1).every((day) => day.adaptive));
  assert.equal(report.algorithmVersion, "coach-v3");
});
test("endurance trend excludes rides outside the comparable intensity band", () => {
  const trend = detectEnduranceTrend([
    ride({ id: "steady-1", date: "2026-07-01T12:00:00Z", intensityFactor: 0.66, powerHeartRateRatio: 0.8 }),
    ride({ id: "steady-2", date: "2026-07-08T12:00:00Z", intensityFactor: 0.67, powerHeartRateRatio: 0.82 }),
    ride({ id: "hard-outlier", date: "2026-07-15T12:00:00Z", intensityFactor: 0.79, powerHeartRateRatio: 0.9 }),
  ]);
  assert.equal(trend.supportingRides, 2);
  assert.equal(trend.status, "possible");
  assert.ok(trend.evidence.some((entry) => entry.includes("0.67 cohort median")));
});
test("an objectively hard ride completed today closes the plan even when labeled Free ride", () => {
  const report = buildCoachReport({
    rides: [ride({
      id: "today-group-ride",
      name: "Pacer group ride",
      date: "2026-08-10T19:59:47Z",
      trainingType: "Free ride",
      context: "group_ride",
      movingTimeSeconds: 3723,
      trainingLoad: 81,
      intensityFactor: 0.885,
    })],
    readinessScore: 54,
    subjective: { bodyCondition: "normal", sleepQuality: 5, legFreshness: "fresh", motivation: 5 },
    checkInRecorded: true,
    referenceDate: "2026-08-10T21:15:00Z",
  });

  assert.equal(report.mode, "rest");
  assert.equal(report.primary, "Training complete for today");
  assert.equal(report.evidenceSummary.todayRides, 1);
  assert.equal(report.evidenceSummary.todayTrainingLoad, 81);
  assert.equal(report.evidenceSummary.recentHardSessions, 1);
  assert.ok(report.cautions.some((reason) => reason.includes("closes the intensity window")));
});

test("celebrates quality work without grading the rider against a plan", () => {
  const history = Array.from({ length: 5 }, (_, index) => ride({
    id: `history-${index}`,
    date: new Date(Date.UTC(2026, 6, 15 + index * 5, 12)).toISOString(),
  }));
  const report = buildCoachReport({
    rides: [
      ride({ id: "today-tempo", name: "Tempo ride", date: "2026-08-10T18:00:00Z", trainingType: "Tempo", trainingLoad: 70, intensityFactor: 0.84 }),
      ...history,
    ],
    readinessScore: 54,
    subjective: { bodyCondition: "normal", sleepQuality: 5, legFreshness: "fresh", motivation: 5 },
    checkInRecorded: true,
    referenceDate: "2026-08-10T21:15:00Z",
  });

  assert.equal(report.rideReflection.contribution, "quality_work");
  assert.match(report.rideReflection.headline, /Strong work/i);
  assert.doesNotMatch(`${report.rideReflection.headline} ${report.rideReflection.detail}`, /pass|fail|matched|exceeded/i);
  assert.equal(report.weeklyPlan[1].session, "Easy spin option · 40 min");
  assert.match(report.weeklyPlan[1].purpose, /quality work settle/i);
});

test("describes aerobic riding as useful even when effort naturally varies", () => {
  const report = buildCoachReport({
    rides: [ride({ id: "today-aerobic", date: "2026-08-10T18:00:00Z", trainingType: "Zone 2", trainingLoad: 42, intensityFactor: 0.68 })],
    readinessScore: 64,
    subjective: { bodyCondition: "normal", sleepQuality: 4, legFreshness: "normal", motivation: 4 },
    checkInRecorded: true,
    referenceDate: "2026-08-10T21:15:00Z",
  });

  assert.equal(report.rideReflection.contribution, "aerobic_endurance");
  assert.match(report.rideReflection.headline, /Nice work/i);
  assert.match(report.rideReflection.encouragement, /does not need to stay in one zone/i);
  assert.match(report.weeklyPlan[1].purpose, /aerobic work/i);
});
