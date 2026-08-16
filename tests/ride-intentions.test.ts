import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOutdoorRouteGpx,
  buildRideIntention,
  buildRideIntentionZwo,
  outdoorRouteGpxFilename,
  pairOutdoorRouteCandidates,
  rideIntentionZwoFilename,
} from "../lib/ride-intentions.ts";

test("builds a flexible endurance intention from saved thresholds", () => {
  const intention = buildRideIntention({
    mode: "endurance",
    commitment: 60,
    ftpWatts: 200,
    lthrBpm: 166,
    confidence: "moderate",
    evidenceRationale: "Readiness and recent load support aerobic work.",
  });

  assert.equal(intention.version, "ride-intention-v1");
  assert.deepEqual(intention.duration, { targetMinutes: 60, minimumMinutes: 45, maximumMinutes: 75 });
  assert.deepEqual([intention.power.lowWatts, intention.power.highWatts], [120, 144]);
  assert.match(intention.heartRateCue, /bpm/);
  assert.equal(intention.optionalFocusBlocks.length, 1);
  assert.equal(intention.optionalFocusBlocks[0]?.optional, true);
  assert.match(intention.flexibility, /skip every focus block/i);
  assert.equal(intention.evidence.confidence, "moderate");
});

test("tempo structure scales with the selected time commitment", () => {
  const short = buildRideIntention({ mode: "tempo", commitment: 30, ftpWatts: 165 });
  const long = buildRideIntention({ mode: "tempo", commitment: 90, ftpWatts: 165 });
  assert.equal(short.optionalFocusBlocks.length, 1);
  assert.equal(long.optionalFocusBlocks.length, 2);
  assert.ok(long.optionalFocusBlocks.every((block) => block.optional));
  assert.match(short.encouragement, /not an assignment/i);
});

test("ZWO export is deterministic, escaped, and spans the target duration", () => {
  const intention = buildRideIntention({ mode: "tempo", commitment: 60, ftpWatts: 200 });
  const xml = buildRideIntentionZwo("River & Hills", intention);
  const durations = [...xml.matchAll(/Duration="(\d+)"/g)].map((match) => Number(match[1]));
  assert.match(xml, /River &amp; Hills/);
  assert.match(xml, /<tag name="FLEXIBLE" \/>/);
  assert.equal(durations.reduce((sum, duration) => sum + duration, 0), 3_600);
  assert.equal(rideIntentionZwoFilename("River & Hills", intention), "river-hills-tempo-60min.zwo");
});

test("rest intentions cannot masquerade as prescribed workouts", () => {
  const intention = buildRideIntention({ mode: "rest", commitment: 30, ftpWatts: 200 });
  assert.equal(intention.disabled, true);
  assert.equal(intention.optionalFocusBlocks.length, 0);
  assert.throws(() => buildRideIntentionZwo("Rest route", intention), /rest-day intention/i);
});

test("outdoor BRouter candidates pair with the same intention and export valid GPX", () => {
  const intention = buildRideIntention({ mode: "endurance", commitment: 60, ftpWatts: 200 });
  const choices = pairOutdoorRouteCandidates([{
    id: "candidate-1",
    distanceKm: 24.5,
    ascentMeters: 310,
    estimatedSeconds: 3_540,
    coordinates: [[-104.99, 39.74, 1_610], [-104.98, 39.75, 1_615], [-104.99, 39.74, 1_610]],
  }], intention);
  const gpx = buildOutdoorRouteGpx(choices[0]!);
  assert.equal(choices[0]?.estimatedMinutes, 59);
  assert.match(gpx, /<gpx version="1.1"/);
  assert.match(gpx, /lat="39.7400000" lon="-104.9900000"/);
  assert.match(gpx, /<ele>1610.0<\/ele>/);
  assert.equal(outdoorRouteGpxFilename(choices[0]!), "outdoor-loop-1-60min.gpx");
});
