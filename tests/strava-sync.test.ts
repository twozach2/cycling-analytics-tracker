import assert from "node:assert/strict";
import test from "node:test";
import { classifyRide, classifyStravaActivity, classifyStravaRideType, ftpSnapshotForRide, isCyclingActivity, parseReadBudget, RIDE_CLASSIFICATION_VERSION, shouldRunAutomaticSync, sixMonthsBefore, syncAfterEpoch } from "../lib/strava-sync.ts";

test("six-month imports use a calendar-aware cutoff", () => {
  assert.equal(sixMonthsBefore(new Date("2026-08-31T12:30:00Z")).toISOString(), "2026-02-28T12:30:00.000Z");
  assert.equal(sixMonthsBefore(new Date("2026-07-15T08:00:00Z")).toISOString(), "2026-01-15T08:00:00.000Z");
});

test("new-ride sync overlaps the previous week so deduplication can catch late uploads", () => {
  const after = syncAfterEpoch("new", new Date("2026-08-07T12:00:00Z"), "2026-08-07T10:00:00Z");
  assert.equal(new Date(after * 1000).toISOString(), "2026-07-31T10:00:00.000Z");
});

test("automatic sync waits 15 minutes between Strava checks", () => {
  const now = new Date("2026-08-08T12:30:00Z");
  assert.equal(shouldRunAutomaticSync(null, now), true);
  assert.equal(shouldRunAutomaticSync("2026-08-08T12:20:00Z", now), false);
  assert.equal(shouldRunAutomaticSync("2026-08-08T12:15:00Z", now), true);
});

test("the cycling filter includes Strava ride variants", () => {
  for (const sport_type of ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide", "Handcycle", "Velomobile"]) {
    assert.equal(isCyclingActivity({ sport_type }), true, sport_type);
  }
  assert.equal(isCyclingActivity({ sport_type: "Run" }), false);
});

test("Strava virtual and trainer rides are classified as indoor", () => {
  assert.deepEqual(classifyStravaActivity({ sport_type: "VirtualRide", trainer: false }), {
    environment: "virtual",
    indoor: true,
    workoutSubtype: null,
  });
  assert.deepEqual(classifyStravaActivity({ sport_type: "Ride", trainer: true, name: "ERG endurance workout" }), {
    environment: "indoor",
    indoor: true,
    workoutSubtype: "trainer_workout",
  });
  assert.equal(classifyStravaActivity({ sport_type: "Ride" }).environment, "outdoor");
});

test("Strava rides receive useful training types instead of a fixed Free ride label", () => {
  assert.equal(classifyStravaRideType({ name: "Morning Zone 2", workoutSubtype: null, intensityFactor: 0.84 }), "Zone 2");
  assert.equal(classifyStravaRideType({ name: "Friday aerobic benchmark", workoutSubtype: null, intensityFactor: 0.68 }), "Zone 2");
  assert.equal(classifyStravaRideType({ name: "Triple Flat Loops", workoutSubtype: null, intensityFactor: 0.71 }), "Zone 2");
  assert.equal(classifyStravaRideType({ name: "R.G.V.", workoutSubtype: null, intensityFactor: 0.82 }), "Tempo");
  assert.equal(classifyStravaRideType({ name: "FTP intervals", workoutSubtype: "trainer_workout", intensityFactor: 0.86 }), "Threshold");
  assert.equal(classifyStravaRideType({ name: "Coffee ride", workoutSubtype: null, intensityFactor: null }), "Free ride");
});

test("ride classification separates training stimulus from context", () => {
  assert.deepEqual(classifyRide({
    name: "Friday aerobic benchmark",
    workoutSubtype: null,
    intensityFactor: 0.68,
    movingTimeSeconds: 3600,
    variabilityIndex: 1.02,
  }), {
    trainingType: "Zone 2",
    context: "benchmark",
    confidence: "high",
    reason: "The activity name explicitly identifies a controlled Zone 2 benchmark. Context: benchmark.",
    version: RIDE_CLASSIFICATION_VERSION,
  });

  const groupRide = classifyRide({
    name: "Pacer Group Ride with Bernie",
    workoutSubtype: null,
    intensityFactor: 0.82,
    movingTimeSeconds: 3600,
    variabilityIndex: 1.08,
  });
  assert.equal(groupRide.trainingType, "Tempo");
  assert.equal(groupRide.context, "group_ride");
  assert.equal(groupRide.confidence, "moderate");
  assert.match(groupRide.reason, /IF 0\.82.*VI 1\.08/);
});

test("ride classification is conservative when intent is not explicit", () => {
  const variableRide = classifyRide({
    name: "Unstructured hills",
    workoutSubtype: null,
    intensityFactor: 0.7,
    movingTimeSeconds: 5400,
    variabilityIndex: 1.2,
  });
  assert.equal(variableRide.trainingType, "Zone 2");
  assert.equal(variableRide.context, "ordinary");
  assert.equal(variableRide.confidence, "low");

  const race = classifyRide({
    name: "Zwift Race",
    workoutSubtype: "race",
    intensityFactor: 0.84,
    variabilityIndex: 1.18,
  });
  assert.equal(race.trainingType, "Tempo");
  assert.equal(race.context, "race");
  assert.equal(race.confidence, "low");

  assert.equal(
    classifyRide({ name: "VO2 workout 5x3", workoutSubtype: "trainer_workout", intensityFactor: 0.93 }).trainingType,
    "VO2",
  );
  assert.equal(classifyRide({ name: "Sweet Spot 3x12", workoutSubtype: "trainer_workout", intensityFactor: 0.9 }).trainingType, "Sweet Spot");
  assert.equal(classifyRide({ name: "Sweet Spot 3x12", workoutSubtype: null, intensityFactor: 0.9 }).context, "structured_workout");
  assert.equal(classifyRide({ name: "Hard ride", workoutSubtype: null, intensityFactor: 1.05 }).trainingType, "Threshold");
});

test("FTP snapshots use dated history and never fall forward to today's FTP", () => {
  const history = [
    { effectiveAt: "2026-07-01T00:00:00Z", ftpWatts: 160 },
    { effectiveAt: "2026-08-01T00:00:00Z", ftpWatts: 165 },
  ];
  assert.deepEqual(ftpSnapshotForRide({ startedAt: "2026-07-15T12:00:00Z", history, currentFtpWatts: 180 }), { ftpWatts: 160, source: "ftp_history" });
  assert.deepEqual(ftpSnapshotForRide({ startedAt: "2026-06-15T12:00:00Z", history, currentFtpWatts: 180, existingFtpWatts: 155, existingSource: "legacy_import" }), { ftpWatts: 155, source: "legacy_import" });
});

test("stream enrichment leaves headroom under Strava read limits", () => {
  const headers = new Headers({
    "x-readratelimit-limit": "100,1000",
    "x-readratelimit-usage": "73,412",
  });
  assert.equal(parseReadBudget(headers), 22);
  assert.equal(parseReadBudget(new Headers()), 40);
});
