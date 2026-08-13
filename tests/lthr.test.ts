import assert from "node:assert/strict";
import test from "node:test";
import { detectLthrCandidate } from "../lib/lthr.ts";

function thresholdRide(overrides: Partial<Parameters<typeof detectLthrCandidate>[0]> = {}) {
  const seconds = 31 * 60;
  return {
    rideId: "threshold-ride",
    rideName: "Controlled threshold effort",
    startedAt: "2026-08-07T01:27:54Z",
    movingTimeSeconds: seconds,
    rideType: "FTP Test",
    rideContext: "benchmark",
    ftpAtRideWatts: 165,
    time: Array.from({ length: seconds }, (_, index) => index),
    watts: Array.from({ length: seconds }, (_, index) => 164 + Math.sin(index / 20) * 3),
    heartRate: Array.from({ length: seconds }, (_, index) => 164 + Math.min(3, index / 600)),
    ...overrides,
  };
}

test("detects a reviewable high-confidence LTHR candidate from a controlled field test", () => {
  const candidate = detectLthrCandidate(thresholdRide());
  assert.ok(candidate);
  assert.equal(candidate.lthrBpm, 166);
  assert.equal(candidate.confidence, "high");
  assert.ok(candidate.powerPercentFtp >= 98 && candidate.powerPercentFtp <= 102);
  assert.equal(candidate.algorithmVersion, "lthr-candidate-v1");
});

test("accepts a sub-30-minute threshold-like effort only as moderate confidence", () => {
  const seconds = 28 * 60;
  const candidate = detectLthrCandidate(thresholdRide({
    movingTimeSeconds: seconds,
    rideType: "Threshold",
    rideContext: "ordinary",
    time: Array.from({ length: seconds }, (_, index) => index),
    watts: Array.from({ length: seconds }, (_, index) => index >= 26 * 60 ? 110 : 165 + Math.sin(index / 12) * 5),
    heartRate: Array.from({ length: seconds }, (_, index) => 150 + Math.min(16, index / 30)),
  }));
  assert.ok(candidate);
  assert.equal(candidate.lthrBpm, 166);
  assert.equal(candidate.confidence, "moderate");
  assert.match(candidate.limitations.join(" "), /shorter than the standard 30-minute/i);
});

test("withholds candidates from variable or still-ramping efforts", () => {
  const seconds = 25 * 60;
  const variable = thresholdRide({ movingTimeSeconds: seconds, time: Array.from({ length: seconds }, (_, index) => index), watts: Array.from({ length: seconds }, (_, index) => index % 60 < 30 ? 235 : 90), heartRate: Array.from({ length: seconds }, (_, index) => 160 + Math.sin(index / 200)) });
  const ramping = thresholdRide({ movingTimeSeconds: seconds, time: Array.from({ length: seconds }, (_, index) => index), watts: Array.from({ length: seconds }, () => 165), heartRate: Array.from({ length: seconds }, (_, index) => 120 + index / 30) });
  assert.equal(detectLthrCandidate(variable), null);
  assert.equal(detectLthrCandidate(ramping), null);
});
