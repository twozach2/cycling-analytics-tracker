import assert from "node:assert/strict";
import test from "node:test";
import { classifyStravaActivity, ftpSnapshotForRide, isCyclingActivity, parseReadBudget, sixMonthsBefore, syncAfterEpoch } from "../lib/strava-sync.ts";

test("six-month imports use a calendar-aware cutoff", () => {
  assert.equal(sixMonthsBefore(new Date("2026-08-31T12:30:00Z")).toISOString(), "2026-02-28T12:30:00.000Z");
  assert.equal(sixMonthsBefore(new Date("2026-07-15T08:00:00Z")).toISOString(), "2026-01-15T08:00:00.000Z");
});

test("new-ride sync overlaps the previous week so deduplication can catch late uploads", () => {
  const after = syncAfterEpoch("new", new Date("2026-08-07T12:00:00Z"), "2026-08-07T10:00:00Z");
  assert.equal(new Date(after * 1000).toISOString(), "2026-07-31T10:00:00.000Z");
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
