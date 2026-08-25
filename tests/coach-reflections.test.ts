import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachIntentionReflection, matchRideIdea, type ReflectionRide } from "../lib/coach-reflections.ts";
import { buildRideIntention } from "../lib/ride-intentions.ts";
import type { SavedRideIdea } from "../lib/ride-ideas.ts";

const idea: SavedRideIdea = {
  id: "idea-1",
  version: "ride-idea-v1",
  dateIso: "2026-08-17",
  status: "selected",
  setting: "indoor",
  route: { id: "tempus-fugit", name: "Tempus Fugit", provider: "zwift", details: { world: "Watopia" } },
  intention: buildRideIntention({ mode: "endurance", commitment: 60, ftpWatts: 165, lthrBpm: 166, confidence: "moderate" }),
  thresholds: { ftpWatts: 165, weightKg: 124.7, lthrBpm: 166 },
  completedRideId: null,
  createdAt: "2026-08-17T12:00:00.000Z",
  updatedAt: "2026-08-17T12:00:00.000Z",
};

const ride = (overrides: Partial<ReflectionRide> = {}): ReflectionRide => ({
  id: "ride-1",
  name: "Zwift - Tempus Fugit in Watopia",
  routeName: "Tempus Fugit",
  startedAt: "2026-08-17T17:00:00.000Z",
  environment: "virtual",
  trainingType: "Zone 2",
  movingTimeSeconds: 58 * 60,
  trainingLoad: 42,
  intensityFactor: 0.66,
  averagePowerWatts: 108,
  normalizedPowerWatts: 112,
  averageHeartRateBpm: 142,
  averageCadenceRpm: 86,
  dataQuality: "high",
  ...overrides,
});

test("matches a saved idea only when date and setting agree", () => {
  const matched = matchRideIdea(idea, [ride()]);
  assert.equal(matched.ride?.id, "ride-1");
  assert.equal(matched.confidence, "high");
  assert.match(matched.rationale, /date, setting, and recorded route/i);

  const mismatch = matchRideIdea(idea, [ride({ environment: "outdoor" })]);
  assert.equal(mismatch.ride, null);
  assert.match(mismatch.rationale, /does not match/i);
});

test("uses a unique same-setting ride moderately but refuses ambiguous guesses", () => {
  const unique = matchRideIdea(idea, [ride({ name: "Evening Ride", routeName: null })]);
  assert.equal(unique.ride?.id, "ride-1");
  assert.equal(unique.confidence, "moderate");

  const ambiguous = matchRideIdea(idea, [
    ride({ id: "ride-1", name: "Morning Ride", routeName: null }),
    ride({ id: "ride-2", name: "Evening Ride", routeName: null }),
  ]);
  assert.equal(ambiguous.ride, null);
  assert.equal(ambiguous.candidates.length, 2);
  assert.match(ambiguous.rationale, /will not guess/i);
});

test("does not silently attach a ride that predates a revised idea", () => {
  const revised = { ...idea, updatedAt: "2026-08-17T18:00:00.000Z" };
  const result = matchRideIdea(revised, [ride()]);
  assert.equal(result.ride, null);
  assert.equal(result.candidates.length, 1);
  assert.match(result.rationale, /before this version/i);
});

test("builds a descriptive reflection and recovery adaptation without grading", () => {
  const reflection = buildCoachIntentionReflection(idea, ride(), "high", "Date, setting, and route agree.", "2026-08-17T20:00:00.000Z");
  assert.equal(reflection.evidenceConfidence, "high");
  assert.equal(reflection.adaptation.beforeMode, "endurance");
  assert.equal(reflection.adaptation.nextMode, "recovery");
  assert.match(reflection.observations[0]!.value, /within/i);
  assert.match(reflection.encouragement, /useful aerobic time/i);
  assert.doesNotMatch(JSON.stringify(reflection), /you failed|you passed|missed target|compliance:\s*\d/i);
});

test("treats a harder or shorter ride as context rather than failure", () => {
  const reflection = buildCoachIntentionReflection(idea, ride({ movingTimeSeconds: 28 * 60, normalizedPowerWatts: 150, intensityFactor: 0.91, trainingLoad: 55, trainingType: "Tempo" }), "moderate", "Only ride with this setting.");
  assert.ok(reflection.whatVaried.some((item) => /shorter/i.test(item)));
  assert.ok(reflection.whatVaried.some((item) => /stronger/i.test(item)));
  assert.equal(reflection.adaptation.nextMode, "recovery");
  assert.match(reflection.encouragement, /meaningful work/i);
});
