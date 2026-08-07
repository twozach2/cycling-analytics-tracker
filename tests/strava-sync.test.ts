import assert from "node:assert/strict";
import test from "node:test";
import { isCyclingActivity, parseReadBudget, sixMonthsBefore, syncAfterEpoch } from "../lib/strava-sync.ts";

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

test("stream enrichment leaves headroom under Strava read limits", () => {
  const headers = new Headers({
    "x-readratelimit-limit": "100,1000",
    "x-readratelimit-usage": "73,412",
  });
  assert.equal(parseReadBudget(headers), 22);
  assert.equal(parseReadBudget(new Headers()), 40);
});
